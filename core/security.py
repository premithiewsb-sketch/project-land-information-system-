import string
import random
from functools import wraps
from flask import session, jsonify
from itsdangerous import URLSafeTimedSerializer
from config import SECRET_KEY

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        role = (session.get("role") or "").lower()
        if role not in ("admin", "superadmin"):
            return jsonify({"error": "Unauthorized. Admin access required."}), 403
        return f(*args, **kwargs)
    return decorated_function

def viewer_or_admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        role = (session.get("role") or "").lower()
        if role not in ("admin", "superadmin", "viewer", "officer"):
            return jsonify({"error": "Unauthorized. Please log in or pass CAPTCHA."}), 401
        return f(*args, **kwargs)
    return decorated_function

def role_required(*allowed_roles):
    allowed = tuple(r.lower() for r in allowed_roles)
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            role = (session.get("role") or "").lower()
            if role not in allowed:
                return jsonify({"error": "Unauthorized. Insufficient role."}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def generate_captcha():
    chars = string.ascii_letters
    captcha_text = ''.join(random.choice(chars) for _ in range(6))
    serializer = URLSafeTimedSerializer(SECRET_KEY)
    token = serializer.dumps(captcha_text, salt='captcha-salt')
    return captcha_text, token

def verify_captcha_logic(token, user_answer):
    serializer = URLSafeTimedSerializer(SECRET_KEY)
    try:
        expected = serializer.loads(token, salt='captcha-salt', max_age=300)
        return user_answer == expected
    except Exception:
        return False
