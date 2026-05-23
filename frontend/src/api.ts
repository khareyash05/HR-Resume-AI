const BASE = import.meta.env.VITE_API_BASE || "/api";
export type CandidateState = "active" | "accepted" | "rejected" | "on_hold";

export type Candidate = {
  id: number;
  resume_filename: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  designation: string | null;
  skills: string[];
  confidence: Record<string, number>;
  extraction_status: "pending" | "done" | "failed";
  extraction_error?: string | null;
  documents_status: "missing" | "partial" | "complete";
  has_pan: boolean;
  has_aadhaar: boolean;
  notes: string | null;
  state: CandidateState;
  last_contacted_at: string | null;
  created_at: string;
};

export type DocumentRow = {
  id: number;
  doc_type: "pan" | "aadhaar";
  filename: string;
  uploaded_at: string;
};

export type RequestLog = {
  id: number;
  channel: "email" | "sms";
  recipient: string;
  subject: string;
  body: string;
  created_at: string;
};

export type CandidateDetail = Candidate & {
  documents: DocumentRow[];
  request_logs: RequestLog[];
};

export async function listCandidates(): Promise<Candidate[]> {
  const r = await fetch(`${BASE}/candidates`);
  if (!r.ok) throw new Error("Failed to list candidates");
  return r.json();
}

export async function getCandidate(id: number): Promise<CandidateDetail> {
  const r = await fetch(`${BASE}/candidates/${id}`);
  if (!r.ok) throw new Error("Failed to load candidate");
  return r.json();
}


// Upload uses XHR (not fetch) because we want progress events,
// which fetch still doesn't expose for request bodies.
export function uploadResume(
  file: File,
  onProgress: (pct: number) => void,
): Promise<Candidate> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}/candidates/upload`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        let msg = "Upload failed";
        try {
          msg = JSON.parse(xhr.responseText).error || msg;
        } catch {}
        reject(new Error(msg));
      }
    };

    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(fd);
  });
}

export async function requestDocuments(id: number): Promise<RequestLog> {
  const r = await fetch(`${BASE}/candidates/${id}/request-documents`, {
    method: "POST",
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || "Failed to request documents");
  }
  return r.json();
}

export async function submitDocuments(
  id: number,
  files: { pan?: File; aadhaar?: File },
): Promise<DocumentRow[]> {
  const fd = new FormData();
  if (files.pan) fd.append("pan", files.pan);
  if (files.aadhaar) fd.append("aadhaar", files.aadhaar);

  const r = await fetch(`${BASE}/candidates/${id}/submit-documents`, {
    method: "POST",
    body: fd,
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || "Upload failed");
  }
  return r.json();
}

export function documentUrl(candidateId: number, docId: number): string {
  return `${BASE}/candidates/${candidateId}/documents/${docId}`;
}

export function resumeUrl(candidateId: number): string {
  return `${BASE}/candidates/${candidateId}/resume`;
}

export async function reExtract(id: number): Promise<CandidateDetail> {
  const r = await fetch(`${BASE}/candidates/${id}/re-extract`, {
    method: "POST",
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || "Re-parse failed");
  }
  return r.json();
}

export async function updateCandidate(
  id: number,
  patch: { notes?: string | null; state?: CandidateState },
): Promise<CandidateDetail> {
  const r = await fetch(`${BASE}/candidates/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || "Update failed");
  }
  return r.json();
}

export async function replaceResume(
  id: number,
  file: File,
): Promise<CandidateDetail> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch(`${BASE}/candidates/${id}/replace-resume`, {
    method: "POST",
    body: fd,
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || "Replace resume failed");
  }
  return r.json();
}
