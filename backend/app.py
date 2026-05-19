import json
import os
import uuid
from pathlib import Path

from agent import generate_request
from dotenv import load_dotenv
from extractor import extract_fields, read_resume_text
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from models import Candidate, Document, RequestLog, db
from werkzeug.utils import secure_filename

load_dotenv()

BASE_DIR = Path(__file__).parent
UPLOAD_DIR = BASE_DIR / "uploads"  # creating a sample path for resume uploads
UPLOAD_DIR.mkdir(exist_ok=True)

DOC_DIR = BASE_DIR / "documents"
DOC_DIR.mkdir(exist_ok=True)

ALLOWED_DOC_IMG = {".jpg", ".jpeg", ".png", ".pdf"}

ALLOWED_RESUME = {".pdf", ".docx", ".doc"}
MAX_BYTES = 10 * 1024 * 1024  # 10 MB


def create_app():
    app = Flask(__name__)

    db_url = os.getenv("DATABASE_URL", "")
    # Render hands out "postgres://" but SQLAlchemy 2.x wants "postgresql://"
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)
    app.config["SQLALCHEMY_DATABASE_URI"] = db_url
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
        "pool_pre_ping": True,
        "pool_recycle": 300,
    }
    app.config["MAX_CONTENT_LENGTH"] = MAX_BYTES

    CORS(app)
    db.init_app(app)

    with app.app_context():
        db.create_all()

    @app.get("/")
    def health():
        return {"status": "ok"}

    @app.post("/candidates/upload")
    def upload_resume():
        if "file" not in request.files:
            return jsonify({"error": "No file uploaded"}), 400

        f = request.files["file"]
        if not f.filename:
            return jsonify({"error": "Empty filename"}), 400

        ext = Path(f.filename).suffix.lower()
        if ext not in ALLOWED_RESUME:
            return jsonify({"error": f"Unsupported file type: {ext}"}), 400

        safe = secure_filename(f.filename)  # sanitizing the file name
        stored = f"{uuid.uuid4().hex}_{safe}"
        path = UPLOAD_DIR / stored
        f.save(path)

        candidate = Candidate(
            resume_filename=safe,
            resume_path=str(path),
            extraction_status="pending",
        )

        db.session.add(candidate)
        db.session.commit()

        try:
            text = read_resume_text(str(path))
            candidate.raw_text = text
            fields = extract_fields(text)
            candidate.name = fields["name"]
            candidate.email = fields["email"]
            candidate.phone = fields["phone"]
            candidate.company = fields["company"]
            candidate.designation = fields["designation"]
            candidate.skills = json.dumps(fields["skills"])
            candidate.confidence = json.dumps(fields["confidence"])
            candidate.extraction_status = "done"
        except Exception as e:
            candidate.extraction_status = "failed"
            candidate.extraction_error = str(e)

        db.session.commit()
        return jsonify(candidate.to_dict()), 201

    @app.get("/candidates")
    def list_candidates():
        candidates = Candidate.query.order_by(Candidate.created_at.desc()).all()
        data = [c.to_dict() for c in candidates]
        return jsonify(data)

    @app.get("/candidates/<int:cid>")
    def get_candidate(cid):
        c = Candidate.query.get_or_404(cid)
        data = c.to_dict()
        data["documents"] = [d.to_dict() for d in c.documents]
        data["request_logs"] = [r.to_dict() for r in c.request_logs]
        return jsonify(data)

    @app.post("/candidates/<int:cid>/request-documents")
    def request_documents(cid):
        c = Candidate.query.get_or_404(cid)
        if not c.email and not c.phone:
            return jsonify({"error": "Candidate has neither email nor phone"}), 400

        try:
            payload = generate_request(c.to_dict())
        except Exception as e:
            return jsonify({"error": f"Agent failed: {e}"}), 500

        log = RequestLog(
            candidate_id=c.id,
            channel=payload["channel"],
            recipient=payload["recipient"],
            subject=payload.get("subject", ""),
            body=payload["body"],
        )
        db.session.add(log)
        db.session.commit()
        return jsonify(log.to_dict()), 201

    @app.post("/candidates/<int:cid>/submit-documents")
    def submit_documents(cid):
        c = Candidate.query.get_or_404(cid)

        saved = []
        for field in ("pan", "aadhaar"):
            if field not in request.files:
                continue
            f = request.files[field]
            if not f.filename:
                continue

            ext = Path(f.filename).suffix.lower()
            if ext not in ALLOWED_DOC_IMG:
                return jsonify({"error": f"Unsupported {field} file type: {ext}"}), 400

            safe = secure_filename(f.filename)
            stored = f"{uuid.uuid4().hex}_{field}_{safe}"
            path = DOC_DIR / stored
            f.save(path)

            doc = Document(
                candidate_id=c.id,
                doc_type=field,
                filename=safe,
                path=str(path),
            )
            db.session.add(doc)
            saved.append(doc)

        if not saved:
            return jsonify(
                {"error": "No documents provided. Send 'pan' and/or 'aadhaar' files."}
            ), 400

        db.session.commit()
        return jsonify([d.to_dict() for d in saved]), 201

    @app.get("/candidates/<int:cid>/documents/<int:doc_id>")
    def download_document(cid, doc_id):
        doc = Document.query.filter_by(id=doc_id, candidate_id=cid).first_or_404()
        return send_file(doc.path, download_name=doc.filename, as_attachment=False)

    return app


app = create_app()

if __name__ == "__main__":
    app.run(port=5050, debug=True)
