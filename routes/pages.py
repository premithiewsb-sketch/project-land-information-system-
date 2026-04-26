from flask import Blueprint, render_template, redirect, url_for, session, request, jsonify
from core import generate_captcha

pages_bp = Blueprint('pages', __name__)

@pages_bp.route("/")
def index():
    return redirect(url_for("pages.login_page"))

@pages_bp.route("/login")
def login_page():
    role = (session.get("role") or "").lower()
    if role in ("admin", "superadmin"):
        return redirect(url_for("pages.admin_dashboard"))
    elif role == "viewer":
        return redirect(url_for("pages.viewer_page"))
    captcha_question, captcha_token = generate_captcha()
    return render_template("login.html", captcha_question=captcha_question, captcha_token=captcha_token)

@pages_bp.route("/admin")
def admin_dashboard():
    role = (session.get("role") or "").lower()
    if role not in ("admin", "superadmin"):
        return redirect(url_for("pages.login_page"))
    return render_template("admin_dashboard.html", username=session.get("username", "Admin"))

@pages_bp.route("/viewer")
def viewer_page():
    role = (session.get("role") or "").lower()
    if role not in ("admin", "superadmin", "viewer"):
        return redirect(url_for("pages.login_page"))
    return render_template("public_viewer_v2.html")
