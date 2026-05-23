import json
from datetime import datetime

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class Candidate(db.Model):
    __tablename__ = "candidates"

    id = db.Column(db.Integer, primary_key=True)

    resume_filename = db.Column(db.String(255), nullable=False)
    resume_path = db.Column(
        db.String(500), nullable=False
    )  # to prevent collisions of two users adding resume with same name, we add a UUID prefix here
    raw_text = db.Column(
        db.Text
    )  # we are storing raw text because computing this everytime will be an expensive process

    name = db.Column(db.String(255))
    email = db.Column(db.String(255))
    phone = db.Column(db.String(50))
    company = db.Column(db.String(255))
    designation = db.Column(db.String(255))
    skills = db.Column(db.Text)
    confidence = db.Column(db.Text)

    extraction_status = db.Column(db.String(20), default="pending")
    extraction_error = db.Column(db.Text)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    documents = db.relationship(  # a relationship between documents and candidates, also removeing all instances if candidate is deleted
        "Document", backref="candidate", cascade="all, delete-orphan"
    )
    request_logs = db.relationship(
        "RequestLog", backref="candidate", cascade="all, delete-orphan"
    )

    def to_dict(self):
        types_present = {d.doc_type for d in self.documents}
        has_pan = "pan" in types_present
        has_aadhaar = "aadhaar" in types_present
        if has_pan and has_aadhaar:
            docs_status = "complete"
        elif types_present:
            docs_status = "partial"
        else:
            docs_status = "missing"

        return {
            "id": self.id,
            "resume_filename": self.resume_filename,
            "name": self.name,
            "email": self.email,
            "phone": self.phone,
            "company": self.company,
            "designation": self.designation,
            "skills": json.loads(self.skills) if self.skills else [],
            "confidence": json.loads(self.confidence) if self.confidence else {},
            "extraction_status": self.extraction_status,
            "extraction_error": self.extraction_error,
            "documents_status": docs_status,
            "has_pan": has_pan,
            "has_aadhaar": has_aadhaar,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Document(db.Model): 
    __tablename__ = "documents"

    id = db.Column(db.Integer, primary_key=True)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"), nullable=False)
    doc_type = db.Column(db.String(20), nullable=False)  # 'pan' or 'aadhaar'
    filename = db.Column(db.String(255), nullable=False)
    path = db.Column(db.String(500), nullable=False)
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "doc_type": self.doc_type,
            "filename": self.filename,
            "uploaded_at": self.uploaded_at.isoformat() if self.uploaded_at else None,
        }


class RequestLog(
    db.Model
):  # request log section to store what all requests must have been sent
    __tablename__ = "request_logs"

    id = db.Column(db.Integer, primary_key=True)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"), nullable=False)
    channel = db.Column(db.String(20), nullable=False)  # 'email' or 'sms'
    recipient = db.Column(db.String(255), nullable=False)
    subject = db.Column(db.String(500))
    body = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "channel": self.channel,
            "recipient": self.recipient,
            "subject": self.subject,
            "body": self.body,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
