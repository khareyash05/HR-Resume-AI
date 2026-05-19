import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listCandidates, type Candidate } from "../api";
import UploadDropzone from "../components/UploadDropZone";

export default function Dashboard() {
  const navigate = useNavigate()
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    listCandidates()
      .then((rows) => {
        if (!cancelled) setCandidates(rows);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ maxWidth: 960, margin: "40px auto", padding: "0 16px" }}>
      <h1>Candidates</h1>

      <UploadDropzone onUploaded={(c) => navigate(`/candidates/${c.id}`)} />

      {loading && <p>Loading…</p>}
      {error && <p style={{ color: "var(--error)" }}>Error: {error}</p>}

      {!loading && !error && candidates.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>
          No candidates yet. Upload a resume to get started.
        </p>
      )}

      {!loading && !error && candidates.length > 0 && (
        <table
          style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}
        >
          <thead>
            <tr
              style={{
                textAlign: "left",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <th style={th}>Name</th>
              <th style={th}>Email</th>
              <th style={th}>Company</th>
              <th style={th}>Status</th>
              <th style={th}>Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => (
              <tr
                key={c.id}
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <td style={td}>
                  <Link to={`/candidates/${c.id}`}>
                    {c.name || (
                      <em style={{ color: "var(--text-muted)" }}>unknown</em>
                    )}
                  </Link>
                </td>
                <td style={td}>{c.email || "—"}</td>
                <td style={td}>{c.company || "—"}</td>
                <td style={td}>
                  <StatusPill status={c.extraction_status} />
                </td>
                <td style={td}>{new Date(c.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "8px 12px",
  fontWeight: 600,
  fontSize: 14,
};
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 14 };

function StatusPill({ status }: { status: Candidate["extraction_status"] }) {
  const colors = {
    done: { bg: "#dcfce7", fg: "#166534" },
    pending: { bg: "#fef3c7", fg: "#92400e" },
    failed: { bg: "#fee2e2", fg: "#991b1b" },
  }[status];
  return (
    <span
      style={{
        background: colors.bg,
        color: colors.fg,
        padding: "2px 8px",
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 500,
      }}
    >
      {status}
    </span>
  );
}
