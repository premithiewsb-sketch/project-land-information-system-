import io
from datetime import datetime
from flask import Blueprint, request, jsonify, send_file
from core import load_records, viewer_or_admin_required, admin_required

documents_bp = Blueprint('documents', __name__)

@documents_bp.route("/api/print-card/<ulpin>", methods=["GET", "POST"])
@viewer_or_admin_required
def print_property_card(ulpin):
    records = load_records()
    record = next((r for r in records if r.get("ulpin") == ulpin), None)
    if not record: return jsonify({"error": "Not found."}), 404
    map_image = None
    if request.method == "POST":
        map_image = (request.get_json() or {}).get("map_image")
    try:
        from report_generator import generate_property_card_pdf
        pdf_bytes = generate_property_card_pdf(record, map_image_base64=map_image)
        return send_file(io.BytesIO(pdf_bytes), mimetype="application/pdf", as_attachment=True, download_name=f"Card_{ulpin}.pdf")
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@documents_bp.route("/api/export-village", methods=["GET"])
@admin_required
def export_village_ledger():
    records = load_records()
    village = request.args.get("village", "").strip()
    if village:
        records = [r for r in records if r.get("location", {}).get("village", "").lower() == village.lower()]
    if not records: return jsonify({"error": "No records."}), 404
    try:
        from report_generator import generate_village_excel
        excel_bytes = generate_village_excel(records, village_name=village or "All")
        return send_file(io.BytesIO(excel_bytes), mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", as_attachment=True, download_name="Ledger.xlsx")
    except Exception as e:
        return jsonify({"error": str(e)}), 500
