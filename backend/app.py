import os
import traceback
from flask import Flask, jsonify
from flask_cors import CORS

from db import init_auth_table
from auth import ensure_default_admin
from routes.crud import crud_bp
from routes.auth_routes import auth_bp
from routes.insights import insights_bp


def create_app():
    app = Flask(__name__)
    CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=False)

    app.register_blueprint(auth_bp)
    app.register_blueprint(crud_bp)
    app.register_blueprint(insights_bp)

    @app.route("/api/health")
    def health():
        return jsonify({"ok": True, "service": "CarbonNeutralEnergy API"})

    @app.errorhandler(404)
    def nf(_):
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(Exception)
    def handle(e):
        # Don't leak DB internals
        traceback.print_exc()
        return jsonify({"error": "Server error"}), 500

    return app


if __name__ == "__main__":
    try:
        ensure_default_admin()
    except Exception as e:
        print(f"[startup] Could not init auth table (DB not reachable?): {e}")
    app = create_app()
    port = int(os.getenv("PORT", "5000"))
    print(f"\n🌱  Carbon-Neutral Energy API on http://localhost:{port}")
    print("    Default admin -> username: admin   password: admin123\n")
    app.run(host="0.0.0.0", port=port, debug=True)
