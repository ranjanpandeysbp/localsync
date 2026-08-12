import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MarketplaceScene } from "../components/MarketplaceScene";
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
      navigate(
        user.role === "PROVIDER"
          ? "/provider/overview"
          : user.role === "ADMIN" || user.role === "CUSTOMER_SERVICE"
            ? "/admin/providers"
            : "/",
      );
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
    <div className="login-page">
      <aside className="login-visual">
        <div className="login-visual-copy">
          <p className="login-visual-eyebrow">Gharq</p>
          <h1 className="login-visual-title">Find trusted help around the corner.</h1>
          <p className="login-visual-lead">
            Verified local providers, nearby requests, and quotes — all in one place.
          </p>
        </div>
        <div className="login-visual-art" aria-hidden="true">
          <MarketplaceScene className="login-scene marketplace-scene" idPrefix="login" />
        </div>
      </aside>

      <main className="login-main">
        <form className="login-form" onSubmit={onSubmit}>
          <div className="login-form-head">
            <Link to="/" className="login-form-brand">
              Gharq
            </Link>
            <h2>Welcome back</h2>
            <p className="muted">Sign in with your phone to continue.</p>
          </div>

          <div className="field">
            <label htmlFor="login-phone">Phone</label>
            <input
              id="login-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              autoComplete="tel"
            />
          </div>
          <div className="field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <div className="login-form-row">
            <Link className="login-forgot" to="/forgot-password">
              Forgot password?
            </Link>
          </div>

          {error && <p className="error">{error}</p>}

          <button className="btn login-submit" disabled={busy} type="submit">
            {busy ? "Signing in…" : "Sign in"}
          </button>

          <p className="login-footer muted">
            No account? <Link to="/register">Register</Link>
          </p>
          <p className="login-demo muted">
            Demo: consumer 9000000002 / consumer123 · provider 9000000003 / provider123
          </p>
        </form>
      </main>
    </div>
  );
}
