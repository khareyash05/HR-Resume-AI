import { useEffect, useState, useCallback, useRef, type ChangeEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getCandidate,
  documentUrl,
  resumeUrl,
  reExtract,
  replaceResume,
  requestDocuments,
  submitDocuments,
  type CandidateDetail,
  type DocumentRow,
} from "../api";

export default function Profile() {
  const { id } = useParams<{ id: string }>();
  const cid = Number(id);

  const [candidate, setCandidate] = useState<CandidateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!Number.isFinite(cid)) {
      setError("Invalid candidate id");
      setLoading(false);
      return;
    }
    getCandidate(cid)
      .then((c) => {
        setCandidate(c);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [cid]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading)
    return (
      <Page>
        <p>Loading…</p>
      </Page>
    );
  if (error)
    return (
      <Page>
        <p style={{ color: "var(--error)" }}>Error: {error}</p>
      </Page>
    );
  if (!candidate) return null;

  return (
    <Page>
      <Link to="/" style={{ fontSize: 14 }}>
        ← Back to candidates
      </Link>
      <h1 style={{ marginTop: 16 }}>
        {candidate.name || (
          <em style={{ color: "var(--text-muted)" }}>unknown</em>
        )}
      </h1>
      <p style={{ color: "var(--text-muted)", marginTop: -8 }}>
        Resume: {candidate.resume_filename}
        {" · "}
        <a href={resumeUrl(candidate.id)} target="_blank" rel="noreferrer">
          view
        </a>
      </p>

      {candidate.extraction_status === "failed" && (
        <div
          style={{
            background: "#fee2e2",
            color: "#991b1b",
            padding: 12,
            borderRadius: 6,
            margin: "16px 0",
          }}
        >
          <strong>Extraction failed:</strong> {candidate.extraction_error}
        </div>
      )}

      <section style={section}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <h2 style={{ ...h2, marginBottom: 0 }}>Extracted fields</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <ReParseButton candidateId={candidate.id} onDone={load} />
            <ReplaceResumeButton candidateId={candidate.id} onDone={load} />
          </div>
        </div>
        <FieldRow
          label="Name"
          value={candidate.name}
          confidence={candidate.confidence.name}
        />
        <ContactRow
          label="Email"
          value={candidate.email}
          href={candidate.email ? `mailto:${candidate.email}` : null}
          confidence={candidate.confidence.email}
        />
        <ContactRow
          label="Phone"
          value={candidate.phone}
          href={candidate.phone ? `tel:${candidate.phone}` : null}
          confidence={candidate.confidence.phone}
        />
        <FieldRow
          label="Company"
          value={candidate.company}
          confidence={candidate.confidence.company}
        />
        <FieldRow
          label="Designation"
          value={candidate.designation}
          confidence={candidate.confidence.designation}
        />
      </section>

      <section style={section}>
        <h2 style={h2}>
          Skills{" "}
          <span
            style={{
              fontSize: 13,
              color: "var(--text-muted)",
              fontWeight: 400,
            }}
          >
            (confidence {fmtPct(candidate.confidence.skills)})
          </span>
        </h2>
        {candidate.skills.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>None extracted.</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {candidate.skills.map((s) => (
              <span key={s} style={pill}>
                {s}
              </span>
            ))}
          </div>
        )}
      </section>

      <RequestDocsPanel candidate={candidate} onDone={load} />
      <SubmitDocsPanel candidate={candidate} onDone={load} />

      <section style={section}>
        <h2 style={h2}>Documents</h2>
        {candidate.documents.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>
            No documents uploaded yet.
          </p>
        ) : (
          <DocumentList
            candidateId={candidate.id}
            documents={candidate.documents}
          />
        )}
      </section>

      <section style={section}>
        <h2 style={h2}>Request logs</h2>
        {candidate.request_logs.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No requests sent yet.</p>
        ) : (
          candidate.request_logs.map((r) => (
            <div
              key={r.id}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: 12,
                marginBottom: 8,
                background: "var(--surface)",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-muted)",
                  marginBottom: 4,
                }}
              >
                <strong style={{ textTransform: "uppercase" }}>
                  {r.channel}
                </strong>{" "}
                → {r.recipient}
                {" · "}
                {new Date(r.created_at).toLocaleString()}
              </div>
              {r.subject && (
                <div style={{ fontWeight: 500, marginBottom: 4 }}>
                  {r.subject}
                </div>
              )}
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  margin: 0,
                  fontFamily: "inherit",
                  fontSize: 14,
                }}
              >
                {r.body}
              </pre>
            </div>
          ))
        )}
      </section>
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 800, margin: "40px auto", padding: "0 16px" }}>
      {children}
    </div>
  );
}

function FieldRow({
  label,
  value,
  confidence,
}: {
  label: string;
  value: string | null;
  confidence: number | undefined;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "120px 1fr auto",
        gap: 12,
        padding: "8px 0",
        borderBottom: "1px solid var(--border)",
        alignItems: "center",
      }}
    >
      <div style={{ color: "var(--text-muted)", fontSize: 14 }}>{label}</div>
      <div>
        {value || <em style={{ color: "var(--text-muted)" }}>not extracted</em>}
      </div>
      <ConfidenceChip score={confidence} />
    </div>
  );
}

function ContactRow({
  label,
  value,
  href,
  confidence,
}: {
  label: string;
  value: string | null;
  href: string | null;
  confidence: number | undefined;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard API can be blocked (e.g. http context) — ignore silently
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "120px 1fr auto",
        gap: 12,
        padding: "8px 0",
        borderBottom: "1px solid var(--border)",
        alignItems: "center",
      }}
    >
      <div style={{ color: "var(--text-muted)", fontSize: 14 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {value ? (
          href ? (
            <a href={href}>{value}</a>
          ) : (
            <span>{value}</span>
          )
        ) : (
          <em style={{ color: "var(--text-muted)" }}>not extracted</em>
        )}
        {value && (
          <button
            onClick={copy}
            title="Copy"
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "1px 6px",
              fontSize: 11,
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            {copied ? "copied" : "copy"}
          </button>
        )}
      </div>
      <ConfidenceChip score={confidence} />
    </div>
  );
}

function ConfidenceChip({ score }: { score: number | undefined }) {
  if (score == null) return null;
  let bg = "#fee2e2",
    fg = "#991b1b"; // red
  if (score >= 0.8) {
    bg = "#dcfce7";
    fg = "#166534";
  } // green
  else if (score >= 0.5) {
    bg = "#fef3c7";
    fg = "#92400e";
  } // amber
  return (
    <span
      style={{
        background: bg,
        color: fg,
        fontSize: 12,
        fontWeight: 500,
        padding: "2px 8px",
        borderRadius: 12,
      }}
    >
      {fmtPct(score)}
    </span>
  );
}

function fmtPct(n: number | undefined) {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

const section: React.CSSProperties = { marginTop: 32 };
const h2: React.CSSProperties = { fontSize: 18, marginBottom: 12 };
const pill: React.CSSProperties = {
  background: "var(--accent-bg, #eef2ff)",
  color: "var(--primary)",
  padding: "4px 10px",
  borderRadius: 12,
  fontSize: 13,
};
const primaryBtn: React.CSSProperties = {
  background: "var(--primary)",
  color: "#fff",
  border: "none",
  padding: "8px 16px",
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 500,
};

function RequestDocsPanel({
  candidate,
  onDone,
}: {
  candidate: CandidateDetail;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canRequest = !!candidate.email || !!candidate.phone;

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      await requestDocuments(candidate.id);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={section}>
      <h2 style={h2}>Request PAN & Aadhaar (AI)</h2>
      <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 12 }}>
        Asks Gemini to draft a personalized message and log it as{" "}
        <code>{candidate.email ? "email" : "sms"}</code>.
      </p>
      <button
        onClick={handleClick}
        disabled={!canRequest || busy}
        style={primaryBtn}
      >
        {busy ? "Calling AI…" : "Generate request"}
      </button>
      {!canRequest && (
        <p style={{ color: "var(--warning)", fontSize: 13, marginTop: 8 }}>
          Candidate has neither email nor phone — extract one first.
        </p>
      )}
      {error && (
        <p style={{ color: "var(--error)", fontSize: 13, marginTop: 8 }}>
          {error}
        </p>
      )}
    </section>
  );
}

function SubmitDocsPanel({
  candidate,
  onDone,
}: {
  candidate: CandidateDetail;
  onDone: () => void;
}) {
  const [pan, setPan] = useState<File | null>(null);
  const [aadhaar, setAadhaar] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panRef = useRef<HTMLInputElement>(null);
  const aadhaarRef = useRef<HTMLInputElement>(null);

  async function handleSubmit() {
    if (!pan && !aadhaar) {
      setError("Pick at least one file.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await submitDocuments(candidate.id, {
        pan: pan ?? undefined,
        aadhaar: aadhaar ?? undefined,
      });
      setPan(null);
      setAadhaar(null);
      if (panRef.current) panRef.current.value = "";
      if (aadhaarRef.current) aadhaarRef.current.value = "";
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={section}>
      <h2 style={h2}>Upload PAN / Aadhaar</h2>
      <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 12 }}>
        JPG, PNG, or PDF. Either or both.
      </p>

      <FilePicker label="PAN" file={pan} onChange={setPan} inputRef={panRef} />
      <FilePicker
        label="Aadhaar"
        file={aadhaar}
        onChange={setAadhaar}
        inputRef={aadhaarRef}
      />

      <button
        onClick={handleSubmit}
        disabled={busy || (!pan && !aadhaar)}
        style={{ ...primaryBtn, marginTop: 12 }}
      >
        {busy ? "Uploading…" : "Submit documents"}
      </button>
      {error && (
        <p style={{ color: "var(--error)", fontSize: 13, marginTop: 8 }}>
          {error}
        </p>
      )}
    </section>
  );
}

function ReParseButton({
  candidateId,
  onDone,
}: {
  candidateId: number;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      await reExtract(candidateId);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {error && (
        <span style={{ color: "var(--error)", fontSize: 12 }}>{error}</span>
      )}
      <button
        onClick={handleClick}
        disabled={busy}
        style={{
          background: "none",
          border: "1px solid var(--border)",
          color: "var(--text)",
          padding: "4px 10px",
          borderRadius: 6,
          fontSize: 13,
          cursor: busy ? "default" : "pointer",
        }}
      >
        {busy ? "Re-parsing…" : "Re-parse resume"}
      </button>
    </div>
  );
}

function ReplaceResumeButton({
  candidateId,
  onDone,
}: {
  candidateId: number;
  onDone: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // clear so picking the same filename again still fires onChange
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await replaceResume(candidateId, file);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {error && (
        <span style={{ color: "var(--error)", fontSize: 12 }}>{error}</span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.doc"
        onChange={handleFile}
        style={{ display: "none" }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        style={{
          background: "none",
          border: "1px solid var(--border)",
          color: "var(--text)",
          padding: "4px 10px",
          borderRadius: 6,
          fontSize: 13,
          cursor: busy ? "default" : "pointer",
        }}
      >
        {busy ? "Replacing…" : "Replace resume"}
      </button>
    </div>
  );
}

function DocumentList({
  candidateId,
  documents,
}: {
  candidateId: number;
  documents: DocumentRow[];
}) {
  // mark the most recent doc per type as "latest" — HR scans for the freshest
  // upload, older ones are kept for audit
  const sorted = [...documents].sort(
    (a, b) =>
      new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime(),
  );
  const latestIdByType = new Map<string, number>();
  for (const d of sorted) {
    if (!latestIdByType.has(d.doc_type)) latestIdByType.set(d.doc_type, d.id);
  }

  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {sorted.map((d) => {
        const isLatest = latestIdByType.get(d.doc_type) === d.id;
        return (
          <li
            key={d.id}
            style={{
              marginBottom: 6,
              padding: "6px 8px",
              borderRadius: 6,
              background: isLatest ? "#ecfdf5" : "transparent",
              border: isLatest ? "1px solid #a7f3d0" : "1px solid transparent",
            }}
          >
            <strong
              style={{
                textTransform: "uppercase",
                fontSize: 12,
                marginRight: 8,
              }}
            >
              {d.doc_type}
            </strong>
            <a
              href={documentUrl(candidateId, d.id)}
              target="_blank"
              rel="noreferrer"
            >
              {d.filename}
            </a>
            {isLatest && (
              <span
                style={{
                  background: "#10b981",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "1px 6px",
                  borderRadius: 10,
                  marginLeft: 8,
                  textTransform: "uppercase",
                }}
              >
                latest
              </span>
            )}
            <span
              style={{
                color: "var(--text-muted)",
                fontSize: 13,
                marginLeft: 8,
              }}
            >
              ({new Date(d.uploaded_at).toLocaleString()})
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function FilePicker({
  label,
  file,
  onChange,
  inputRef,
}: {
  label: string;
  file: File | null;
  onChange: (f: File | null) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  function onPick(e: ChangeEvent<HTMLInputElement>) {
    onChange(e.target.files?.[0] ?? null);
  }
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 0",
      }}
    >
      <div style={{ width: 80, color: "var(--text-muted)", fontSize: 14 }}>
        {label}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.pdf"
        onChange={onPick}
        style={{ flex: 1, fontSize: 14 }}
      />
      {file && (
        <button
          onClick={() => {
            onChange(null);
            if (inputRef.current) inputRef.current.value = "";
          }}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          clear
        </button>
      )}
    </div>
  );
}
