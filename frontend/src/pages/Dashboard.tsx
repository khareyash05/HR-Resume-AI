import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listCandidates, type Candidate, type CandidateState } from "../api";
import UploadDropzone from "../components/UploadDropZone";

// the dashboard "Status" column is not the same as the raw extraction_status —
// HR's "done" means the whole onboarding is complete (resume parsed AND both
// docs in). awaiting = parsed but waiting on docs.
type OverallStatus = "pending" | "failed" | "awaiting" | "done";
type OverallFilter = "all" | OverallStatus;
type DocPresenceFilter = "all" | "yes" | "no";
type StateFilter = "all" | CandidateState;

function overallStatus(c: Candidate): OverallStatus {
  if (c.extraction_status === "failed") return "failed";
  if (c.extraction_status === "pending") return "pending";
  if (!c.has_pan || !c.has_aadhaar) return "awaiting";
  return "done";
}

const STATE_LABEL: Record<CandidateState, string> = {
  active: "active",
  accepted: "accepted",
  rejected: "rejected",
  on_hold: "on hold",
};

export default function Dashboard() {
  const navigate = useNavigate()
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<OverallFilter>("all");
  const [panFilter, setPanFilter] = useState<DocPresenceFilter>("all");
  const [aadhaarFilter, setAadhaarFilter] = useState<DocPresenceFilter>("all");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");

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
      if (stateFilter !== "all" && c.state !== stateFilter) return false;
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
  }, [candidates, query, statusFilter, stateFilter, panFilter, aadhaarFilter]);

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
          <FilterSelect
            label="State"
            value={stateFilter}
            onChange={(v) => setStateFilter(v as StateFilter)}
            options={["all", "active", "accepted", "rejected", "on_hold"]}
          />
          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
            {filtered.length} of {candidates.length}
          </span>
          <button
            onClick={() => downloadCsv(filtered)}
            disabled={filtered.length === 0}
            title="Download filtered candidates as CSV"
            style={{
              marginLeft: "auto",
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "6px 12px",
              fontSize: 13,
              cursor: filtered.length === 0 ? "default" : "pointer",
              color: "var(--text)",
            }}
          >
            Export CSV
          </button>
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
              <th style={th}>State</th>
              <th style={th}>PAN</th>
              <th style={th}>Aadhaar</th>
              <th style={th}>Last contacted</th>
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
                  <StatePill state={c.state} />
                </td>
                <td style={td}>
                  <PresencePill present={c.has_pan} />
                </td>
                <td style={td}>
                  <PresencePill present={c.has_aadhaar} />
                </td>
                <td style={td}>
                  {c.last_contacted_at ? (
                    new Date(c.last_contacted_at).toLocaleString()
                  ) : (
                    <span style={{ color: "var(--text-muted)" }}>—</span>
                  )}
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

function StatePill({ state }: { state: CandidateState }) {
  const meta: Record<CandidateState, { bg: string; fg: string }> = {
    active: { bg: "#e0e7ff", fg: "#3730a3" },
    accepted: { bg: "#dcfce7", fg: "#166534" },
    rejected: { bg: "#fee2e2", fg: "#991b1b" },
    on_hold: { bg: "#fef3c7", fg: "#92400e" },
  };
  const { bg, fg } = meta[state];
  return (
    <span
      style={{
        background: bg,
        color: fg,
        padding: "2px 8px",
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}
    >
      {STATE_LABEL[state]}
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

// CSV export — flatten one row per candidate. Skills joined with "; " so a
// single cell stays human-readable in Excel/Sheets.
function downloadCsv(rows: Candidate[]) {
  const headers = [
    "id",
    "name",
    "email",
    "phone",
    "company",
    "designation",
    "skills",
    "status",
    "state",
    "has_pan",
    "has_aadhaar",
    "last_contacted_at",
    "created_at",
  ];
  const body = rows.map((c) => [
    c.id,
    c.name ?? "",
    c.email ?? "",
    c.phone ?? "",
    c.company ?? "",
    c.designation ?? "",
    c.skills.join("; "),
    overallStatus(c),
    c.state,
    c.has_pan ? "yes" : "no",
    c.has_aadhaar ? "yes" : "no",
    c.last_contacted_at ?? "",
    c.created_at,
  ]);

  const csv = [headers, ...body]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `candidates-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvCell(v: string | number): string {
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
