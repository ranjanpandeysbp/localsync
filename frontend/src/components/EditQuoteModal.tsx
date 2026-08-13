import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { api, apiErrorMessage } from "../services/api";
import type { Quote } from "../types";

type Props = {
  open: boolean;
  quote: Quote | null;
  onClose: () => void;
  onSuccess?: (quote: Quote, message: string) => void;
};

export function EditQuoteModal({ open, quote, onClose, onSuccess }: Props) {
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  const [priceQuote, setPriceQuote] = useState("");
  const [estimatedDays, setEstimatedDays] = useState("1");
  const [message, setMessage] = useState("");
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
    if (!open || !quote) return;
    setPriceQuote(String(quote.price_quote));
    setEstimatedDays(String(quote.estimated_days));
    setMessage(quote.message || "");
    setError("");
    setBusy(false);
  }, [open, quote]);

  if (!open || !quote) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!quote) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.patch<Quote>(`/quotes/${quote.id}`, {
        price_quote: Number(priceQuote),
        estimated_days: Number(estimatedDays),
        message: message.trim(),
      });
      onClose();
      onSuccess?.(data, "Quote updated");
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to update quote"));
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
          Edit quote
        </h2>
        <p className="muted login-modal-lead">
          Update price and ETA for <strong>{quote.request_title || "this request"}</strong>
        </p>

        <form className="page-form submit-quote-form" onSubmit={(e) => void onSubmit(e)}>
          {error && <p className="error">{error}</p>}
          <div className="field">
            <label htmlFor="edit-quote-price">Price (₹)</label>
            <input
              id="edit-quote-price"
              required
              type="number"
              min={1}
              value={priceQuote}
              onChange={(e) => setPriceQuote(e.target.value)}
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="edit-quote-eta">ETA (days)</label>
            <input
              id="edit-quote-eta"
              required
              type="number"
              min={1}
              max={365}
              value={estimatedDays}
              onChange={(e) => setEstimatedDays(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="edit-quote-message">Message</label>
            <textarea
              id="edit-quote-message"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <div className="page-actions submit-quote-actions">
            <button className="btn secondary" type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
