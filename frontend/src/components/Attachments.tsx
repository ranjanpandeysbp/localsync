import type { Attachment } from "../types";

const MEDIA_BASE = import.meta.env.VITE_MEDIA_URL || "http://127.0.0.1:2025";

export function mediaSrc(url: string): string {
  if (url.startsWith("http")) return url;
  return `${MEDIA_BASE}${url}`;
}

export function AttachmentGallery({
  attachments,
  emptyText,
}: {
  attachments?: Attachment[] | null;
  emptyText?: string;
}) {
  if (!attachments?.length) {
    return emptyText ? <p className="muted">{emptyText}</p> : null;
  }

  return (
    <div className="attach-gallery">
      {attachments.map((a) => (
        <a
          key={a.id}
          className="attach-item"
          href={mediaSrc(a.url)}
          target="_blank"
          rel="noreferrer"
          title={a.original_filename}
        >
          {a.is_image || a.content_type.startsWith("image/") ? (
            <img src={mediaSrc(a.url)} alt={a.original_filename} />
          ) : (
            <div className="attach-pdf">
              <span>PDF</span>
              <small>{a.original_filename}</small>
            </div>
          )}
        </a>
      ))}
    </div>
  );
}

export function FilePicker({
  files,
  onChange,
  max = 5,
  disabled,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  max?: number;
  disabled?: boolean;
}) {
  return (
    <div className="field">
      <label>Attachments (images or PDF, max {max})</label>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
        multiple
        disabled={disabled}
        onChange={(e) => {
          const selected = Array.from(e.target.files || []);
          const next = [...files, ...selected].slice(0, max);
          onChange(next);
          e.target.value = "";
        }}
      />
      {files.length > 0 && (
        <ul className="attach-pending">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              <span>
                {f.name} ({Math.round(f.size / 1024)} KB)
              </span>
              <button
                type="button"
                className="btn secondary"
                style={{ padding: "0.2rem 0.6rem", fontSize: "0.8rem" }}
                onClick={() => onChange(files.filter((_, idx) => idx !== i))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="muted" style={{ fontSize: "0.8rem", margin: 0 }}>
        Allowed: JPEG, PNG, WebP, GIF, PDF · up to 8 MB each
      </p>
    </div>
  );
}
