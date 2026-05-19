# HR Resume AI

AI-assisted HR onboarding tool. Upload a candidate's resume, an LLM extracts structured fields with per-field confidence, and an LLM agent drafts a personalized PAN/Aadhaar document request. HR users review extractions, trigger the AI agent, and accept the candidate's identity documents.

Live: <https://hr-resume-ai-frontend.onrender.com>

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite, TypeScript, React Router 7 |
| Backend | Flask, SQLAlchemy, Flask-CORS, gunicorn |
| Database | Postgres (Render managed) |
| LLM | Gemini 3 Flash |
| Parsing | `pypdf` for PDFs, `python-docx` for DOCX |
| Deployment | Render |
| Load testing | k6 |

---

## Architecture

```
                  ┌──────────────────────┐
                  │  React SPA (Vite)    │
                  │  Render static site  │
                  └──────────┬───────────┘
                             │  HTTPS / JSON
                             ▼
                  ┌──────────────────────┐
                  │  Flask + gunicorn    │
                  │  Render web service  │
                  │   ┌──────────────┐   │
                  │   │  app.py      │   │  routes
                  │   │  extractor   │───┼──► Gemini (resume → fields)
                  │   │  agent       │───┼──► Gemini (fields → email/SMS draft)
                  │   │  models      │   │
                  │   └──────────────┘   │
                  └────┬──────────┬──────┘
                       │          │
              SQLAlchemy          │ local disk
                       │          │ (ephemeral)
                       ▼          ▼
              ┌──────────────┐   ┌──────────────┐
              │  Postgres    │   │ uploads/     │
              │  (Render)    │   │ documents/   │
              └──────────────┘   └──────────────┘
```

## API

Base URL: `https://hr-resume-ai-backend.onrender.com`

### `GET /`
Health check. Returns `{"status": "ok"}`.

### `POST /candidates/upload`
Upload a resume.

- **Body**: `multipart/form-data` with one field `file` (PDF, DOCX, or DOC).
- **Max size**: 10 MB.
- **Response 201**:
  ```json
  {
    "id": 17,
    "resume_filename": "Yash_Khare_Resume.pdf",
    "name": "Yash Khare",
    "email": "khareyash05@gmail.com",
    "phone": "+91-9910730681",
    "company": "Keploy",
    "designation": "Software Engineer",
    "skills": ["Golang", "TypeScript", "..."],
    "confidence": {
      "name": 1.0, "email": 1.0, "phone": 1.0,
      "company": 1.0, "designation": 1.0, "skills": 1.0
    },
    "extraction_status": "done",
    "extraction_error": null,
    "created_at": "2026-05-19T05:51:02.298726"
  }
  ```
- **Errors**: `400` (no file / empty filename / unsupported extension), `413` (over 10 MB).

### `GET /candidates`
List all candidates, newest first.

- **Response 200**: array of candidate objects (same shape as upload response, no `documents`/`request_logs`).

### `GET /candidates/<int:cid>`
Get a candidate's full profile including documents and request logs.

- **Response 200**: candidate object plus:
  ```json
  {
    "documents": [
      { "id": 4, "doc_type": "pan", "filename": "pan.jpg", "uploaded_at": "..." }
    ],
    "request_logs": [
      { "id": 2, "channel": "email", "recipient": "...", "subject": "...", "body": "...", "created_at": "..." }
    ]
  }
  ```
- **Errors**: `404` if candidate not found.

### `POST /candidates/<int:cid>/request-documents`
Ask the LLM agent to draft a PAN/Aadhaar request and log it.

- **Body**: none.
- **Behavior**: prefers email when present, falls back to SMS via phone.
- **Response 201**:
  ```json
  {
    "id": 3,
    "channel": "email",
    "recipient": "khareyash05@gmail.com",
    "subject": "Document request: PAN and Aadhaar for onboarding",
    "body": "Hi Yash, ...",
    "created_at": "2026-05-19T06:14:22.000000"
  }
  ```
- **Errors**: `400` if candidate has neither email nor phone, `500` if the agent fails.

### `POST /candidates/<int:cid>/submit-documents`
Upload PAN and/or Aadhaar for a candidate.

- **Body**: `multipart/form-data` with one or both fields `pan`, `aadhaar`.
- **Allowed types**: `.jpg`, `.jpeg`, `.png`, `.pdf`.
- **Response 201**: array of created document objects.
- **Errors**: `400` if no documents provided or extension not allowed, `404` if candidate not found.

### `GET /candidates/<int:cid>/documents/<int:doc_id>`
Download a document. The composite `(cid, doc_id)` filter prevents cross-candidate ID guessing.

- **Response**: file stream, inline (not attachment), original filename.
- **Errors**: `404` if not found.

---

## Local development

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill GOOGLE_API_KEY and DATABASE_URL
python app.py          # serves on :5050
```

Environment variables:
- `GOOGLE_API_KEY` — Gemini API key.
- `GEMINI_MODEL` — defaults to `gemini-3-pro-preview`; production uses `gemini-3-flash-preview`.
- `DATABASE_URL` — Postgres connection string.

### Frontend

```bash
cd frontend
npm install
npm run dev            # serves on :5173, proxies /api → :5050
```

Vite dev server proxies `/api/*` to the local backend. In production, `VITE_API_BASE` is baked into the bundle at build time.

---

## Load testing

k6 scripts in `backend/load/`:

| Script | Scenario |
|---|---|
| `smoke.js` | 1 VU, hits the read endpoints — basic smoke check |
| `reads.js` | Ramping VUs against `GET /candidates` and `GET /candidates/<id>` |
| `upload.js` | Uploads a sample PDF in a loop |

Run: `k6 run backend/load/smoke.js`. Each script writes a summary to `backend/load/results/<name>.txt` via `handleSummary`.

---