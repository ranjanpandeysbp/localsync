import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { api, apiErrorMessage } from "../services/api";
import type { Order, Quote } from "../types";

type Props = {
  open: boolean;
  quote: Quote | null;
  order: Order | null;
  onClose: () => void;
  onSuccess?: (order: Order, message: string) => void;
};

export function CompleteOrderModal({ open, quote, order, onClose, onSuccess }: Props) {
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  const [otp, setOtp] = useState("");
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
    if (!open) return;
    setOtp("");
    setError("");
    setBusy(false);
  }, [open, order?.id]);

  if (!open || !order || !quote) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!order) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post<Order>(`/orders/${order.id}/complete`, {
        otp: otp.trim(),
      });
      onClose();
      onSuccess?.(data, "Order completed");
    } catch (err) {
      setError(apiErrorMessage(err, "Could not complete order"));
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
        <p className="dash-eyebrow">Orders</p>
        <h2 id={titleId} className="login-modal-title">
          Complete order
        </h2>
        <p className="muted login-modal-lead">
          Ask the consumer for their deal-locked OTP for{" "}
          <strong>{quote.request_title || "this request"}</strong>, then enter it below.
        </p>

        <form className="page-form submit-quote-form" onSubmit={(e) => void onSubmit(e)}>
          <div className="post-request-modal-scroll">
            {error && <p className="error">{error}</p>}
            <div className="field">
              <label htmlFor="complete-order-otp">Consumer OTP</label>
              <input
                id="complete-order-otp"
                required
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                minLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="6-digit code"
                autoFocus
                autoComplete="one-time-code"
              />
            </div>
          </div>
          <div className="page-actions submit-quote-actions">
            <button className="btn secondary" type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="btn" type="submit" disabled={busy || otp.length !== 6}>
              {busy ? "Completing…" : "Mark completed"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
