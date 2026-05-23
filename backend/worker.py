import email
import imaplib
import io
import os
import time
from datetime import datetime, timedelta
from email.message import Message
from email.utils import parseaddr
from pathlib import Path

import requests
from dotenv import load_dotenv

from app import create_app
from models import Candidate, db

load_dotenv()

ALLOWED_DOC_EXT = {".jpg", ".jpeg", ".png", ".pdf"}
IMAP_HOST = os.getenv("IMAP_HOST", "imap.gmail.com")
IMAP_PORT = int(os.getenv("IMAP_PORT", "993"))
IMAP_USER = os.getenv("IMAP_USER")
IMAP_PASSWORD = os.getenv("IMAP_PASSWORD")
IMAP_FOLDER = os.getenv("IMAP_FOLDER", "INBOX")
BACKEND_URL = (os.getenv("BACKEND_URL") or "").rstrip("/")
POLL_INTERVAL_SECONDS = int(os.getenv("POLL_INTERVAL_SECONDS", "60"))
RECONNECT_BACKOFF_SECONDS = 30
# if set, limits the SEARCH to mail received in the last N days
IMAP_SINCE_DAYS = os.getenv("IMAP_SINCE_DAYS")


def classify(filename: str, subject: str) -> str | None:
    hay = (filename + " " + subject).lower()
    if "pan" in hay:
        return "pan"
    if "aadhaar" in hay or "aadhar" in hay:
        return "aadhaar"
    return None


def extract_attachments(msg: Message, subject: str):
    for part in msg.walk():
        if part.get_content_maintype() == "multipart":
            continue
        filename = part.get_filename()
        if not filename:
            continue
        ext = Path(filename).suffix.lower()
        if ext not in ALLOWED_DOC_EXT:
            continue
        doc_type = classify(filename, subject)
        if not doc_type:
            continue
        payload = part.get_payload(decode=True)
        if not payload:
            continue
        yield doc_type, filename, payload


def upload_to_backend(candidate_id: int, attachments):
    # submit-documents accepts at most one 'pan' and one 'aadhaar'. if the email has more than one, we just take the first one
    files = {}
    for doc_type, filename, payload in attachments:
        if doc_type in files:
            continue
        files[doc_type] = (filename, io.BytesIO(payload))

    if not files:
        return False

    url = f"{BACKEND_URL}/candidates/{candidate_id}/submit-documents"
    r = requests.post(url, files=files, timeout=30)
    r.raise_for_status()
    return True


def process_message(msg: Message):
    subject = msg.get("Subject", "") or ""
    _, sender_email = parseaddr(msg.get("From", ""))
    if not sender_email:
        print("[worker] no sender on message, skipping")
        return

    candidate = Candidate.query.filter(
        db.func.lower(Candidate.email) == sender_email.lower()
    ).first()
    if not candidate:
        print(f"[worker] no candidate matched sender {sender_email}, skipping")
        return

    attachments = list(extract_attachments(msg, subject))
    if not attachments:
        print(f"[worker] no PAN/Aadhaar attachments from {sender_email}, skipping")
        return

    saved = upload_to_backend(candidate.id, attachments)
    if saved:
        print(
            f"[worker] saved {len(attachments)} attachment(s) for "
            f"candidate {candidate.id} ({sender_email})"
        )


def build_search_criteria():
    criteria = ["UNSEEN"]
    if IMAP_SINCE_DAYS:
        since_date = datetime.utcnow() - timedelta(days=int(IMAP_SINCE_DAYS))
        # IMAP wants dates like '23-May-2026'
        criteria += ["SINCE", since_date.strftime("%d-%b-%Y")]
    return criteria


def poll_once(imap: imaplib.IMAP4_SSL):
    imap.select(IMAP_FOLDER)
    typ, data = imap.search(None, *build_search_criteria())
    if typ != "OK":
        print(f"[worker] search failed: {typ}")
        return
    ids = data[0].split()
    if not ids:
        return
    ids = list(reversed(ids)) # alwsya the newest one first
    print(f"[worker] {len(ids)} new message(s) (processing newest first)")

    for msg_id in ids:
        typ, msg_data = imap.fetch(msg_id, "(RFC822)")
        if typ != "OK" or not msg_data or msg_data[0] is None:
            continue
        raw = msg_data[0][1]
        msg = email.message_from_bytes(raw)
        try:
            process_message(msg)
        except Exception as e:
            print(f"[worker] error processing msg {msg_id!r}: {e}")
            db.session.rollback()
        imap.store(msg_id, "+FLAGS", "\\Seen")


def _require_config():
    missing = [
        name
        for name, val in (
            ("IMAP_USER", IMAP_USER),
            ("IMAP_PASSWORD", IMAP_PASSWORD),
            ("BACKEND_URL", BACKEND_URL),
        )
        if not val
    ]
    if missing:
        raise RuntimeError(
            f"Missing required env vars for IMAP polling: {', '.join(missing)}"
        )


def run_one_poll():
    _require_config()
    imap = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT)
    imap.login(IMAP_USER, IMAP_PASSWORD)
    try:
        poll_once(imap)
    finally:
        try:
            imap.logout()
        except Exception:
            pass


def main():
    _require_config()
    app = create_app()
    with app.app_context():
        while True:
            try:
                print(f"[worker] connecting to {IMAP_HOST}:{IMAP_PORT}")
                imap = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT)
                imap.login(IMAP_USER, IMAP_PASSWORD)
                print("[worker] logged in, starting poll loop")
                while True:
                    poll_once(imap)
                    time.sleep(POLL_INTERVAL_SECONDS)
            except (imaplib.IMAP4.abort, OSError, imaplib.IMAP4.error) as e:
                print(
                    f"[worker] IMAP connection lost: {e}, "
                    f"reconnecting in {RECONNECT_BACKOFF_SECONDS}s"
                )
                time.sleep(RECONNECT_BACKOFF_SECONDS)


if __name__ == "__main__":
    main()
