import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiErrorMessage } from "../services/api";
import { useAuth } from "../store/auth";
import { roleHome } from "../types";
import {
  btn,
  errorText,
  eyebrow,
  field,
  fieldInput,
  linkBlue,
  linkBtn,
  loginModal,
  loginModalBackdrop,
  loginModalClose,
  loginModalTitle,
  muted,
} from "../ui";

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
      className={loginModalBackdrop}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={loginModal} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <button type="button" className={loginModalClose} onClick={onClose} aria-label="Close">
          ×
        </button>
        <p className={eyebrow}>Welcome back</p>
        <h2 id={titleId} className={loginModalTitle}>
          Sign in to KoshalHaat
        </h2>
        <p className={`${muted} m-0 mb-[1.1rem]`}>Use your phone number and password.</p>
        <form className="flex flex-col gap-3" onSubmit={onSubmit}>
          <label className={field}>
            Phone
            <input
              className={fieldInput}
              required
              autoFocus
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit mobile"
            />
          </label>
          <label className={field}>
            Password
            <input
              className={fieldInput}
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className={errorText}>{error}</p>}
          <button className={btn} type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className={`${muted} mt-4 mb-0 text-center text-[0.92rem]`}>
          <Link to="/forgot-password" onClick={onClose}>
            Forgot password?
          </Link>
          {" · "}
          {onCreateAccount ? (
            <button type="button" className={`${linkBlue} ${linkBtn}`} onClick={onCreateAccount}>
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
