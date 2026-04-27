import uuid
import random
from datetime import datetime
from flask import Blueprint, request, jsonify, session
from core import (
    load_records, save_records, viewer_or_admin_required, role_required,
    _strip_b64_from_list, _mask_owner_for_viewer, _log_audit,
    _generate_ulpin, _update_nested, _apply_filters_to_records
)

records_bp = Blueprint('records', __name__)

def generate_ulpin(state_name, district_name):
    """Generate a unique 14-digit ULPIN."""
    state_code = str(abs(hash(state_name)) % 90 + 10)
    dist_code = str(abs(hash(district_name)) % 90 + 10)
    parcel_code = ''.join([str(random.randint(0, 9)) for _ in range(10)])
    return f"{state_code}{dist_code}{parcel_code}"

@records_bp.route("/api/records", methods=["GET"])
@viewer_or_admin_required
def get_records():
    """Fetch all land records with role-based masking and filtering."""
    records = load_records()
    records = _strip_b64_from_list(records)
    role = (session.get("role") or "").lower()
    
    # Exclude soft-deleted records for non-admins
    if role not in ("admin", "superadmin"):
        records = [r for r in records if not r.get("deleted")]
    
    # Mask owner details for public viewers
    if role == "viewer":
        records = [_mask_owner_for_viewer(rec) for rec in records]
        
    return jsonify(records)

@records_bp.route("/api/records/<record_id>", methods=["GET"])
@viewer_or_admin_required
def get_record(record_id):
    """Fetch a single land record by its ID."""
    records = load_records()
    record = next((r for r in records if r["_id"] == record_id), None)
    
    if not record:
        return jsonify({"error": "Record not found."}), 404
        
    role = (session.get("role") or "").lower()
    if record.get("deleted") and role not in ("admin", "superadmin"):
        return jsonify({"error": "Record not found."}), 404
        
    if role == "viewer":
        record = _mask_owner_for_viewer(record)
        
    return jsonify(record)

@records_bp.route("/api/records/search", methods=["GET"])
@viewer_or_admin_required
def search_records():
    """Search records using a global text query."""
    query = request.args.get("q", "").strip().lower()
    if not query:
        return jsonify({"error": "Search query parameter 'q' is required."}), 400
        
    records = load_records()
    results = _apply_filters_to_records(records, {"search": query})
    
    role = (session.get("role") or "").lower()
    if role not in ("admin", "superadmin"):
        results = [r for r in results if not r.get("deleted")]
    if role == "viewer":
        results = [_mask_owner_for_viewer(rec) for rec in results]
        
    return jsonify(results)

@records_bp.route("/api/records/filter", methods=["GET"])
@viewer_or_admin_required
def filter_records():
    """Advanced filtering of records by location and attributes."""
    records = load_records()
    params = {k: request.args.get(k, "") for k in ["state", "district", "village", "land_use", "search"]}
    filtered = _apply_filters_to_records(records, params)
    
    role = (session.get("role") or "").lower()
    if role not in ("admin", "superadmin"):
        filtered = [r for r in filtered if not r.get("deleted")]
    
    filtered = _strip_b64_from_list(filtered)
    return jsonify(filtered)

@records_bp.route("/api/location-catalog", methods=["GET"])
@viewer_or_admin_required
def location_catalog():
    """Return the hierarchy of state > district > village for dropdowns."""
    records = load_records()
    catalog = {}
    for rec in records:
        loc = rec.get("location", {})
        state, dist, vill = loc.get("state"), loc.get("district"), loc.get("village")
        if not all([state, dist, vill]): continue
        
        if state not in catalog: catalog[state] = {}
        if dist not in catalog[state]: catalog[state][dist] = set()
        catalog[state][dist].add(vill)
    
    # Format for JSON
    result = {}
    for s in sorted(catalog.keys()):
        result[s] = {d: sorted(list(v)) for d, v in sorted(catalog[s].items())}
    return jsonify(result)

@records_bp.route("/api/records", methods=["POST"])
@role_required("admin", "superadmin", "officer")
def create_record():
    """Create a new land record with geometry validation."""
    data = request.get_json() or {}
    required_fields = ["khasra_no", "khata_no", "location", "geometry", "land_use", "owner_name"]
    missing = [f for f in required_fields if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400
    
    username = session.get("username", "admin")
    
    # 1. Geometry Validation & Metrics
    geometry = data.get("geometry")
    if not geometry:
        return jsonify({"error": "Geometry is required."}), 400
        
    from gis_processor import validate_polygon, calculate_area, check_overlap, get_centroid, calculate_perimeter
    validation = validate_polygon(geometry)
    if not validation["valid"]:
        return jsonify({"error": "Invalid Geometry", "details": validation["errors"]}), 400
        
    # 2. Overlap Check
    records = load_records()
    overlap = check_overlap(geometry, [r for r in records if not r.get("deleted")])
    if overlap["overlaps"]:
        return jsonify({
            "error": "Spatial Overlap Detected", 
            "conflicting_records": overlap["conflicting_records"]
        }), 409

    # 3. Auto-fill Data
    area_data = calculate_area(geometry)
    centroid = get_centroid(geometry)
    
    loc = data.get("location", {})
    state = loc.get("state", "Unknown")
    district = loc.get("district", "Unknown")
    
    ulpin = data.get("ulpin")
    if not ulpin or len(str(ulpin)) < 10:
        ulpin = generate_ulpin(state, district)
        # Ensure uniqueness
        while any(r.get("ulpin") == ulpin for r in records):
            ulpin = generate_ulpin(state, district)

    new_record = {
        "_id": str(uuid.uuid4()),
        "ulpin": ulpin,
        "khasra_no": data.get("khasra_no", "N/A"),
        "khata_no": data.get("khata_no", "N/A"),
        "location": {
            "state": state,
            "district": district,
            "village": loc.get("village", "Unknown")
        },
        "owner": {
            "name": data.get("owner_name", "N/A"),
            "share_pct": data.get("share_pct", 100),
            "aadhaar_mask": data.get("aadhaar_mask", "XXXX-XXXX-XXXX"),
            "proof_doc_b64": data.get("owner_proof_doc_b64")
        },
        "attributes": {
            "area_ha": area_data.get("area_ha", 0),
            "land_use": data.get("land_use", "Other"),
            "circle_rate_inr": data.get("circle_rate_inr", 0),
            "centroid": centroid,
            "perimeter_m": calculate_perimeter(geometry).get("perimeter_m", 0)
        },
        "geometry": geometry,
        "mutation_history": [],
        "deleted": False
    }
    
    records.append(new_record)
    save_records(records)
    
    _log_audit('create', username, new_record["_id"], {'ulpin': ulpin, 'khasra_no': new_record["khasra_no"]})
    return jsonify({"success": True, "record": new_record}), 201

@records_bp.route("/api/records/<record_id>", methods=["PUT"])
@role_required("admin", "superadmin", "officer")
def update_record(record_id):
    """Update a record or perform an ownership mutation."""
    data = request.get_json() or {}
    records = load_records()
    record = next((r for r in records if r["_id"] == record_id), None)
    
    if not record:
        return jsonify({"error": "Record not found."}), 404

    from gis_processor import validate_polygon, calculate_area, get_centroid, calculate_perimeter

    # --- Scenario A: Ownership Mutation ---
    if data.get("mutation") and data.get("new_owner_name"):
        old_owner = record.get("owner", {})
        mutation_entry = {
            "previous_owner": old_owner.get("name", "Unknown"),
            "previous_share_pct": old_owner.get("share_pct", 0),
            "previous_aadhaar": old_owner.get("aadhaar_mask", "XXXX-XXXX-XXXX"),
            "previous_proof_doc": old_owner.get("proof_doc_b64"),
            "mutation_date": data.get("mutation_date", datetime.now().strftime("%Y-%m-%d")),
            "mutation_type": data.get("mutation_type", "Sale Deed"),
            "mutation_ref": data.get("mutation_ref", f"MUT-{datetime.now().strftime('%Y')}-{random.randint(10000, 99999)}"),
            "proof_doc_b64": data.get("mutation_proof_doc_b64")
        }
        if "mutation_history" not in record: record["mutation_history"] = []
        record["mutation_history"].append(mutation_entry)
        record["owner"] = {
            "name": data["new_owner_name"],
            "share_pct": data.get("new_share_pct", 100),
            "aadhaar_mask": data.get("new_aadhaar_mask", "XXXX-XXXX-XXXX")
        }
        
        # Mutations can also update location/geometry if provided
        if "location" in data: record["location"] = data["location"]
        if "geometry" in data:
            val = validate_polygon(data["geometry"])
            if val["valid"]:
                record["geometry"] = data["geometry"]
                record["attributes"]["area_ha"] = calculate_area(data["geometry"]).get("area_ha", 0)
                record["attributes"]["centroid"] = get_centroid(data["geometry"])
                record["attributes"]["perimeter_m"] = calculate_perimeter(data["geometry"]).get("perimeter_m", 0)

    # --- Scenario B: Regular Field Updates ---
    else:
        for field in ["khasra_no", "khata_no"]:
            if field in data: record[field] = data[field]
        
        if "land_use" in data: _update_nested(record, "attributes", "land_use", data["land_use"])
        if "circle_rate_inr" in data: _update_nested(record, "attributes", "circle_rate_inr", data["circle_rate_inr"])
        if "share_pct" in data: _update_nested(record, "owner", "share_pct", data["share_pct"])
        if "aadhaar_mask" in data: _update_nested(record, "owner", "aadhaar_mask", data["aadhaar_mask"])
        if "location" in data: record["location"] = data["location"]
        if "owner_proof_doc_b64" in data: _update_nested(record, "owner", "proof_doc_b64", data["owner_proof_doc_b64"])
        
        if "geometry" in data:
            val = validate_polygon(data["geometry"])
            if not val["valid"]:
                return jsonify({"error": "Invalid geometry.", "details": val["errors"]}), 400
            record["geometry"] = data["geometry"]
            
            # Check for overlaps with other records
            from gis_processor import check_overlap
            others = [r for r in records if r["_id"] != record_id and not r.get("deleted")]
            overlap_result = check_overlap(data["geometry"], others)
            if overlap_result.get("overlaps"):
                return jsonify({"error": "Parcel overlap detected.", "conflicting_records": overlap_result["conflicting_records"]}), 409
                
            record["attributes"]["area_ha"] = calculate_area(data["geometry"]).get("area_ha", 0)
            record["attributes"]["centroid"] = get_centroid(data["geometry"])
            record["attributes"]["perimeter_m"] = calculate_perimeter(data["geometry"]).get("perimeter_m", 0)

    save_records(records)
    
    username = session.get("username", "admin")
    _log_audit('update', username, record_id, {'ulpin': record.get('ulpin'), 'khasra_no': record.get('khasra_no')})
    
    return jsonify({"success": True, "record": record})

@records_bp.route("/api/records/<record_id>", methods=["DELETE"])
@role_required("admin", "superadmin", "officer")
def delete_record(record_id):
    """
    Safely delete a record.
    - If active: Soft-delete (move to trash).
    - If already in trash: Hard-delete (permanent) if user is Admin/Superadmin.
    """
    records = load_records()
    record_index = next((i for i, r in enumerate(records) if r["_id"] == record_id), None)
    
    if record_index is None:
        return jsonify({"error": "Record not found."}), 404
        
    record = records[record_index]
    role = (session.get("role") or "").lower()
    username = session.get("username", "admin")
    
    if record.get("deleted"):
        # Record is already in trash. Only Admins can permanently remove it.
        if role in ("admin", "superadmin"):
            records.pop(record_index)
            save_records(records)
            _log_audit('hard_delete', username, record_id, {'khasra_no': record.get('khasra_no')})
            return jsonify({"success": True, "message": "Record permanently deleted from database."})
        else:
            return jsonify({"error": "Only administrators can permanently delete records."}), 403
    else:
        # Soft delete the record
        record["deleted"] = True
        record["deleted_at"] = datetime.now().isoformat() + "Z"
        record["deleted_by"] = username
        save_records(records)
        _log_audit('soft_delete', username, record_id, {'khasra_no': record.get('khasra_no')})
        return jsonify({"success": True, "message": "Record moved to trash."})

@records_bp.route("/api/records/<record_id>/restore", methods=["POST"])
@role_required("admin", "superadmin")
def restore_record(record_id):
    """Restore a soft-deleted record."""
    records = load_records()
    record = next((r for r in records if r.get("_id") == record_id), None)
    if not record: return jsonify({"error": "Not found."}), 404
    record["deleted"] = False
    record.pop("deleted_by", None)
    record.pop("deleted_at", None)
    save_records(records)
    return jsonify({"success": True})

import io
import base64
from fpdf import FPDF
import qrcode
from flask import send_file

@records_bp.route("/api/records/<ulpin>/card", methods=["POST"])
@viewer_or_admin_required
def generate_property_card(ulpin):
    """Generate a PDF Property Card for a given ULPIN."""
    records = load_records()
    record = next((r for r in records if r.get("ulpin") == ulpin), None)
    if not record:
        return jsonify({"error": "Record not found."}), 404
        
    data = request.get_json() or {}
    map_image_b64 = data.get("map_image")
    
    # PDF Configuration
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("helvetica", "B", 18)
    
    # Header
    pdf.set_text_color(234, 88, 12) # Orange-600
    pdf.cell(0, 10, "GOVERNMENT OF INDIA", ln=True, align="C")
    pdf.set_font("helvetica", "B", 14)
    pdf.set_text_color(31, 41, 55) # Gray-800
    pdf.cell(0, 8, "BHOOMI-LIMS PROPERTY CARD", ln=True, align="C")
    pdf.ln(5)
    
    # Horizontal Line
    pdf.set_draw_color(209, 213, 219)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(10)
    
    # Main Info Grid
    pdf.set_font("helvetica", "B", 10)
    pdf.set_fill_color(249, 250, 251)
    
    col_width = 45
    def add_info_row(label, value):
        pdf.set_font("helvetica", "B", 9)
        pdf.set_text_color(107, 114, 128)
        pdf.cell(col_width, 8, f"{label}:", border=0)
        pdf.set_font("helvetica", "", 10)
        pdf.set_text_color(0, 0, 0)
        pdf.cell(0, 8, str(value), ln=True)

    add_info_row("ULPIN", record.get("ulpin", "N/A"))
    add_info_row("Khasra No", record.get("khasra_no", "N/A"))
    add_info_row("Khata No", record.get("khata_no", "N/A"))
    add_info_row("Area (Hectares)", f"{record.get('attributes', {}).get('area_ha', 0):.4f}")
    add_info_row("Village", record.get("location", {}).get("village", "N/A"))
    add_info_row("District", record.get("location", {}).get("district", "N/A"))
    add_info_row("State", record.get("location", {}).get("state", "N/A"))
    
    # Owner Info
    pdf.ln(5)
    pdf.set_font("helvetica", "B", 11)
    pdf.cell(0, 10, "OWNERSHIP DETAILS", ln=True)
    pdf.set_font("helvetica", "", 10)
    owner = record.get("owner", {})
    add_info_row("Primary Owner", owner.get("name", "N/A"))
    add_info_row("Share Percentage", f"{owner.get('share_pct', 100)}%")
    
    # Map Image
    if map_image_b64:
        try:
            img_data = base64.b64decode(map_image_b64.split(",")[1])
            img_io = io.BytesIO(img_data)
            # Position at bottom right or below text
            y_pos = pdf.get_y() + 10
            if y_pos > 180: # Start new page if no space
                pdf.add_page()
                y_pos = 20
            pdf.image(img_io, x=10, y=y_pos, w=120)
            pdf.set_y(y_pos + 70)
        except Exception as e:
            print(f"PDF Map Error: {e}")

    # QR Code for Verification
    qr_data = f"https://lims-india.gov.in/verify/{ulpin}"
    qr = qrcode.QRCode(version=1, box_size=10, border=1)
    qr.add_data(qr_data)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white")
    
    qr_io = io.BytesIO()
    qr_img.save(qr_io, format="PNG")
    qr_io.seek(0)
    
    # Place QR code in top right
    pdf.image(qr_io, x=165, y=30, w=30)
    pdf.set_font("helvetica", "I", 7)
    pdf.set_xy(165, 60)
    pdf.cell(30, 5, "Scan to Verify", align="C")

    # Mutation History Table
    pdf.set_xy(10, pdf.get_y() + 10)
    pdf.set_font("helvetica", "B", 11)
    pdf.cell(0, 10, "MUTATION HISTORY", ln=True)
    
    mutations = record.get("mutation_history", [])
    if not mutations:
        pdf.set_font("helvetica", "I", 9)
        pdf.cell(0, 8, "No prior mutations recorded.", ln=True)
    else:
        pdf.set_font("helvetica", "B", 8)
        pdf.set_fill_color(243, 244, 246)
        pdf.cell(30, 8, "Date", 1, 0, "C", True)
        pdf.cell(30, 8, "Type", 1, 0, "C", True)
        pdf.cell(80, 8, "Previous Owner", 1, 0, "C", True)
        pdf.cell(50, 8, "Reference", 1, 1, "C", True)
        
        pdf.set_font("helvetica", "", 8)
        for m in mutations:
            pdf.cell(30, 7, str(m.get("mutation_date", "N/A")), 1)
            pdf.cell(30, 7, str(m.get("mutation_type", "N/A")), 1)
            pdf.cell(80, 7, str(m.get("previous_owner", "N/A")), 1)
            pdf.cell(50, 7, str(m.get("mutation_ref", "N/A")), 1, 1)

    # Footer
    pdf.set_y(-25)
    pdf.set_font("helvetica", "I", 8)
    pdf.set_text_color(156, 163, 175)
    pdf.cell(0, 10, f"Document Generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", align="C")
    pdf.ln(5)
    pdf.cell(0, 10, "This is a computer-generated document and does not require a physical signature.", align="C")

    # Return PDF
    pdf_output = pdf.output()
    return send_file(
        io.BytesIO(pdf_output),
        mimetype="application/pdf",
        as_attachment=True,
        download_name=f"Property_Card_{ulpin}.pdf"
    )
