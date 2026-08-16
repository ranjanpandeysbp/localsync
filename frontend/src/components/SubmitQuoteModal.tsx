import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { FilePicker } from "./Attachments";
import { api, apiErrorMessage } from "../services/api";
import { uploadFiles } from "../services/uploads";
import type { ServiceRequest } from "../types";

type Props = {
  open: boolean;
  request: ServiceRequest | null;
  onClose: () => void;
  onSuccess?: (message: string) => void;
};

export function SubmitQuoteModal({ open, request, onClose, onSuccess }: Props) {
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  const [priceQuote, setPriceQuote] = useState("");
  const [estimatedDays, setEstimatedDays] = useState("1");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !request) return;
    setPriceQuote("");
    setEstimatedDays("1");
    setMessage(`Re: ${request.title}`);
    setFiles([]);
    setError("");
    setBusy(false);
  }, [open, request]);

  if (!open || !request) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!request) return;
    setBusy(true);
    setError("");
    try {
      const uploaded = await uploadFiles(files);
      await api.post("/quotes", {
        request_id: request.id,
        price_quote: Number(priceQuote),
        estimated_days: Number(estimatedDays),
        message: message.trim() || null,
        attachment_ids: uploaded.map((a) => a.id),
      });
      const toast = `Quote submitted${uploaded.length ? ` with ${uploaded.length} file(s)` : ""}`;
      onClose();
      onSuccess?.(toast);
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to submit quote"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="login-modal-backdrop post-request-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="login-modal post-request-modal submit-quote-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <button type="button" className="login-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <p className="dash-eyebrow">Quotes</p>
        <h2 id={titleId} className="login-modal-title">
          Submit quote
        </h2>
        <p className="muted login-modal-lead">
          Quote for <strong>{request.title}</strong>
          {request.target_mode === "TARGETED" ? " · Sent to you" : " · Nearby broadcast"}
        </p>

        <form className="page-form submit-quote-form" onSubmit={(e) => void onSubmit(e)}>
          <div className="post-request-modal-scroll">
            {error && <p className="error">{error}</p>}
            <div className="field">
              <label htmlFor="submit-quote-price">Price (₹)</label>
              <input
                id="submit-quote-price"
                required
                type="number"
                min={1}
                value={priceQuote}
                onChange={(e) => setPriceQuote(e.target.value)}
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="submit-quote-eta">ETA (days)</label>
              <input
                id="submit-quote-eta"
                required
                type="number"
                min={1}
                max={365}
                value={estimatedDays}
                onChange={(e) => setEstimatedDays(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="submit-quote-message">Message</label>
              <textarea
                id="submit-quote-message"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            <FilePicker files={files} onChange={setFiles} disabled={busy} />
          </div>
          <div className="page-actions submit-quote-actions">
            <button className="btn secondary" type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? "Uploading & sending…" : "Send quote"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
