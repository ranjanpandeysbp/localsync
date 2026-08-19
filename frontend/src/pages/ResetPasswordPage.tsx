import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../services/api";
import { KoshalCityLogo } from "../components/KoshalCityLogo";
import { authWrap, btn, card, errorText, field, fieldInput, fieldLabel, muted, pillOnline } from "../ui";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => params.get("token")?.trim() || "", [params]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) {
      setError("This reset link is missing or incomplete.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    setError("");
    setNote("");
    try {
      const { data } = await api.post<{ detail: string }>("/auth/reset-password", {
        token,
        password,
      });
      setNote(data.detail);
      window.setTimeout(() => navigate("/?login=1", { replace: true }), 1600);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Could not reset password";
      setError(String(msg));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={authWrap}>
      <form className={`${card} w-[min(420px,100%)]`} onSubmit={onSubmit}>
        <h1 className="m-0">
          <Link to="/" className="inline-flex no-underline">
            <KoshalCityLogo markSize={36} showTagline />
          </Link>
        </h1>
        <h2 className="mt-[0.35rem] mb-0">Choose a new password</h2>
        <p className={muted}>Use at least 6 characters. You&apos;ll sign in with your phone after.</p>
        {!token && (
          <p className={errorText}>
            This reset link is invalid. Request a new one from{" "}
            <Link to="/forgot-password">Forgot password</Link>.
          </p>
        )}
        <div className={field}>
          <label className={fieldLabel}>New password</label>
          <input
            className={fieldInput}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            disabled={!token}
          />
        </div>
        <div className={field}>
          <label className={fieldLabel}>Confirm password</label>
          <input
            className={fieldInput}
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            disabled={!token}
          />
        </div>
        {error && <p className={errorText}>{error}</p>}
        {note && <p className={pillOnline}>{note}</p>}
        <button className={btn} disabled={busy || !token} type="submit">
          {busy ? "Updating…" : "Update password"}
        </button>
        <p className={`${muted} mt-4`}>
          <Link to="/?login=1">← Back to sign in</Link>
        </p>
      </form>
    </div>
  );
}
