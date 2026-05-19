import { useState, useRef, type DragEvent, type ChangeEvent } from "react";
import { uploadResume, type Candidate } from "../api";

const ALLOWED = [".pdf", ".docx", ".doc"];

type Props = {
  onUploaded: (c: Candidate) => void;
};

export default function UploadDropzone({ onUploaded }: Props) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);

    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED.includes(ext)) {
      setError(`Unsupported file type: ${ext}. Use PDF or DOCX.`);
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      const candidate = await uploadResume(file, setProgress);
      onUploaded(candidate);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // reset so picking the same file twice in a row still fires onChange
    e.target.value = "";
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      style={{
        border: `2px dashed ${dragging ? "var(--primary)" : "var(--border)"}`,
        background: dragging ? "rgba(37, 99, 235, 0.05)" : "var(--surface)",
        borderRadius: 8,
        padding: "32px 16px",
        textAlign: "center",
        transition: "border-color 0.15s, background 0.15s",
      }}
    >
      <p style={{ margin: 0, fontSize: 15 }}>
        Drag a resume here, or{" "}
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          style={{
            background: "none",
            border: "none",
            color: "var(--primary)",
            textDecoration: "underline",
            padding: 0,
            font: "inherit",
          }}
        >
          browse
        </button>
      </p>
      <p
        style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" }}
      >
        PDF or DOCX, up to 10 MB
      </p>

      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED.join(",")}
        onChange={onChange}
        style={{ display: "none" }}
      />

      {uploading && (
        <div style={{ marginTop: 16 }}>
          <div
            style={{
              height: 6,
              background: "var(--border)",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: "100%",
                background: "var(--primary)",
                transition: "width 0.1s",
              }}
            />
          </div>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 13,
              color: "var(--text-muted)",
            }}
          >
            {progress < 100
              ? `Uploading… ${progress}%`
              : "Extracting fields with AI…"}
          </p>
        </div>
      )}

      {error && (
        <p style={{ marginTop: 12, color: "var(--error)", fontSize: 14 }}>
          {error}
        </p>
      )}
    </div>
  );
}
