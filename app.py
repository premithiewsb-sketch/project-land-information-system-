"""
app.py - Flask REST API Server for India LIMS
Handles authentication, session management, RBAC, CRUD operations,
spatial calculations, and document generation.
"""

import os
import sys
import io
import json
import uuid
import random
import string
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from datetime import datetime, timedelta
from functools import wraps

from flask import (
    Flask, render_template, request, jsonify, session,
    send_file, redirect, url_for
)
from werkzeug.security import generate_password_hash, check_password_hash
from pymongo import MongoClient, ReplaceOne
import certifi
from itsdangerous import URLSafeTimedSerializer

from config import (
    SECRET_KEY, DEBUG, HOST, PORT, MONGO_URI
)
from utils import resource_path


# --- App Configuration ---
app = Flask(__name__)
app.secret_key = SECRET_KEY

@app.route('/ping', methods=['GET'])
def ping():
    """Health check endpoint for UptimeRobot/Render."""
    return jsonify({"status": "alive"}), 200

@app.after_request
def add_header(response):
    """Prevent caching so users cannot use the back button to view secured pages or login page after login/logout."""
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

# Session persistence: keep users signed in for 30 days
app.permanent_session_lifetime = timedelta(days=30)

# Database Setup (MongoDB)
# Skip connecting during pytest runs to avoid noisy prints and external dependencies
if not os.environ.get('PYTEST_CURRENT_TEST'):
    try:
        mongo_client = MongoClient(MONGO_URI, tlsCAFile=certifi.where(), serverSelectionTimeoutMS=5000)
        db = mongo_client.get_database("indialims")
        users_collection = db.users
        records_collection = db.records
        feedback_collection = db.feedback
        print("Successfully connected to MongoDB Cluster.")
    except Exception as e:
        print(f"MongoDB connection error: {e}")
        # Application will likely fail if DB isn't reached, but we catch to print.
else:
    # During tests we provide fallback in-memory placeholders for collections
    mongo_client = None
    db = None
    users_collection = None
    records_collection = None
    feedback_collection = None

# Override data paths for PyInstaller
DATA_DIR = resource_path("data")
RECORDS_FILE = os.path.join(DATA_DIR, "records.json")
USERS_FILE = os.path.join(DATA_DIR, "users.json")
FEEDBACK_FILE = os.path.join(DATA_DIR, "feedback.json")



# --- Data Access Helpers ---


def load_users():
    return list(users_collection.find({}, {"_id": 0}))


def save_users(users):
    if not users:
        users_collection.delete_many({})
        return
    requests = [ReplaceOne({"user_id": u["user_id"]}, u, upsert=True) for u in users]
    users_collection.bulk_write(requests)
    # Remove deleted ones
    users_collection.delete_many({"user_id": {"$nin": [u["user_id"] for u in users]}})


def load_records():
    records = list(records_collection.find({}))
    for r in records:
        if "_id" in r:
            r["_id"] = str(r["_id"])
    return records


def save_records(records):
    if not records:
        records_collection.delete_many({})
        return
    # Note: JSON structure uses string `_id` so we sync on it without mapping to Mongo ObjectId
    requests = [ReplaceOne({"_id": r["_id"]}, r, upsert=True) for r in records]
    records_collection.bulk_write(requests)
    records_collection.delete_many({"_id": {"$nin": [r["_id"] for r in records]}})


def load_feedback():
    return list(feedback_collection.find({}, {"_id": 0}))


def save_feedback(feedback_data):
    if not feedback_data:
        feedback_collection.delete_many({})
        return
    requests = [ReplaceOne({"id": f["id"]}, f, upsert=True) for f in feedback_data]
    feedback_collection.bulk_write(requests)
    feedback_collection.delete_many({"id": {"$nin": [f["id"] for f in feedback_data]}})


# --- Shared Helper Functions ---
def _mask_owner_for_viewer(record):
    """Mask sensitive owner details for viewer access. Returns modified record."""
    if "owner" not in record:
        return record
    
    record = record.copy()  # Don't mutate original
    record["owner"] = record["owner"].copy()
    
    # Actually remove the sensitive fields from the payload
    record["owner"].pop("aadhaar", None)
    record["owner"].pop("phone", None)
    
    name = record["owner"].get("name", "")
    parts = name.split()
    if len(parts) > 1:
        record["owner"]["name"] = parts[0] + " " + parts[1][0] + "."
    
    # Strip base64 documents for viewers
    record["owner"].pop("proof_doc_b64", None)
    for mut in record.get("mutation_history", []):
        mut.pop("proof_doc_b64", None)
        
    return record


def _strip_b64_from_list(records):
    """Remove large base64 strings from list views to save bandwidth."""
    clean_records = []
    for r in records:
        r_copy = r.copy()
        if "owner" in r_copy:
            r_copy["owner"] = r_copy["owner"].copy()
            r_copy["owner"].pop("proof_doc_b64", None)
        if "mutation_history" in r_copy:
            r_copy["mutation_history"] = [m.copy() for m in r_copy["mutation_history"]]
            for m in r_copy["mutation_history"]:
                m.pop("proof_doc_b64", None)
        clean_records.append(r_copy)
    return clean_records


def _apply_filters_to_records(records, params):
    """Apply state/district/village/land_use/search filters to records list.
    
    Args:
        records: List of record dicts
        params: Dict with optional keys: state, district, village, land_use, search
    
    Returns:
        Filtered list of records
    """
    state = (params.get("state") or "").strip().lower()
    district = (params.get("district") or "").strip().lower()
    village = (params.get("village") or "").strip().lower()
    land_use = (params.get("land_use") or "").strip()
    search = (params.get("search") or "").strip().lower()
    
    if not any([state, district, village, land_use, search]):
        return records  # No filters applied
    
    filtered = []
    for rec in records:
        loc = rec.get("location", {})
        attrs = rec.get("attributes", {})
        
        if state and loc.get("state", "").lower() != state:
            continue
        if district and loc.get("district", "").lower() != district:
            continue
        if village and loc.get("village", "").lower() != village:
            continue
        if land_use and attrs.get("land_use") != land_use:
            continue
        
        if search:
            search_text = " ".join([
                rec.get("khasra_no", ""),
                rec.get("ulpin", ""),
                loc.get("village", ""),
                loc.get("district", ""),
            ]).lower()
            if search not in search_text:
                continue
        
        filtered.append(rec)
    
    return filtered


# --- Auth Decorators ---
def admin_required(f):
    """Decorator to restrict route to authenticated admin users only."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if session.get("role") != "admin":
            return jsonify({"error": "Unauthorized. Admin access required."}), 403
        return f(*args, **kwargs)
    return decorated_function


def viewer_or_admin_required(f):
    """Decorator to allow both viewer and admin access."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if session.get("role") not in ("admin", "viewer"):
            return jsonify({"error": "Unauthorized. Please log in or pass CAPTCHA."}), 401
        return f(*args, **kwargs)
    return decorated_function



# --- Captcha Generation ---
def generate_captcha():
    """Generate a random text CAPTCHA (lower and upper case letters)."""
    chars = string.ascii_letters
    captcha_text = ''.join(random.choice(chars) for _ in range(6))

    serializer = URLSafeTimedSerializer(app.secret_key)
    token = serializer.dumps(captcha_text, salt='captcha-salt')

    return captcha_text, token

# --- Page Routes ---
@app.route("/")
def index():
    """Landing page: redirect to login."""
    return redirect(url_for("login_page"))


@app.route("/login")
def login_page():
    """Render the login/landing page with CAPTCHA and admin login forms."""
    if "role" in session:
        if session["role"] == "admin":
            return redirect(url_for("admin_dashboard"))
        elif session["role"] == "viewer":
            return redirect(url_for("viewer_page"))
    captcha_question, captcha_token = generate_captcha()
    return render_template("login.html", captcha_question=captcha_question, captcha_token=captcha_token)


@app.route("/admin")
def admin_dashboard():
    """Render admin dashboard. Only accessible if session has admin role."""
    if session.get("role") != "admin":
        return redirect(url_for("login_page"))
    return render_template("admin_dashboard.html", username=session.get("username", "Admin"))


@app.route("/viewer")
def viewer_page():
    """Render public viewer page. Only accessible if session has viewer or admin role."""
    if session.get("role") not in ("admin", "viewer"):
        return redirect(url_for("login_page"))
    return render_template("public_viewer_v2.html")


@app.route("/api/boundary", methods=["GET"])
def get_india_boundary():
    """Load the India boundary GeoJSON using Python."""
    geojson_path = os.path.join(app.root_path, "static", "data", "india-boundary.geojson")
    try:
        with open(geojson_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return jsonify(data)
    except FileNotFoundError:
        return jsonify({"error": "Boundary data not found."}), 404
        
# --- Auth API Endpoints ---
@app.route("/api/captcha", methods=["GET"])
def get_captcha():
    """Generate and return a new math CAPTCHA question."""
    question, token = generate_captcha()
    return jsonify({"question": question, "token": token})


@app.route("/api/verify-captcha", methods=["POST"])
def verify_captcha():
    """Verify CAPTCHA answer and grant viewer access."""
    data = request.get_json() or {}
    user_answer = str(data.get("answer", "")).strip()
    token = str(data.get("token", "")).strip()

    serializer = URLSafeTimedSerializer(app.secret_key)
    try:
        expected = serializer.loads(token, salt='captcha-salt', max_age=300) # 5 minutes
    except Exception:
        new_question, new_token = generate_captcha()
        return jsonify({"success": False, "message": "CAPTCHA expired or invalid. Please try again.", "new_question": new_question, "new_token": new_token}), 400

    if user_answer == expected:
        session.permanent = True  # Enable persistent session
        session["role"] = "viewer"
        session["username"] = "Viewer"
        return jsonify({"success": True, "redirect": "/viewer"})
    else:
        # Generate a new captcha on failure
        new_question, new_token = generate_captcha()
        return jsonify({"success": False, "message": "Incorrect answer. Please try again.", "new_question": new_question, "new_token": new_token}), 400


@app.route("/api/login", methods=["POST"])
def admin_login():
    """Authenticate admin user with username and password."""
    data = request.get_json() or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        return jsonify({"error": "Username and password are required."}), 400

    users = load_users()
    user = next((u for u in users if u["username"] == username), None)

    if user and check_password_hash(user["password_hash"], password):
        session.permanent = True  # Enable persistent session
        session["role"] = "admin"
        session["username"] = username
        session["admin_id"] = user.get("admin_id", "")

        # Update last login
        user["last_login"] = datetime.now().isoformat() + "Z"
        save_users(users)

        return jsonify({"success": True, "redirect": "/admin"})
    else:
        return jsonify({"error": "Invalid username or password."}), 401


@app.route("/api/logout", methods=["POST"])
def logout():
    """Clear session and log out the user."""
    session.clear()
    return jsonify({"success": True, "redirect": "/login"})


@app.route("/api/session-info", methods=["GET"])
def session_info():
    """Return current session information (role, username) for frontend state management."""
    return jsonify({
        "role": session.get("role", None),
        "username": session.get("username", None),
        "is_authenticated": session.get("role") is not None
    })

@app.route("/api/feedback", methods=["GET"])
@admin_required
def get_feedback():
    """Admin-only endpoint to get all submitted feedback."""
    feedback_data = load_feedback()
    return jsonify(feedback_data)


@app.route("/api/feedback", methods=["POST"])
@viewer_or_admin_required
def submit_feedback():
    """Handle feedback and issue reports from the viewer."""
    data = request.get_json() or {}
    
    email = data.get("email", "").strip()
    issue_type = data.get("type", "General Feedback").strip()
    message = data.get("message", "").strip()
    
    if not email or not message:
        return jsonify({"error": "Email and Message are required fields."}), 400
        
    feedback_entry = {
        "id": str(uuid.uuid4()),
        "email": email,
        "type": issue_type,
        "message": message,
        "timestamp": datetime.now().isoformat(),
        "status": "New",
        "user_role": session.get("role", "unknown")
    }
    
    feedback_data = load_feedback()
    feedback_data.append(feedback_entry)
    save_feedback(feedback_data)
    
    return jsonify({"success": True, "message": "Feedback submitted successfully."})


@app.route("/api/feedback/<feedback_id>", methods=["DELETE"])
@admin_required
def delete_feedback(feedback_id):
    """Admin-only endpoint to delete a feedback/report entry."""
    feedback_data = load_feedback()
    original_len = len(feedback_data)
    
    feedback_data = [f for f in feedback_data if f.get("id") != feedback_id]
    
    if len(feedback_data) == original_len:
        return jsonify({"error": "Feedback entry not found."}), 404
        
    save_feedback(feedback_data)
    return jsonify({"success": True, "message": "Feedback deleted successfully."})


# --- Records API Endpoints ---
@app.route("/api/records", methods=["GET"])
@viewer_or_admin_required
def get_records():
    """Fetch all land records. Available to both viewers and admins."""
    records = load_records()

    # Strip base64 for list view
    records = _strip_b64_from_list(records)

    # If viewer, mask owner details partially
    if session.get("role") == "viewer":
        records = [_mask_owner_for_viewer(rec) for rec in records]

    return jsonify(records)


@app.route("/api/records/<record_id>", methods=["GET"])
@viewer_or_admin_required
def get_record(record_id):
    """Fetch a single land record by ID."""
    records = load_records()
    record = next((r for r in records if r["_id"] == record_id), None)

    if not record:
        return jsonify({"error": "Record not found."}), 404

    # Mask for viewers
    if session.get("role") == "viewer":
        record = _mask_owner_for_viewer(record)

    return jsonify(record)


@app.route("/api/records/search", methods=["GET"])
@viewer_or_admin_required
def search_records():
    """Search records by Khasra number, ULPIN, or village name."""
    query = request.args.get("q", "").strip().lower()
    if not query:
        return jsonify({"error": "Search query parameter 'q' is required."}), 400

    records = load_records()
    results = []
    for rec in records:
        khasra = rec.get("khasra_no", "").lower()
        ulpin = rec.get("ulpin", "").lower()
        village = rec.get("location", {}).get("village", "").lower()
        district = rec.get("location", {}).get("district", "").lower()
        owner_name = rec.get("owner", {}).get("name", "").lower()

        if query in khasra or query in ulpin or query in village or query in district or query in owner_name:
            results.append(rec)

    # Mask for viewers
    if session.get("role") == "viewer":
        results = [_mask_owner_for_viewer(rec) for rec in results]

    return jsonify(results)


@app.route("/api/records", methods=["POST"])
@admin_required
def create_record():
    """Create a new land record. Admin only."""
    data = request.get_json() or {}

    # Validate required fields
    required_fields = ["khasra_no", "khata_no", "location", "geometry", "land_use", "owner_name"]
    missing = [f for f in required_fields if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    # Validate location sub-fields
    loc = data.get("location", {})
    if not loc.get("state") or not loc.get("district") or not loc.get("village"):
        return jsonify({"error": "Location must include state, district, and village."}), 400

    # Validate geometry using gis_processor
    from gis_processor import validate_polygon, calculate_area, check_overlap
    geometry = data.get("geometry", {})
    validation = validate_polygon(geometry)
    if not validation["valid"]:
        return jsonify({"error": "Invalid polygon geometry.", "details": validation["errors"]}), 400

    # Check for overlaps with existing records
    existing = load_records()
    overlap_result = check_overlap(geometry, existing)
    if overlap_result.get("overlaps"):
        return jsonify({
            "error": "The new parcel overlaps with existing records.",
            "conflicting_records": overlap_result["conflicting_records"]
        }), 409

    # Calculate area
    area_result = calculate_area(geometry)
    if "error" in area_result:
        return jsonify({"error": f"Area calculation failed: {area_result['error']}"}), 400

    # Build the record
    record = {
        "_id": str(uuid.uuid4()),
        "ulpin": data.get("ulpin", _generate_ulpin()),
        "khasra_no": data["khasra_no"],
        "khata_no": data["khata_no"],
        "location": loc,
        "geometry": geometry,
        "attributes": {
            "area_ha": area_result["area_ha"],
            "land_use": data["land_use"],
            "circle_rate_inr": data.get("circle_rate_inr", 0)
        },
        "owner": {
            "name": data["owner_name"],
            "share_pct": data.get("share_pct", 100),
            "aadhaar_mask": data.get("aadhaar_mask", "XXXX-XXXX-XXXX"),
            "proof_doc_b64": data.get("owner_proof_doc_b64")
        },
        "mutation_history": []
    }

    existing.append(record)
    save_records(existing)

    return jsonify({"success": True, "record": record, "area_details": area_result}), 201


@app.route("/api/records/<record_id>", methods=["PUT"])
@admin_required
def update_record(record_id):
    """Update an existing land record. Admin only.
    Supports mutation (ownership transfer) which archives the old owner."""
    data = request.get_json() or {}
    records = load_records()

    record = next((r for r in records if r["_id"] == record_id), None)
    if not record:
        return jsonify({"error": "Record not found."}), 404

    # Handle Mutation (ownership transfer)
    if data.get("mutation") and data.get("new_owner_name"):
        old_owner = record.get("owner", {})
        mutation_entry = {
            "previous_owner": old_owner.get("name", "Unknown"),
            "previous_share_pct": old_owner.get("share_pct", 0),
            "mutation_date": data.get("mutation_date", datetime.now().strftime("%Y-%m-%d")),
            "mutation_type": data.get("mutation_type", "Sale Deed"),
            "mutation_ref": data.get("mutation_ref", f"MUT-{datetime.now().strftime('%Y')}-{record.get('location', {}).get('district', 'UNK')[:3].upper()}-{random.randint(10000, 99999)}"),
            "proof_doc_b64": data.get("mutation_proof_doc_b64")
        }

        # Archive old owner
        if "mutation_history" not in record:
            record["mutation_history"] = []
        record["mutation_history"].append(mutation_entry)

        # Update owner
        record["owner"] = {
            "name": data["new_owner_name"],
            "share_pct": data.get("new_share_pct", 100),
            "aadhaar_mask": data.get("new_aadhaar_mask", "XXXX-XXXX-XXXX")
        }

        # Also allow location, geometry, and basic field updates during mutation
        if "location" in data:
            record["location"] = data["location"]
        if "khasra_no" in data:
            record["khasra_no"] = data["khasra_no"]
        if "khata_no" in data:
            record["khata_no"] = data["khata_no"]
        if "geometry" in data:
            from gis_processor import validate_polygon, calculate_area
            validation = validate_polygon(data["geometry"])
            if validation["valid"]:
                record["geometry"] = data["geometry"]
                area_result = calculate_area(data["geometry"])
                record["attributes"]["area_ha"] = area_result.get("area_ha", record["attributes"].get("area_ha", 0))
    else:
        # Regular field updates
        updatable_fields = {
            "khasra_no": lambda v: v,
            "khata_no": lambda v: v,
            "land_use": lambda v: _update_nested(record, "attributes", "land_use", v),
            "circle_rate_inr": lambda v: _update_nested(record, "attributes", "circle_rate_inr", v),
            "share_pct": lambda v: _update_nested(record, "owner", "share_pct", v),
            "aadhaar_mask": lambda v: _update_nested(record, "owner", "aadhaar_mask", v),
        }

        for field, processor in updatable_fields.items():
            if field in data:
                processor(data[field])

        # Update geometry if provided
        if "geometry" in data:
            from gis_processor import validate_polygon, calculate_area
            validation = validate_polygon(data["geometry"])
            if not validation["valid"]:
                return jsonify({"error": "Invalid polygon.", "details": validation["errors"]}), 400

            record["geometry"] = data["geometry"]
            area_result = calculate_area(data["geometry"])
            record["attributes"]["area_ha"] = area_result.get("area_ha", record["attributes"].get("area_ha", 0))

        # Update location if provided
        if "location" in data:
            record["location"] = data["location"]

    save_records(records)
    return jsonify({"success": True, "record": record})


@app.route("/api/records/<record_id>", methods=["DELETE"])
@admin_required
def delete_record(record_id):
    """Delete a land record. Admin only."""
    records = load_records()
    original_count = len(records)
    records = [r for r in records if r["_id"] != record_id]

    if len(records) == original_count:
        return jsonify({"error": "Record not found."}), 404

    save_records(records)
    return jsonify({"success": True, "message": f"Record {record_id} deleted successfully."})


# --- GIS Processing Endpoints ---
@app.route("/api/calculate-area", methods=["POST"])
@admin_required
def api_calculate_area():
    """Calculate area from GeoJSON polygon geometry. Admin only."""
    data = request.get_json() or {}
    geometry = data.get("geometry")

    if not geometry:
        return jsonify({"error": "Geometry is required."}), 400

    from gis_processor import calculate_area, calculate_perimeter, get_centroid

    area_result = calculate_area(geometry)
    perimeter_result = calculate_perimeter(geometry)
    centroid_result = get_centroid(geometry)

    if "error" in area_result:
        return jsonify(area_result), 400

    return jsonify({
        "area": area_result,
        "perimeter": perimeter_result,
        "centroid": centroid_result
    })


@app.route("/api/validate-geometry", methods=["POST"])
@admin_required
def api_validate_geometry():
    """Validate a GeoJSON polygon geometry. Admin only."""
    data = request.get_json() or {}
    geometry = data.get("geometry")

    if not geometry:
        return jsonify({"error": "Geometry is required."}), 400

    from gis_processor import validate_polygon
    return jsonify(validate_polygon(geometry))


@app.route("/api/location-from-coords", methods=["GET"])
@admin_required
def location_from_coordinates():
    """Resolve map coordinates to location components (state/district/village)."""
    lat = request.args.get("lat", type=float)
    lng = request.args.get("lng", type=float)
    if lat is None or lng is None:
        return jsonify({"error": "Both lat and lng query parameters are required."}), 400

    if not (6.0 <= lat <= 38.0 and 67.0 <= lng <= 98.0):
        return jsonify({"error": "Coordinates are outside India bounds."}), 400

    query = urlencode({
        "lat": f"{lat:.6f}",
        "lon": f"{lng:.6f}",
        "format": "jsonv2",
        "addressdetails": 1,
        "accept-language": "en"
    })
    url = f"https://nominatim.openstreetmap.org/reverse?{query}"

    try:
        req = Request(url, headers={"User-Agent": "IndiaLIMS/1.0 (reverse-geocode)"})
        with urlopen(req, timeout=8) as response:
            payload = response.read().decode("utf-8")
            data = json.loads(payload)

        address = data.get("address", {})
        state = address.get("state") or address.get("region") or ""
        district = (
            address.get("state_district")
            or address.get("county")
            or address.get("city_district")
            or address.get("city")
            or ""
        )
        village = (
            address.get("village")
            or address.get("town")
            or address.get("suburb")
            or address.get("hamlet")
            or address.get("neighbourhood")
            or ""
        )

        return jsonify({
            "success": True,
            "state": state,
            "district": district,
            "village": village,
            "display_name": data.get("display_name", ""),
            "source": "nominatim"
        })
    except Exception as exc:
        return jsonify({"error": f"Reverse geocoding failed: {str(exc)}"}), 502


# --- Document Generation Endpoints ---
@app.route("/api/print-card/<ulpin>", methods=["GET", "POST"])
@viewer_or_admin_required
def print_property_card(ulpin):
    """Generate and download a PDF Property Card for a given ULPIN. Admin or Viewer."""
    records = load_records()
    record = next((r for r in records if r.get("ulpin") == ulpin), None)

    if not record:
        return jsonify({"error": f"No record found with ULPIN: {ulpin}"}), 404
        
    map_image_base64 = None
    if request.method == "POST":
        data = request.get_json() or {}
        map_image_base64 = data.get("map_image")

    try:
        from report_generator import generate_property_card_pdf
        pdf_bytes = generate_property_card_pdf(record, map_image_base64=map_image_base64)

        if not pdf_bytes:
            return jsonify({"error": "PDF generation failed."}), 500

        filename = f"Property_Card_{ulpin}_{datetime.now().strftime('%Y%m%d')}.pdf"
        return send_file(
            io.BytesIO(pdf_bytes),
            mimetype="application/pdf",
            as_attachment=True,
            download_name=filename
        )
    except ImportError as e:
        return jsonify({"error": f"Required library missing: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"PDF generation error: {str(e)}"}), 500


@app.route("/api/export-village", methods=["GET"])
@admin_required
def export_village_ledger():
    """Generate and download an Excel village ledger. Admin only."""
    records = load_records()

    # Optional village filter
    village = request.args.get("village", "").strip()
    if village:
        records = [r for r in records if r.get("location", {}).get("village", "").lower() == village.lower()]

    if not records:
        return jsonify({"error": "No records found to export."}), 404

    try:
        from report_generator import generate_village_excel
        excel_bytes = generate_village_excel(records, village_name=village or "All Villages")

        if not excel_bytes:
            return jsonify({"error": "Excel generation failed."}), 500

        filename = f"Village_Ledger_{village or 'All'}_{datetime.now().strftime('%Y%m%d')}.xlsx"
        return send_file(
            io.BytesIO(excel_bytes),
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            as_attachment=True,
            download_name=filename
        )
    except ImportError as e:
        return jsonify({"error": f"Required library missing: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"Excel generation error: {str(e)}"}), 500


# --- Server-Side Filtering & Analytics ---

@app.route("/api/records/filter", methods=["GET"])
@viewer_or_admin_required
def filter_records():
    """Server-side filtering of records by state, district, village, land_use, and search text."""
    records = load_records()
    
    params = {
        "state": request.args.get("state", ""),
        "district": request.args.get("district", ""),
        "village": request.args.get("village", ""),
        "land_use": request.args.get("land_use", ""),
        "search": request.args.get("search", "")
    }
    
    filtered = _apply_filters_to_records(records, params)
    filtered = _strip_b64_from_list(filtered)
    return jsonify(filtered)


@app.route("/api/dashboard", methods=["GET"])
@admin_required
def dashboard_analytics():
    """Pre-computed dashboard analytics. Python does the heavy aggregation."""
    records = load_records()

    # Apply same filters as records endpoint using shared helper
    params = {
        "state": request.args.get("state", ""),
        "district": request.args.get("district", ""),
        "village": request.args.get("village", ""),
        "land_use": request.args.get("land_use", ""),
        "search": request.args.get("search", "")
    }
    filtered = _apply_filters_to_records(records, params)
    
    # Compute KPIs
    total_parcels = len(filtered)
    total_area = 0.0
    total_value = 0.0
    total_mutations = 0
    
    land_use_stats = {}
    district_stats = {}
    top_parcel = None
    top_parcel_value = -1
    
    for rec in filtered:
        loc = rec.get("location", {})
        attrs = rec.get("attributes", {})
        area = float(attrs.get("area_ha", 0) or 0)
        rate = float(attrs.get("circle_rate_inr", 0) or 0)
        value = area * rate
        
        total_area += area
        total_value += value
        total_mutations += len(rec.get("mutation_history", []) or [])
        
        # Land use distribution
        lu = attrs.get("land_use", "Unknown")
        if lu not in land_use_stats:
            land_use_stats[lu] = {"count": 0, "area": 0.0}
        land_use_stats[lu]["count"] += 1
        land_use_stats[lu]["area"] += area
        
        # District stats
        d = loc.get("district", "Unknown")
        if d not in district_stats:
            district_stats[d] = {"count": 0, "area": 0.0, "value": 0.0}
        district_stats[d]["count"] += 1
        district_stats[d]["area"] += area
        district_stats[d]["value"] += value
        
        # Top value parcel
        if value > top_parcel_value:
            top_parcel_value = value
            top_parcel = {
                "khasra_no": rec.get("khasra_no", "N/A"),
                "ulpin": rec.get("ulpin", "N/A"),
                "village": loc.get("village", "N/A"),
                "district": loc.get("district", "N/A"),
                "land_use": lu,
                "area_ha": round(area, 2),
                "estimated_value": round(value, 0)
            }
    
    # Sort districts by value, take top 6
    sorted_districts = sorted(district_stats.items(), key=lambda x: x[1]["value"], reverse=True)[:6]
    
    # Get recent mutations
    all_mutations = []
    for rec in filtered:
        for m in rec.get("mutation_history", []) or []:
            all_mutations.append({
                "khasra_no": rec.get("khasra_no", "N/A"),
                "district": rec.get("location", {}).get("district", "N/A"),
                "previous_owner": m.get("previous_owner", "N/A"),
                "mutation_type": m.get("mutation_type", "N/A"),
                "mutation_date": m.get("mutation_date", "N/A"),
                "mutation_ref": m.get("mutation_ref", "N/A")
            })
    
    all_mutations.sort(key=lambda x: str(x.get("mutation_date", "")), reverse=True)
    recent_mutations = all_mutations[:6]
    
    return jsonify({
        "kpis": {
            "total_parcels": total_parcels,
            "total_area": round(total_area, 2),
            "estimated_value": round(total_value, 0),
            "total_mutations": total_mutations
        },
        "land_use_distribution": land_use_stats,
        "district_overview": [{"name": d, **s} for d, s in sorted_districts],
        "top_parcel": top_parcel,
        "recent_mutations": recent_mutations
    })


@app.route("/api/location-catalog", methods=["GET"])
@viewer_or_admin_required
def location_catalog():
    """Return pre-computed state > district > village hierarchy for filter dropdowns."""
    records = load_records()
    
    catalog = {}
    for rec in records:
        loc = rec.get("location", {})
        state = loc.get("state", "")
        district = loc.get("district", "")
        village = loc.get("village", "")
        
        if not state or not district or not village:
            continue
        
        if state not in catalog:
            catalog[state] = {}
        if district not in catalog[state]:
            catalog[state][district] = set()
        catalog[state][district].add(village)
    
    # Convert sets to sorted lists for JSON serialization
    result = {}
    for state in sorted(catalog.keys()):
        result[state] = {}
        for district in sorted(catalog[state].keys()):
            result[state][district] = sorted(catalog[state][district])
    
    return jsonify(result)


@app.route("/api/config", methods=["GET"])
def app_config():
    """Return application configuration (land use options, colors, etc.)."""
    from config import LAND_USE_OPTIONS, LAND_USE_COLORS, MUTATION_TYPES
    return jsonify({
        "land_use_options": LAND_USE_OPTIONS,
        "land_use_colors": LAND_USE_COLORS,
        "mutation_types": MUTATION_TYPES
    })


# --- User Management API Endpoints ---

@app.route("/api/profile", methods=["GET"])
@viewer_or_admin_required
def get_profile():
    """Get current user's profile."""
    current_username = session.get("username", "")
    users = load_users()
    user = next((u for u in users if u.get("username") == current_username), None)
    
    if not user:
        return jsonify({"error": "Profile not found."}), 404
    
    # Return profile without password hash
    profile = {k: v for k, v in user.items() if k != "password_hash"}
    return jsonify(profile)


@app.route("/api/profile", methods=["PUT"])
@viewer_or_admin_required
def update_profile():
    """Update current user's own profile. Cannot change role or username."""
    current_username = session.get("username", "")
    data = request.get_json() or {}
    users = load_users()
    
    user_idx = next((i for i, u in enumerate(users) if u.get("username") == current_username), None)
    if user_idx is None:
        return jsonify({"error": "Profile not found."}), 404
    
    # Only allow updating certain fields
    allowed_fields = ["full_name", "email", "phone", "designation", "department", "office_location"]
    
    for field in allowed_fields:
        if field in data:
            users[user_idx][field] = data[field]
    
    # Allow password change if current password is verified
    if data.get("current_password") and data.get("new_password"):
        if not check_password_hash(users[user_idx].get("password_hash", ""), data["current_password"]):
            return jsonify({"error": "Current password is incorrect."}), 403
        users[user_idx]["password_hash"] = generate_password_hash(data["new_password"])
    
    save_users(users)
    
    profile = {k: v for k, v in users[user_idx].items() if k != "password_hash"}
    return jsonify({"success": True, "profile": profile})


@app.route("/api/users", methods=["GET"])
@admin_required
def list_users():
    """List all users (admin only). Returns profiles without password hashes."""
    users = load_users()
    result = []
    for u in users:
        profile = {k: v for k, v in u.items() if k != "password_hash"}
        result.append(profile)
    return jsonify(result)


@app.route("/api/users", methods=["POST"])
@admin_required
def create_user():
    """Create a new user (admin only)."""
    data = request.get_json() or {}
    
    # Validate required fields
    required = ["username", "password", "full_name"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400
    
    # Check for duplicate username
    users = load_users()
    if any(u.get("username") == data["username"] for u in users):
        return jsonify({"error": "Username already exists."}), 409
    
    # Validate role
    valid_roles = ["SuperAdmin", "Admin", "Officer", "Viewer"]
    role = data.get("role", "Officer")
    if role not in valid_roles:
        return jsonify({"error": f"Invalid role. Must be one of: {', '.join(valid_roles)}"}), 400
    
    # Create new user
    new_user = {
        "user_id": str(uuid.uuid4()),
        "username": data["username"],
        "password_hash": generate_password_hash(data["password"]),
        "role": role,
        "full_name": data.get("full_name", ""),
        "email": data.get("email", ""),
        "phone": data.get("phone", ""),
        "designation": data.get("designation", ""),
        "department": data.get("department", ""),
        "office_location": data.get("office_location", ""),
        "is_active": data.get("is_active", True),
        "created_at": datetime.now().isoformat() + "Z",
        "last_login": None
    }
    
    users.append(new_user)
    save_users(users)
    
    profile = {k: v for k, v in new_user.items() if k != "password_hash"}
    return jsonify({"success": True, "user": profile}), 201


@app.route("/api/users/<user_id>", methods=["GET"])
@admin_required
def get_user(user_id):
    """Get a specific user's profile (admin only)."""
    users = load_users()
    user = next((u for u in users if u.get("user_id") == user_id), None)
    
    if not user:
        return jsonify({"error": "User not found."}), 404
    
    profile = {k: v for k, v in user.items() if k != "password_hash"}
    return jsonify(profile)


@app.route("/api/users/<user_id>", methods=["PUT"])
@admin_required
def update_user(user_id):
    """Update any user's profile (admin only). Admin has absolute power."""
    data = request.get_json() or {}
    users = load_users()
    
    user_idx = next((i for i, u in enumerate(users) if u.get("user_id") == user_id), None)
    if user_idx is None:
        return jsonify({"error": "User not found."}), 404
    
    # Admin can update any field except user_id and username
    allowed_fields = ["full_name", "email", "phone", "designation", "department", 
                      "office_location", "role", "is_active"]
    
    # Validate role if being changed
    if "role" in data:
        valid_roles = ["SuperAdmin", "Admin", "Officer", "Viewer"]
        if data["role"] not in valid_roles:
            return jsonify({"error": f"Invalid role. Must be one of: {', '.join(valid_roles)}"}), 400
    
    for field in allowed_fields:
        if field in data:
            users[user_idx][field] = data[field]
    
    # Admin can reset any user's password
    if data.get("new_password"):
        users[user_idx]["password_hash"] = generate_password_hash(data["new_password"])
    
    save_users(users)
    
    profile = {k: v for k, v in users[user_idx].items() if k != "password_hash"}
    return jsonify({"success": True, "user": profile})


@app.route("/api/users/<user_id>", methods=["DELETE"])
@admin_required
def delete_user(user_id):
    """Delete a user (admin only). Cannot delete self."""
    current_username = session.get("username", "")
    users = load_users()
    
    user = next((u for u in users if u.get("user_id") == user_id), None)
    if not user:
        return jsonify({"error": "User not found."}), 404
    
    # Prevent self-deletion
    if user.get("username") == current_username:
        return jsonify({"error": "Cannot delete your own account."}), 403
    
    users = [u for u in users if u.get("user_id") != user_id]
    save_users(users)
    
    return jsonify({"success": True, "message": f"User '{user.get('username')}' deleted."})


# --- Utility Functions ---
def _generate_ulpin():
    """Generate a 14-digit ULPIN (Unique Land Parcel Identification Number)."""
    return str(random.randint(10000000000000, 99999999999999))


def _update_nested(record, parent_key, child_key, value):
    """Update a nested field in the record dictionary."""
    if parent_key not in record:
        record[parent_key] = {}
    record[parent_key][child_key] = value
    return value


# --- Main Entry Point ---
if __name__ == "__main__":
    # Redirect stdout and stderr safely for --windowed mode
    log_path = os.path.join(os.environ.get('APPDATA', os.path.dirname(os.path.abspath(__file__))), "IndiaLIMS.log")
    if sys.stdout is None or getattr(sys.stdout, "closed", True):
        sys.stdout = open(log_path, "w", encoding="utf-8")
    if sys.stderr is None or getattr(sys.stderr, "closed", True):
        sys.stderr = open(log_path, "a", encoding="utf-8")
    try:
        sys.stdout.write("")
    except Exception:
        sys.stdout = open(log_path, "w", encoding="utf-8")
    try:
        sys.stderr.write("")
    except Exception:
        sys.stderr = open(log_path, "a", encoding="utf-8")

    # Ensure data directory exists
    os.makedirs(DATA_DIR, exist_ok=True)

    if not MONGO_URI:
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(0, "MongoDB Connection String (MONGO_URI) is missing.\n\nPlease check your configuration.", "Configuration Error", 0x10)
        except Exception:
            pass
        sys.exit(1)

    try:
        # Bootstrap default admin if the cloud collection is entirely empty
        if users_collection.count_documents({}) == 0:
            default_users = [{
                "user_id": "bootstrap-admin-01",
                "username": "admin",
                "password_hash": generate_password_hash("password123"),
                "role": "SuperAdmin",
                "full_name": "System Administrator",
                "email": "admin@indialims.edu",
                "phone": "+91-0000000000",
                "designation": "System Administrator",
                "department": "Land Records",
                "office_location": "System Default",
                "is_active": True,
                "created_at": datetime.now().isoformat() + "Z",
                "last_login": datetime.now().isoformat() + "Z"
            }]
            save_users(default_users)
            print("[BOOTSTRAP] Default admin user created.")
    except Exception as e:
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(0, f"Could not connect to the cloud database.\n\nError: {str(e)}\n\nPlease check your internet connection and .env credentials.", "Database Connection Error", 0x10)
        except Exception:
            pass
        sys.exit(1)

    print("\n" + "=" * 60)
    print("  India LIMS - Land Information Management System")
    print(f"  Server starting on http://{HOST}:{PORT}")
    print("=" * 60 + "\n")

    # If running directly, check if we should launch GUI
    try:
        import webview
        import threading
        import time
        import socket
        from werkzeug.serving import make_server

        def get_free_port(start_port):
            """Find an available port if the default is taken."""
            for port in range(start_port, 65535):
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    try:
                        s.bind((HOST, port))
                        return port
                    except OSError:
                        continue
            return start_port

        actual_port = get_free_port(PORT)

        def start_server():
            app.run(host=HOST, port=actual_port, debug=False, use_reloader=False)

        flask_thread = threading.Thread(target=start_server, daemon=True)
        flask_thread.start()
        print("Waiting for Flask server to start...")
        time.sleep(2)

        # Windows browsers cannot navigate to 0.0.0.0 directly
        display_host = "127.0.0.1" if HOST == "0.0.0.0" else HOST

        webview.settings['ALLOW_DOWNLOADS'] = True
        window = webview.create_window(
            title="India LIMS - Land Information Management System",
            url=f"http://{display_host}:{actual_port}/login",
            width=1400,
            height=900,
            min_size=(1024, 700),
            resizable=True
        )
        webview.start(debug=False)
        print("Application closed.")

    except ImportError:
        # Fallback to server-only mode if webview is not available
        app.run(host=HOST, port=PORT, debug=DEBUG)
