import os
import sys
import time
import socket
import threading
import uuid
from datetime import datetime, timedelta
import json
from flask import Flask, jsonify
from werkzeug.security import generate_password_hash

from config import SECRET_KEY, DEBUG, HOST, PORT, MONGO_URI
from routes import (
    pages_bp, auth_bp, records_bp, users_bp, 
    gis_bp, documents_bp, feedback_bp, utils_bp
)
from core import DATA_DIR, load_users, save_users, users_collection

def create_app():
    app = Flask(__name__)
    app.secret_key = SECRET_KEY
    app.permanent_session_lifetime = timedelta(days=30)

    # Register Blueprints
    app.register_blueprint(pages_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(records_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(gis_bp)
    app.register_blueprint(documents_bp)
    app.register_blueprint(feedback_bp)
    app.register_blueprint(utils_bp)

    @app.route('/ping', methods=['GET'])
    def ping():
        return jsonify({"status": "alive"}), 200

    @app.after_request
    def add_header(response):
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response

    return app

app = create_app()

def bootstrap_admin():
    """Bootstrap default admin if no superadmin exists with the standard ID."""
    try:
        if users_collection is not None:
            # Check for the specific bootstrap ID to ensure test consistency
            bootstrap_user = users_collection.find_one({"user_id": "bootstrap-admin-01"})
            if not bootstrap_user:
                default_admin_user = os.environ.get("DEFAULT_ADMIN_USER", "admin")
                default_admin_password = os.environ.get("DEFAULT_ADMIN_PASSWORD", "password123")
                users = load_users()
                new_sa = {
                    "user_id": "bootstrap-admin-01",
                    "username": default_admin_user,
                    "password_hash": generate_password_hash(default_admin_password),
                    "role": "superadmin",
                    "full_name": "System Administrator",
                    "email": "admin@indialims.edu",
                    "phone": "+91-0000000000",
                    "designation": "System Administrator",
                    "department": "Land Records",
                    "office_location": "System Default",
                    "is_active": True,
                    "is_recovery": True, # Grant recovery rights for testing
                    "created_at": datetime.now().isoformat() + "Z",
                    "last_login": datetime.now().isoformat() + "Z"
                }
                # If 'admin' username is taken by a non-bootstrap user, use a unique one
                if any(u.get('username') == default_admin_user for u in users):
                    new_sa['username'] = f"admin_root_{uuid.uuid4().hex[:4]}"
                
                users.append(new_sa)
                save_users(users)
                print(f"[BOOTSTRAP] System Administrator '{new_sa['username']}' created.")
    except Exception as e:
        print(f"Bootstrap error: {e}")

    # If the users collection is empty or missing expected test accounts, seed from user_id_password.json
    try:
        existing = load_users()
        if not existing:
            cred_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'user_id_password.json')
            if os.path.exists(cred_file):
                with open(cred_file, 'r', encoding='utf-8') as f:
                    try:
                        creds = json.load(f)
                    except Exception:
                        creds = []

                seeded = []
                for idx, c in enumerate(creds):
                    uname = c.get('username') or c.get('user_id')
                    pwd = c.get('password')
                    if not uname or not pwd:
                        continue
                    user_id = f"user-{uuid.uuid4().hex[:8]}"
                    role = 'admin'
                    is_recovery = False
                    if idx == 0 or uname == os.environ.get('DEFAULT_ADMIN_USER', 'admin'):
                        role = 'superadmin'
                        user_id = 'bootstrap-admin-01'
                    if isinstance(uname, str) and uname.startswith('recovery_sa_'):
                        is_recovery = True
                        role = 'superadmin'

                    seeded_user = {
                        'user_id': user_id,
                        'username': uname,
                        'password_hash': generate_password_hash(pwd),
                        'role': role,
                        'is_recovery': is_recovery,
                        'created_at': datetime.now().isoformat() + 'Z'
                    }
                    seeded.append(seeded_user)

                if seeded:
                    save_users(seeded)
                    print(f"[BOOTSTRAP] Seeded {len(seeded)} user(s) from {cred_file}")
    except Exception:
        pass

# Ensure a bootstrap superadmin exists when the app is imported (useful for tests)
try:
    bootstrap_admin()
except Exception:
    # Non-fatal: if DB isn't reachable at import time, tests or runtime will still try again when running __main__
    pass

if __name__ == "__main__":
    # Redirect logs safely
    log_path = os.path.join(os.environ.get('APPDATA', os.path.dirname(os.path.abspath(__file__))), "LIMS.log")
    if sys.stdout is None or getattr(sys.stdout, "closed", True):
        sys.stdout = open(log_path, "w", encoding="utf-8")
    if sys.stderr is None or getattr(sys.stderr, "closed", True):
        sys.stderr = open(log_path, "a", encoding="utf-8")

    os.makedirs(DATA_DIR, exist_ok=True)
    bootstrap_admin()

    print("\n" + "=" * 60)
    print("  LIMS - Modular Version")
    print(f"  Server starting on http://{HOST}:{PORT}")
    print("=" * 60 + "\n")

    try:
        import webview
        def get_free_port(start_port):
            for port in range(start_port, 65535):
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    try:
                        s.bind((HOST, port))
                        return port
                    except OSError: continue
            return start_port

        actual_port = get_free_port(PORT)
        def start_server():
            app.run(host=HOST, port=actual_port, debug=False, use_reloader=False)

        threading.Thread(target=start_server, daemon=True).start()
        time.sleep(2)
        display_host = "127.0.0.1" if HOST == "0.0.0.0" else HOST
        webview.settings['ALLOW_DOWNLOADS'] = True
        webview.create_window("LIMS", url=f"http://{display_host}:{actual_port}/login", width=1400, height=900)
        webview.start()
    except ImportError:
        app.run(host=HOST, port=PORT, debug=DEBUG)
