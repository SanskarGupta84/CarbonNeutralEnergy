from flask import Blueprint, request, jsonify
from db import query_one, execute
from auth import hash_password, verify_password, make_token, require_auth

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/api/auth/signup", methods=["POST"])
def signup():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    role = data.get("role") or "viewer"
    if role not in ("admin", "analyst", "viewer"):
        role = "viewer"
    if len(username) < 3 or len(password) < 6:
        return jsonify({"error": "Username >=3 chars, password >=6 chars"}), 400
    existing = query_one("SELECT user_id FROM AppUser WHERE username=%s", (username,))
    if existing:
        return jsonify({"error": "Username taken"}), 409
    execute("INSERT INTO AppUser (username, password_hash, role) VALUES (%s,%s,%s)",
            (username, hash_password(password), role))
    user = query_one("SELECT user_id, username, role FROM AppUser WHERE username=%s", (username,))
    token = make_token(user)
    return jsonify({"token": token, "user": user}), 201


@auth_bp.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    user = query_one("SELECT user_id, username, role, password_hash FROM AppUser WHERE username=%s", (username,))
    if not user or not verify_password(password, user["password_hash"]):
        return jsonify({"error": "Invalid credentials"}), 401
    safe = {"user_id": user["user_id"], "username": user["username"], "role": user["role"]}
    token = make_token(safe)
    return jsonify({"token": token, "user": safe})


@auth_bp.route("/api/auth/me", methods=["GET"])
@require_auth("admin", "analyst", "viewer")
def me():
    from flask import g
    return jsonify(g.user)
