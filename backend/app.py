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
    # sqlalchemy 2.x wants postgresql:// scheme, render gives us postgres://
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)
    app.config["SQLALCHEMY_DATABASE_URI"] = db_url
    # getting 500 errors from db due to coneection close on 5 mintes idle time on free tiender with render
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

        # secure_filename strips path traversal like ../, uuid prefix
        safe = secure_filename(f.filename)
        stored = f"{uuid.uuid4().hex}_{safe}"
        path = UPLOAD_DIR / stored
        f.save(path)

        # commit the candidate row FIRST with status=pending, then extract, this ensures that if extraction fails, we still have candidate info with pending extraction
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
            # store the error so we can debug/retry later instead of just
            # losing it
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

    @app.get("/candidates/<int:cid>/resume")
    def download_resume(cid):
        c = Candidate.query.get_or_404(cid)
        if not Path(c.resume_path).exists():
            return jsonify({"error": "Resume file no longer on disk"}), 404
        return send_file(
            c.resume_path, download_name=c.resume_filename, as_attachment=False
        )

    @app.post("/candidates/<int:cid>/re-extract")
    def re_extract(cid):
        c = Candidate.query.get_or_404(cid)
        text = c.raw_text
        if not text:
            if not Path(c.resume_path).exists():
                return jsonify({"error": "Resume file no longer on disk"}), 404
            try:
                text = read_resume_text(c.resume_path)
                c.raw_text = text
            except Exception as e:
                c.extraction_status = "failed"
                c.extraction_error = f"read_resume_text: {e}"
                db.session.commit()
                return jsonify({"error": str(e)}), 500

        try:
            fields = extract_fields(text)
            c.name = fields["name"]
            c.email = fields["email"]
            c.phone = fields["phone"]
            c.company = fields["company"]
            c.designation = fields["designation"]
            c.skills = json.dumps(fields["skills"])
            c.confidence = json.dumps(fields["confidence"])
            c.extraction_status = "done"
            c.extraction_error = None
        except Exception as e:
            c.extraction_status = "failed"
            c.extraction_error = str(e)
            db.session.commit()
            return jsonify({"error": str(e)}), 500

        db.session.commit()
        return jsonify(c.to_dict())

    @app.post("/candidates/<int:cid>/replace-resume")
    def replace_resume(cid):
        c = Candidate.query.get_or_404(cid)

        if "file" not in request.files:
            return jsonify({"error": "No file uploaded"}), 400
        f = request.files["file"]
        if not f.filename:
            return jsonify({"error": "Empty filename"}), 400

        ext = Path(f.filename).suffix.lower()
        if ext not in ALLOWED_RESUME:
            return jsonify({"error": f"Unsupported file type: {ext}"}), 400

        safe = secure_filename(f.filename)
        stored = f"{uuid.uuid4().hex}_{safe}"
        new_path = UPLOAD_DIR / stored
        f.save(new_path)

        # we only delete the old file once new is up and extracted
        old_path = c.resume_path
        c.resume_filename = safe
        c.resume_path = str(new_path)
        c.raw_text = None
        c.extraction_status = "pending"
        c.extraction_error = None

        try:
            text = read_resume_text(str(new_path))
            c.raw_text = text
            fields = extract_fields(text)
            c.name = fields["name"]
            c.email = fields["email"]
            c.phone = fields["phone"]
            c.company = fields["company"]
            c.designation = fields["designation"]
            c.skills = json.dumps(fields["skills"])
            c.confidence = json.dumps(fields["confidence"])
            c.extraction_status = "done"
        except Exception as e:
            c.extraction_status = "failed"
            c.extraction_error = str(e)

        db.session.commit()
        if old_path and old_path != str(new_path):
            try:
                Path(old_path).unlink(missing_ok=True)
            except OSError:
                pass

        return jsonify(c.to_dict())

    @app.post("/admin/poll-email")
    @app.get("/admin/poll-email")
    def poll_email():
        expected = os.getenv("POLL_TOKEN")
        if expected and request.args.get("token") != expected:
            return jsonify({"error": "unauthorized"}), 401

        from worker import run_one_poll

        try:
            run_one_poll()
        except Exception as e:
            return jsonify({"status": "error", "error": str(e)}), 500
        return jsonify({"status": "ok"}), 200

    return app


app = create_app()

if __name__ == "__main__":
    app.run(port=5050, debug=True)
