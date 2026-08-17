import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiErrorMessage } from "../services/api";
import { useAuth } from "../store/auth";
import { roleHome } from "../types";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreateAccount?: () => void;
};

export function LoginModal({ open, onClose, onCreateAccount }: Props) {
  const navigate = useNavigate();
  const login = useAuth((s) => s.login);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
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
    if (!open) {
      setPhone("");
      setPassword("");
      setError("");
      setBusy(false);
    }
  }, [open]);

  if (!open) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const user = await login(phone, password);
      onClose();
      navigate(roleHome(user.role));
    } catch (err) {
      setError(apiErrorMessage(err, "Login failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="login-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="login-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <button type="button" className="login-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <p className="eyebrow">Welcome back</p>
        <h2 id={titleId} className="login-modal-title">
          Sign in to SahiLocal
        </h2>
        <p className="muted login-modal-lead">Use your phone number and password.</p>
        <form className="stack" onSubmit={onSubmit}>
          <label className="field">
            Phone
            <input
              required
              autoFocus
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit mobile"
            />
          </label>
          <label className="field">
            Password
            <input
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="muted login-modal-links">
          <Link to="/forgot-password" onClick={onClose}>
            Forgot password?
          </Link>
          {" · "}
          {onCreateAccount ? (
            <button type="button" className="link-blue link-btn" onClick={onCreateAccount}>
              Create account
            </button>
          ) : (
            <Link to="/?register=1" onClick={onClose}>
              Create account
            </Link>
          )}
        </p>
      </div>
    </div>
  );
}
