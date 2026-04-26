from datetime import datetime
from flask import Blueprint, request, jsonify, session
from werkzeug.security import check_password_hash
from core import generate_captcha, verify_captcha_logic, load_users, save_users

auth_bp = Blueprint('auth', __name__)

@auth_bp.route("/api/captcha", methods=["GET"])
def get_captcha():
    question, token = generate_captcha()
    return jsonify({"question": question, "token": token})

@auth_bp.route("/api/verify-captcha", methods=["POST"])
def verify_captcha():
    data = request.get_json() or {}
    user_answer = str(data.get("answer", "")).strip()
    token = str(data.get("token", "")).strip()

    if verify_captcha_logic(token, user_answer):
        session.permanent = True
        session["role"] = "viewer"
        session["username"] = "Viewer"
        return jsonify({"success": True, "redirect": "/viewer"})
    else:
        new_question, new_token = generate_captcha()
        return jsonify({"success": False, "message": "Incorrect answer or expired. Please try again.", "new_question": new_question, "new_token": new_token}), 400

@auth_bp.route("/api/login", methods=["POST"])
def admin_login():
    data = request.get_json() or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        return jsonify({"error": "Username and password are required."}), 400

    users = load_users()
    user = next((u for u in users if u["username"] == username), None)

    if user and check_password_hash(user["password_hash"], password):
        session.permanent = True
        role = (user.get("role") or "Officer").lower()
        session["role"] = role
        session["username"] = username
        session["admin_id"] = user.get("user_id", "")

        user["last_login"] = datetime.now().isoformat() + "Z"
        save_users(users)

        redirect_url = "/admin" if role in ("admin", "superadmin") else "/viewer"
        return jsonify({"success": True, "redirect": redirect_url})
    else:
        return jsonify({"error": "Invalid username or password."}), 401

@auth_bp.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"success": True, "redirect": "/login"})

@auth_bp.route("/api/session-info", methods=["GET"])
def session_info():
    return jsonify({
        "role": session.get("role", None),
        "username": session.get("username", None),
        "is_authenticated": session.get("role") is not None
    })

@auth_bp.route("/api/forgot", methods=["GET", "POST"])
def forgot_password():
    """Handle password recovery instructions."""
    return jsonify({
        "success": True, 
        "instructions": "To recover your password, please contact the District Revenue Officer or System Administrator at support@india-lims.gov.in. Provide your Employee ID and Office Location for verification."
    })
