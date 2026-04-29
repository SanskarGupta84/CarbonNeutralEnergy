import os
import datetime as dt
from functools import wraps
import bcrypt
import jwt
from flask import request, jsonify, g
from db import query_one, execute, init_auth_table

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret")
JWT_ALG = "HS256"
JWT_EXP_HOURS = 12

ROLES = ("admin", "analyst", "viewer")


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def make_token(user):
    payload = {
        "uid": user["user_id"],
        "username": user["username"],
        "role": user["role"],
        "exp": dt.datetime.utcnow() + dt.timedelta(hours=JWT_EXP_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token):
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])


def require_auth(*allowed_roles):
    def deco(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            auth = request.headers.get("Authorization", "")
            if not auth.startswith("Bearer "):
                return jsonify({"error": "Missing token"}), 401
            token = auth.split(" ", 1)[1].strip()
            try:
                payload = decode_token(token)
            except Exception:
                return jsonify({"error": "Invalid or expired token"}), 401
            g.user = payload
            if allowed_roles and payload.get("role") not in allowed_roles:
                return jsonify({"error": "Forbidden"}), 403
            return fn(*args, **kwargs)
        return wrapper
    return deco


def ensure_default_admin():
    init_auth_table()
    existing = query_one("SELECT user_id FROM AppUser WHERE username=%s", ("admin",))
    if not existing:
        execute(
            "INSERT INTO AppUser (username, password_hash, role) VALUES (%s,%s,%s)",
            ("admin", hash_password("admin123"), "admin"),
        )
        print("[auth] Created default admin user -> username: admin  password: admin123")
