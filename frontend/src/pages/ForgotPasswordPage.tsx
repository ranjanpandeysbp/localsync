import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";

export function ForgotPasswordPage() {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const phoneTrimmed = phone.trim();
    setPhone(phoneTrimmed);
    setBusy(true);
    setError("");
    setNote("");
    try {
      const { data } = await api.post<{ detail: string }>("/auth/forgot-password", {
        phone_number: phoneTrimmed,
      });
      setNote(data.detail);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Could not start password reset";
      setError(String(msg));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={onSubmit}>
        <h1 className="brand">
          <Link to="/">Gharq</Link>
        </h1>
        <h2 style={{ margin: "0.35rem 0 0" }}>Forgot password</h2>
        <p className="muted">
          Enter the phone number for your account. If you have an email, we&apos;ll send a reset
          link.
        </p>
        <div className="field">
          <label>Phone</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            minLength={8}
            autoComplete="username"
          />
        </div>
        {error && <p className="error">{error}</p>}
        {note && <p className="pill online">{note}</p>}
        <button className="btn" disabled={busy} type="submit">
          {busy ? "Sending…" : "Send reset link"}
        </button>
        <p className="muted" style={{ marginTop: "1rem" }}>
          <Link to="/?login=1">← Back to sign in</Link>
        </p>
      </form>
    </div>
  );
}
