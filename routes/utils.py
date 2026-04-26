from flask import Blueprint, jsonify
from config import LAND_USE_OPTIONS, LAND_USE_COLORS, MUTATION_TYPES

utils_bp = Blueprint('utils', __name__)

@utils_bp.route("/api/config", methods=["GET"])
def app_config():
    return jsonify({
        "land_use_options": LAND_USE_OPTIONS,
        "land_use_colors": LAND_USE_COLORS,
        "mutation_types": MUTATION_TYPES
    })
