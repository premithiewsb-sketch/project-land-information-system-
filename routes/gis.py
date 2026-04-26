import os
import json
from flask import Blueprint, request, jsonify, current_app
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from core import role_required

gis_bp = Blueprint('gis', __name__)

@gis_bp.route("/api/boundary", methods=["GET"])
def get_india_boundary():
    geojson_path = os.path.join(current_app.root_path, "static", "data", "india-boundary.geojson")
    try:
        with open(geojson_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return jsonify(data)
    except FileNotFoundError:
        return jsonify({"error": "Boundary data not found."}), 404

@gis_bp.route("/api/calculate-area", methods=["POST"])
@role_required("admin", "superadmin", "officer")
def api_calculate_area():
    data = request.get_json() or {}
    geometry = data.get("geometry")
    if not geometry: return jsonify({"error": "Geometry required."}), 400
    from gis_processor import calculate_area, calculate_perimeter, get_centroid
    return jsonify({
        "area": calculate_area(geometry),
        "perimeter": calculate_perimeter(geometry),
        "centroid": get_centroid(geometry)
    })

@gis_bp.route("/api/validate-geometry", methods=["POST"])
@role_required("admin", "superadmin", "officer")
def api_validate_geometry():
    """Validate a GeoJSON polygon geometry."""
    data = request.get_json() or {}
    geometry = data.get("geometry")
    if not geometry: return jsonify({"error": "Geometry is required."}), 400
    from gis_processor import validate_polygon
    return jsonify(validate_polygon(geometry))

@gis_bp.route("/api/location-from-coords", methods=["GET"])
@role_required("admin", "superadmin", "officer")
def location_from_coordinates():
    lat = request.args.get("lat", type=float)
    lng = request.args.get("lng", type=float)
    if lat is None or lng is None: return jsonify({"error": "lat and lng required."}), 400
    query = urlencode({"lat": f"{lat:.6f}", "lon": f"{lng:.6f}", "format": "jsonv2", "addressdetails": 1})
    url = f"https://nominatim.openstreetmap.org/reverse?{query}"
    try:
        req = Request(url, headers={"User-Agent": "LIMS/1.0"})
        with urlopen(req, timeout=8) as response:
            data = json.loads(response.read().decode("utf-8"))
        addr = data.get("address", {})
        
        # Robust detection for Indian administrative levels
        state = addr.get("state", "")
        
        # District can be in several fields
        district = addr.get("state_district") or addr.get("district") or addr.get("county") or addr.get("city") or ""
        
        # Village/Ward/Locality can be in many fields in India
        village = (
            addr.get("village") or 
            addr.get("suburb") or 
            addr.get("neighbourhood") or 
            addr.get("hamlet") or 
            addr.get("town") or 
            addr.get("city_district") or 
            addr.get("locality") or 
            addr.get("residential") or
            ""
        )
        
        return jsonify({
            "success": True,
            "state": state,
            "district": district,
            "village": village,
            "display_name": data.get("display_name", "")
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 502

@gis_bp.route("/api/location-catalog", methods=["GET"])
def get_location_catalog():
    """Return the master hierarchy of States, Districts, and Villages."""
    # This would typically come from a DB, but we'll use a robust static catalog for India
    catalog = {
        "Madhya Pradesh": {
            "Indore": ["Bicholi Mardana", "Kanadia", "Hatod", "Rau", "Mhow"],
            "Bhopal": ["Bairagarh", "Huzur", "Berasia", "Misrod", "Arera"],
            "Jabalpur": ["Panagar", "Sihora", "Patan", "Shahpura"],
            "Gwalior": ["Dabra", "Bhitarwar", "Chinore"],
            "Ujjain": ["Nagda", "Mahidpur", "Tarana", "Khachrod"]
        },
        "Maharashtra": {
            "Mumbai": ["Colaba", "Dadar", "Andheri", "Borivali", "Kurla"],
            "Pune": ["Haveli", "Khed", "Shirur", "Baramati", "Indapur"],
            "Nagpur": ["Kamptee", "Ramtek", "Katol", "Saoner"],
            "Nashik": ["Malegaon", "Sinnar", "Yeola", "Igatpuri"]
        },
        "Uttar Pradesh": {
            "Lucknow": ["Bakshi Ka Talab", "Malihabad", "Mohanlalganj"],
            "Kanpur": ["Bilhaur", "Ghatampur"],
            "Varanasi": ["Pindra", "Rajatalab"],
            "Agra": ["Etmadpur", "Fatehabad", "Kheragarh"]
        },
        "Delhi": {
            "New Delhi": ["Connaught Place", "Chanakyapuri"],
            "South Delhi": ["Saket", "Hauz Khas", "Mehrauli"],
            "North Delhi": ["Model Town", "Narela"],
            "East Delhi": ["Preet Vihar", "Mayur Vihar"]
        }
    }
    return jsonify(catalog)
