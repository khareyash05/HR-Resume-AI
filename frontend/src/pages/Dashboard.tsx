import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listCandidates, type Candidate } from "../api";
import UploadDropzone from "../components/UploadDropZone";

// the dashboard "Status" column is not the same as the raw extraction_status —
// HR's "done" means the whole onboarding is complete (resume parsed AND both
// docs in). awaiting = parsed but waiting on docs.
type OverallStatus = "pending" | "failed" | "awaiting" | "done";
type OverallFilter = "all" | OverallStatus;
type DocPresenceFilter = "all" | "yes" | "no";

function overallStatus(c: Candidate): OverallStatus {
  if (c.extraction_status === "failed") return "failed";
  if (c.extraction_status === "pending") return "pending";
  if (!c.has_pan || !c.has_aadhaar) return "awaiting";
  return "done";
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<OverallFilter>("all");
  const [panFilter, setPanFilter] = useState<DocPresenceFilter>("all");
  const [aadhaarFilter, setAadhaarFilter] = useState<DocPresenceFilter>("all");

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matchesPresence = (has: boolean, f: DocPresenceFilter) =>
      f === "all" || (f === "yes" ? has : !has);

    return candidates.filter((c) => {
      if (statusFilter !== "all" && overallStatus(c) !== statusFilter)
        return false;
      if (!matchesPresence(c.has_pan, panFilter)) return false;
      if (!matchesPresence(c.has_aadhaar, aadhaarFilter)) return false;
      if (!q) return true;
      // search across the fields HR would actually type
      const hay = [c.name, c.email, c.company, c.designation]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [candidates, query, statusFilter, panFilter, aadhaarFilter]);

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
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
            marginTop: 16,
          }}
        >
          <input
            type="search"
            placeholder="Search name, email, company…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: "1 1 260px",
              minWidth: 220,
              padding: "8px 12px",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 14,
            }}
          />
          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as OverallFilter)}
            options={["all", "pending", "awaiting", "done", "failed"]}
          />
          <FilterSelect
            label="PAN"
            value={panFilter}
            onChange={(v) => setPanFilter(v as DocPresenceFilter)}
            options={["all", "yes", "no"]}
          />
          <FilterSelect
            label="Aadhaar"
            value={aadhaarFilter}
            onChange={(v) => setAadhaarFilter(v as DocPresenceFilter)}
            options={["all", "yes", "no"]}
          />
          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
            {filtered.length} of {candidates.length}
          </span>
        </div>
      )}

      {!loading && !error && candidates.length > 0 && filtered.length === 0 && (
        <p style={{ color: "var(--text-muted)", marginTop: 16 }}>
          No candidates match these filters.
        </p>
      )}

      {!loading && !error && filtered.length > 0 && (
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
              <th style={th}>PAN</th>
              <th style={th}>Aadhaar</th>
              <th style={th}>Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
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
                  <StatusPill status={overallStatus(c)} />
                </td>
                <td style={td}>
                  <PresencePill present={c.has_pan} />
                </td>
                <td style={td}>
                  <PresencePill present={c.has_aadhaar} />
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

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 13,
        color: "var(--text-muted)",
      }}
    >
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "6px 8px",
          border: "1px solid var(--border)",
          borderRadius: 6,
          fontSize: 13,
          background: "var(--surface, #fff)",
        }}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

const th: React.CSSProperties = {
  padding: "8px 12px",
  fontWeight: 600,
  fontSize: 14,
};
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 14 };

function StatusPill({ status }: { status: OverallStatus }) {
  const meta = {
    done: { bg: "#dcfce7", fg: "#166534", label: "done" },
    awaiting: { bg: "#dbeafe", fg: "#1e40af", label: "awaiting docs" },
    pending: { bg: "#fef3c7", fg: "#92400e", label: "pending" },
    failed: { bg: "#fee2e2", fg: "#991b1b", label: "failed" },
  }[status];
  return (
    <span
      style={{
        background: meta.bg,
        color: meta.fg,
        padding: "2px 8px",
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}
    >
      {meta.label}
    </span>
  );
}

function PresencePill({ present }: { present: boolean }) {
  const { bg, fg, label } = present
    ? { bg: "#dcfce7", fg: "#166534", label: "yes" }
    : { bg: "#f3f4f6", fg: "#4b5563", label: "—" };
  return (
    <span
      style={{
        background: bg,
        color: fg,
        padding: "2px 8px",
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 500,
      }}
    >
      {label}
    </span>
  );
}
