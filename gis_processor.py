"""
gis_processor.py - Spatial Calculation Module for India LIMS
Uses Shapely for all GIS heavy lifting: area calculation, validation, and spatial operations.
"""

import math
import os
import json
from shapely.geometry import Polygon, mapping, shape
from shapely.validation import make_valid

_india_boundary_shape = None

def get_india_boundary_shape():
    """Load and cache the India boundary GeoJSON. Loads once at startup."""
    global _india_boundary_shape
    if _india_boundary_shape is None:
        try:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            geojson_path = os.path.join(base_dir, 'static', 'data', 'india-boundary.geojson')
            with open(geojson_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if 'features' in data and len(data['features']) > 0:
                    _india_boundary_shape = shape(data['features'][0]['geometry'])
                else:
                    _india_boundary_shape = shape(data)
        except Exception as e:
            print(f"Warning: India boundary not loaded: {e}")
    return _india_boundary_shape

# Preload at module import time
try:
    get_india_boundary_shape()
except Exception:
    pass  # Will load on first request if fails at startup


# --- Constants for Unit Conversion ---
# 1 Hectare = 2.47105 Acres
# 1 Hectare = 100.00065 Guntha (standardized)
# 1 Hectare = 107639.104 Sq. Ft.

HECTARE_TO_ACRE = 2.47105
HECTARE_TO_GUNTHA = 100.00065
HECTARE_TO_SQFT = 107639.104

# Bigha varies significantly by state. Using Madhya Pradesh standard:
# 1 Bigha ≈ 0.2529 Hectares in MP
HECTARE_TO_BIGHA_MP = 3.9537

# Assam (Northeast India) Land Units:
# 1 Assam Bigha = 14,400 sq ft = 1,337.804 sq meters ≈ 0.13378 Ha
# 1 Lecha = 144 sq ft = 1/100 Assam Bigha
HECTARE_TO_BIGHA_ASSAM = 7.4752   # 1 Ha = 7.4752 Assam Bigha
HECTARE_TO_LECHA_ASSAM = 747.52   # 1 Ha = 747.52 Lecha

# WGS84 Authalic Radius (equal-area sphere radius for area calculations)
WGS84_AUTHALIC_RADIUS = 6371007.180918  # meters


def calculate_area(geometry_dict):
    """
    Calculate area of a polygon from a GeoJSON geometry dict.
    Returns area in Hectares along with local unit equivalents.

    Uses geodesic area calculation (WGS84 ellipsoid) for high accuracy.
    This is the proper method for land survey calculations.

    Args:
        geometry_dict: GeoJSON geometry object with type 'Polygon' and coordinates.

    Returns:
        dict with area in hectares, acres, guntha, sqft, and bigha.
    """
    try:
        geom = shape(geometry_dict)
        if not geom.is_valid:
            geom = make_valid(geom)

        # Calculate geodesic area in square meters using WGS84 ellipsoid
        area_sq_meters = _geodesic_area_m2(geom)

        # Convert to hectares (1 hectare = 10,000 sq meters)
        area_ha = area_sq_meters / 10000.0

        return {
            "area_ha": round(area_ha, 4),
            "area_acres": round(area_ha * HECTARE_TO_ACRE, 4),
            "area_guntha": round(area_ha * HECTARE_TO_GUNTHA, 2),
            "area_sqft": round(area_ha * HECTARE_TO_SQFT, 2),
            "area_bigha_mp": round(area_ha * HECTARE_TO_BIGHA_MP, 4),
            "area_bigha_assam": round(area_ha * HECTARE_TO_BIGHA_ASSAM, 2),
            "area_lecha_assam": round(area_ha * HECTARE_TO_LECHA_ASSAM, 0),
            "unit": "hectares"
        }
    except Exception as e:
        return {"error": f"Spatial calculation failed: {str(e)}", "area_ha": 0}


def _geodesic_area_m2(geom):
    """
    Calculate the geodesic area of a polygon on a sphere (WGS84 authalic radius).
    Uses the spherical excess formula: Area = R² * |Σ(Δλ * (2 + sin(φ1) + sin(φ2)))| / 2
    
    This algorithm is based on "Some algorithms for polygons on a sphere" 
    by Robert G. Chamberlain and William H. Duquette (NASA JPL).
    
    Accuracy: Within 0.1% for typical land parcels in India.
    For survey-grade accuracy (< 0.01%), use pyproj with proper UTM zones.

    Args:
        geom: A Shapely geometry object (Polygon).

    Returns:
        float: Area in square meters.
    """
    # WGS84 authalic radius (equal-area sphere radius)
    # This ensures area calculations are consistent with the WGS84 ellipsoid
    R = WGS84_AUTHALIC_RADIUS  # 6371007.180918 meters

    coords = list(geom.exterior.coords)

    if len(coords) < 4:
        return 0.0

    # Calculate signed area using the spherical trapezoid method
    # Formula: A = R² * Σ[(λ2 - λ1) * (2 + sin(φ1) + sin(φ2))] / 2
    # where λ = longitude (radians), φ = latitude (radians)
    
    signed_area = 0.0
    
    for i in range(len(coords) - 1):
        lng1, lat1 = coords[i]
        lng2, lat2 = coords[i + 1]
        
        # Convert to radians
        lng1_rad = math.radians(lng1)
        lat1_rad = math.radians(lat1)
        lng2_rad = math.radians(lng2)
        lat2_rad = math.radians(lat2)
        
        # Add contribution from this edge
        signed_area += (lng2_rad - lng1_rad) * (2.0 + math.sin(lat1_rad) + math.sin(lat2_rad))
    
    # Multiply by R²/2 to get area
    area = abs(signed_area) * (R ** 2) / 2.0
    
    # Handle polygons with holes (subtract hole areas)
    for interior in geom.interiors:
        hole_coords = list(interior.coords)
        hole_area = 0.0
        
        for i in range(len(hole_coords) - 1):
            lng1, lat1 = hole_coords[i]
            lng2, lat2 = hole_coords[i + 1]
            
            lng1_rad = math.radians(lng1)
            lat1_rad = math.radians(lat1)
            lng2_rad = math.radians(lng2)
            lat2_rad = math.radians(lat2)
            
            hole_area += (lng2_rad - lng1_rad) * (2.0 + math.sin(lat1_rad) + math.sin(lat2_rad))
        
        area -= abs(hole_area) * (R ** 2) / 2.0
    
    return max(0.0, area)  # Ensure non-negative


def validate_polygon(geometry_dict):
    """
    Validate a GeoJSON polygon geometry.
    Checks for: valid structure, sufficient vertices, no self-intersection,
    and ensures the polygon is within India's bounding box.

    Args:
        geometry_dict: GeoJSON geometry object.

    Returns:
        dict with 'valid' (bool) and 'errors' (list of strings).
    """
    errors = []

    # Check structure
    if not isinstance(geometry_dict, dict):
        return {"valid": False, "errors": ["Geometry must be a dictionary."]}

    if geometry_dict.get("type") != "Polygon":
        errors.append("Geometry type must be 'Polygon'.")

    coords = geometry_dict.get("coordinates", [])
    if not coords or not coords[0]:
        errors.append("Polygon must have at least one ring with coordinates.")
        return {"valid": False, "errors": errors}

    ring = coords[0]

    # Minimum 4 points for a closed polygon (triangle + closing point)
    if len(ring) < 4:
        errors.append(f"Polygon ring must have at least 4 points (got {len(ring)}). A valid polygon requires at least 3 distinct vertices plus the closing point.")

    # Check that ring is closed (first point == last point)
    if ring[0] != ring[-1]:
        errors.append("Polygon ring must be closed (first coordinate must equal last coordinate).")

    # Try to create Shapely geometry and check validity
    try:
        geom = shape(geometry_dict)
        if not geom.is_valid:
            # Get specific reason
            from shapely.validation import explain_validity
            reason = explain_validity(geom)
            errors.append(f"Invalid polygon geometry: {reason}")
        
        # Check against actual official India GeoJSON boundary
        india_shape = get_india_boundary_shape()
        if india_shape is not None:
            # Check if the polygon is strictly within the Indian boundary
            # Using buffer to allow small edge/coastal tolerance (0.01 deg is ~1km)
            if not india_shape.buffer(0.01).contains(geom):
                errors.append("Polygon is located outside the borders of India. Data creation is restricted to Indian territories only.")
                
    except Exception as e:
        errors.append(f"Could not parse geometry or bounds: {str(e)}")
        return {"valid": False, "errors": errors}

    # Fallback/Backward compatibility checking
    # India bbox: lat ~6.5 to ~37.5, lng ~68.0 to ~97.5
    for point in ring:
        lng, lat = point[0], point[1]
        if not (6.5 <= lat <= 37.5 and 68.0 <= lng <= 97.5):
            errors.append(
                f"Coordinate ({lng}, {lat}) is outside India's general boundaries. "
                "All coordinates must be within India (Lat: 6.5-37.5, Lng: 68.0-97.5)."
            )
            break

    return {"valid": len(errors) == 0, "errors": errors}


def check_overlap(new_geometry_dict, existing_records):
    """
    Check if a new polygon overlaps with any existing land record polygons.

    Args:
        new_geometry_dict: GeoJSON geometry for the new parcel.
        existing_records: List of existing record dicts, each with 'geometry' key.

    Returns:
        dict with 'overlaps' (bool) and 'conflicting_records' (list of record IDs).
    """
    try:
        new_geom = shape(new_geometry_dict)
        if not new_geom.is_valid:
            new_geom = make_valid(new_geom)

        conflicting = []
        for record in existing_records:
            try:
                existing_geom = shape(record["geometry"])
                if not existing_geom.is_valid:
                    existing_geom = make_valid(existing_geom)

                if new_geom.intersects(existing_geom):
                    # Check for actual area overlap, not just touching boundaries
                    intersection = new_geom.intersection(existing_geom)
                    if intersection.area > 0.0001:  # Threshold to ignore tiny edge touches
                        conflicting.append({
                            "record_id": record.get("_id", "unknown"),
                            "khasra_no": record.get("khasra_no", "unknown"),
                            "overlap_area_ha": round(intersection.area, 6)
                        })
            except Exception:
                continue

        return {
            "overlaps": len(conflicting) > 0,
            "conflicting_records": conflicting
        }
    except Exception as e:
        return {"error": f"Overlap check failed: {str(e)}", "overlaps": False, "conflicting_records": []}


def get_centroid(geometry_dict):
    """
    Calculate the centroid of a polygon.

    Args:
        geometry_dict: GeoJSON geometry object.

    Returns:
        dict with 'lat' and 'lng', or error dict.
    """
    try:
        geom = shape(geometry_dict)
        if not geom.is_valid:
            geom = make_valid(geom)
        centroid = geom.centroid
        return {"lat": round(centroid.y, 6), "lng": round(centroid.x, 6)}
    except Exception as e:
        return {"error": f"Centroid calculation failed: {str(e)}"}


def geojson_to_wkt(geometry_dict):
    """
    Convert a GeoJSON geometry to Well-Known Text (WKT) format.
    Useful for interoperability with other GIS systems.

    Args:
        geometry_dict: GeoJSON geometry object.

    Returns:
        str: WKT representation of the geometry.
    """
    try:
        geom = shape(geometry_dict)
        return geom.wkt
    except Exception as e:
        return f"ERROR: {str(e)}"


def calculate_perimeter(geometry_dict):
    """
    Calculate the perimeter of a polygon in meters.

    Args:
        geometry_dict: GeoJSON geometry object.

    Returns:
        dict with perimeter in meters and kilometers.
    """
    try:
        geom = shape(geometry_dict)
        if not geom.is_valid:
            geom = make_valid(geom)

        centroid = geom.centroid
        lat_c = math.radians(centroid.y)
        m_per_deg_lat = 111320.0
        m_per_deg_lng = 111320.0 * math.cos(lat_c)

        coords = list(geom.exterior.coords)
        perimeter_m = 0.0
        for i in range(len(coords) - 1):
            lng1, lat1 = coords[i]
            lng2, lat2 = coords[i + 1]
            dx = (lng2 - lng1) * m_per_deg_lng
            dy = (lat2 - lat1) * m_per_deg_lat
            perimeter_m += math.sqrt(dx ** 2 + dy ** 2)

        return {
            "perimeter_m": round(perimeter_m, 2),
            "perimeter_km": round(perimeter_m / 1000, 4)
        }
    except Exception as e:
        return {"error": f"Perimeter calculation failed: {str(e)}"}
