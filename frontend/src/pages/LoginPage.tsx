import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../store/auth";

export function LoginPage() {
  const login = useAuth((s) => s.login);
  const navigate = useNavigate();
  const [phone, setPhone] = useState("9000000002");
  const [password, setPassword] = useState("consumer123");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const phoneTrimmed = phone.trim();
    setPhone(phoneTrimmed);
    setBusy(true);
    setError("");
    try {
      const user = await login(phoneTrimmed, password);
      navigate(user.role === "PROVIDER" ? "/provider/overview" : user.role === "ADMIN" ? "/admin/providers" : "/consumer/details");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Login failed";
      setError(String(msg));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={onSubmit}>
        <h1 className="brand">
          <Link to="/">LocalSync</Link>
        </h1>
        <p className="muted">Hyper-local supply & demand, with verified providers.</p>
        <div className="field">
          <label>Phone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn" disabled={busy} type="submit">
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="muted" style={{ marginTop: "1rem" }}>
          No account? <Link to="/register">Register</Link>
        </p>
        <p className="muted" style={{ marginTop: "0.65rem" }}>
          <Link to="/">← Back to landing page</Link>
        </p>
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          Demo: consumer 9000000002 / consumer123 · provider 9000000003 / provider123
        </p>
      </form>
    </div>
  );
}
