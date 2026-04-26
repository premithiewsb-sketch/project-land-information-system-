import uuid
import os
import json
from datetime import datetime
from flask import Blueprint, request, jsonify, session
from core import (
    load_feedback, save_feedback, load_records, admin_required, 
    viewer_or_admin_required, _apply_filters_to_records, audit_collection, DATA_DIR,
    _calculate_estimated_value
)

feedback_bp = Blueprint('feedback', __name__)

@feedback_bp.route("/api/feedback", methods=["GET"])
@admin_required
def get_feedback():
    """Admin-only: Fetch all feedback submissions."""
    return jsonify(load_feedback())

@feedback_bp.route("/api/feedback", methods=["POST"])
@viewer_or_admin_required
def submit_feedback():
    """Submit feedback or issue reports."""
    data = request.get_json() or {}
    email = data.get("email", "").strip()
    message = data.get("message", "").strip()
    if not email or not message:
        return jsonify({"error": "Required fields missing."}), 400
        
    entry = {
        "id": str(uuid.uuid4()),
        "email": email,
        "type": data.get("type", "General"),
        "message": message,
        "timestamp": datetime.now().isoformat(),
        "status": "New"
    }
    fb = load_feedback()
    fb.append(entry)
    save_feedback(fb)
    return jsonify({"success": True})

@feedback_bp.route("/api/dashboard", methods=["GET"])
@admin_required
def dashboard_analytics():
    """Compute heavy aggregation for the admin dashboard charts and KPIs."""
    records = load_records()
    params = {k: request.args.get(k, "") for k in ["state", "district", "village", "land_use", "search"]}
    filtered = _apply_filters_to_records(records, params)
    
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
        lu = attrs.get("land_use", "Agricultural")
        value = _calculate_estimated_value(area, rate, lu)
        
        total_area += area
        total_value += value
        muts = rec.get("mutation_history", []) or []
        total_mutations += len(muts)
        
        # Land use distribution
        lu = attrs.get("land_use", "Unknown")
        if lu not in land_use_stats: land_use_stats[lu] = {"count": 0, "area": 0.0}
        land_use_stats[lu]["count"] += 1
        land_use_stats[lu]["area"] += area
        
        # District stats
        d = loc.get("district", "Unknown")
        if d not in district_stats: district_stats[d] = {"count": 0, "area": 0.0, "value": 0.0}
        district_stats[d]["count"] += 1
        district_stats[d]["area"] += area
        district_stats[d]["value"] += value
        
        if value > top_parcel_value:
            top_parcel_value = value
            top_parcel = {
                "khasra_no": rec.get("khasra_no"), 
                "ulpin": rec.get("ulpin"),
                "village": loc.get("village"), 
                "district": d, 
                "land_use": attrs.get("land_use", "N/A"),
                "area_ha": round(area, 2),
                "estimated_value": round(value, 0)
            }
            
    sorted_districts = sorted(district_stats.items(), key=lambda x: x[1]["value"], reverse=True)[:6]
    
    all_mutations = []
    for rec in filtered:
        for m in rec.get("mutation_history", []) or []:
            all_mutations.append({
                "khasra_no": rec.get("khasra_no"), 
                "district": rec.get("location", {}).get("district"),
                "previous_owner": m.get("previous_owner"), 
                "mutation_date": m.get("mutation_date"),
                "mutation_type": m.get("mutation_type", "Mutation")
            })
    all_mutations.sort(key=lambda x: str(x.get("mutation_date", "")), reverse=True)
    
    return jsonify({
        "kpis": {
            "total_parcels": len(filtered),
            "total_area": round(total_area, 2),
            "estimated_value": round(total_value, 0),
            "total_mutations": total_mutations
        },
        "land_use_distribution": land_use_stats,
        "district_overview": [{"name": d, **s} for d, s in sorted_districts],
        "top_parcel": top_parcel,
        "recent_mutations": all_mutations[:6]
    })

@feedback_bp.route('/api/audit', methods=['GET'])
@admin_required
def list_audit():
    """Fetch system audit logs."""
    limit = min(100, max(1, int(request.args.get('limit', 50))))
    if audit_collection is not None:
        entries = list(audit_collection.find({}, {'_id': 0}).sort('timestamp', -1).limit(limit))
    else:
        audit_file = os.path.join(DATA_DIR, 'audit.json')
        if os.path.exists(audit_file):
            with open(audit_file, 'r', encoding='utf-8') as f:
                entries = json.load(f)
                entries = sorted(entries, key=lambda x: x.get('timestamp', ''), reverse=True)[:limit]
        else:
            entries = []
    return jsonify(entries)

@feedback_bp.route("/api/feedback/<feedback_id>", methods=["DELETE"])
@admin_required
def delete_feedback(feedback_id):
    fb = load_feedback()
    new_fb = [entry for entry in fb if entry.get("id") != feedback_id]
    if len(new_fb) == len(fb):
        return jsonify({"error": "Feedback not found."}), 404
    save_feedback(new_fb)
    return jsonify({"success": True})

@feedback_bp.route("/api/feedback/<feedback_id>/status", methods=["PUT"])
@admin_required
def update_feedback_status(feedback_id):
    """Mark feedback as reviewed or resolved."""
    data = request.get_json() or {}
    new_status = data.get("status", "Reviewed")
    
    fb = load_feedback()
    entry = next((e for e in fb if e.get("id") == feedback_id), None)
    if not entry:
        return jsonify({"error": "Feedback not found."}), 404
        
    entry["status"] = new_status
    entry["reviewed_at"] = datetime.now().isoformat()
    entry["reviewed_by"] = session.get("username", "admin")
    
    save_feedback(fb)
    return jsonify({"success": True, "status": new_status})
