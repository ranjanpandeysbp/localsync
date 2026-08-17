import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MarketplaceScene } from "../components/MarketplaceScene";
import { useAuth } from "../store/auth";
import { roleHome } from "../types";
import { btn, errorText, field, fieldInput, fieldLabel, muted } from "../ui";

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
      navigate(roleHome(user.role));
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
    <div className="min-h-screen grid grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] bg-canvas max-[960px]:fixed max-[960px]:inset-0 max-[960px]:block max-[960px]:w-full max-[960px]:h-dvh max-[960px]:min-h-dvh max-[960px]:max-h-dvh max-[960px]:overflow-hidden">
      <aside className="relative grid grid-rows-[auto_1fr] gap-5 p-[clamp(1.5rem,4vw,3rem)] overflow-hidden bg-[radial-gradient(circle_at_18%_20%,rgba(234,161,29,0.22),transparent_42%),linear-gradient(160deg,#14665a_0%,#0f4c43_48%,#0a3a34_100%)] text-bg animate-login-visual-in max-[960px]:absolute max-[960px]:inset-0 max-[960px]:z-0 max-[960px]:grid-rows-1 max-[960px]:p-0 max-[960px]:gap-0">
        <div className="relative z-[1] max-w-md animate-login-rise max-[960px]:hidden">
          <p className="m-0 mb-3 font-display text-[clamp(1.8rem,3.5vw,2.45rem)] font-extrabold tracking-[-0.04em] leading-none text-bg">
            KoshalHaat
          </p>
          <h1 className="m-0 text-[clamp(1.45rem,2.6vw,2rem)] font-semibold tracking-[-0.03em] leading-tight text-bg">
            Find trusted help around the corner.
          </h1>
          <p className="mt-[0.85rem] mb-0 max-w-sm text-[1.02rem] leading-[1.55] text-[rgba(250,249,245,0.82)]">
            Verified local providers, nearby requests, and quotes — all in one place.
          </p>
        </div>
        <div className="relative z-[1] grid place-items-end justify-center min-h-0 animate-login-rise-art max-[960px]:place-items-stretch max-[960px]:min-h-0 max-[960px]:h-full">
          <MarketplaceScene
            className="login-scene marketplace-scene w-[min(100%,520px)] h-auto max-h-[min(58vh,560px)] drop-shadow-[0_24px_40px_rgba(0,0,0,0.18)] max-[960px]:w-full max-[960px]:h-full max-[960px]:max-h-none max-[960px]:drop-shadow-none"
            idPrefix="login"
          />
        </div>
      </aside>

      <main className="grid place-items-center p-[clamp(1.25rem,4vw,3rem)] bg-[radial-gradient(circle_at_90%_10%,rgba(15,76,67,0.06),transparent_28%),linear-gradient(180deg,#faf9f5_0%,#f3f1ea_100%)] animate-login-form-in max-[960px]:absolute max-[960px]:inset-0 max-[960px]:z-[1] max-[960px]:grid max-[960px]:place-items-center max-[960px]:content-center max-[960px]:pt-[max(1rem,env(safe-area-inset-top))] max-[960px]:px-5 max-[960px]:pb-[max(1rem,env(safe-area-inset-bottom))] max-[960px]:bg-[linear-gradient(180deg,rgba(10,58,52,0.28)_0%,rgba(10,58,52,0.12)_35%,rgba(10,58,52,0.35)_100%)] max-[960px]:animate-login-rise max-[560px]:pt-[max(0.85rem,env(safe-area-inset-top))] max-[560px]:px-4 max-[560px]:pb-[max(0.85rem,env(safe-area-inset-bottom))]">
        <form
          className="w-[min(400px,100%)] grid gap-[0.85rem] max-[960px]:gap-[0.7rem] max-[960px]:pt-5 max-[960px]:px-[1.2rem] max-[960px]:pb-[1.15rem] max-[960px]:rounded-[22px] max-[960px]:border max-[960px]:border-solid max-[960px]:border-[rgba(250,249,245,0.28)] max-[960px]:bg-[rgba(250,249,245,0.2)] max-[960px]:shadow-[0_18px_48px_rgba(0,0,0,0.22)] max-[960px]:backdrop-blur-[14px] max-[560px]:gap-[0.55rem] max-[560px]:p-4 max-[560px]:rounded-[18px] [@media(max-width:960px)_and_(max-height:700px)]:gap-[0.45rem] [@media(max-width:960px)_and_(max-height:700px)]:py-[0.9rem] [@media(max-width:960px)_and_(max-height:700px)]:px-[0.95rem]"
          onSubmit={onSubmit}
        >
          <div className="mb-[0.55rem] max-[960px]:mb-[0.2rem]">
            <Link
              to="/"
              className="hidden max-[960px]:inline-block mb-[0.85rem] font-display text-[1.35rem] font-extrabold tracking-[-0.03em] text-brand max-[960px]:mb-2 [@media(max-width:960px)_and_(max-height:700px)]:mb-1 [@media(max-width:960px)_and_(max-height:700px)]:text-[1.15rem]"
            >
              KoshalHaat
            </Link>
            <h2 className="m-0 text-brand tracking-[-0.03em] text-[clamp(1.55rem,2.5vw,1.9rem)] max-[960px]:text-[1.4rem] max-[560px]:text-[1.28rem] [@media(max-width:960px)_and_(max-height:700px)]:text-[1.2rem]">
              Welcome back
            </h2>
            <p className={`${muted} mt-[0.4rem] mb-0 max-[960px]:text-[rgba(29,36,43,0.72)] max-[560px]:text-[0.9rem] [@media(max-width:960px)_and_(max-height:700px)]:hidden`}>
              Sign in with your phone to continue.
            </p>
          </div>

          <div className={`${field} mb-0`}>
            <label className={`${fieldLabel} text-[0.84rem]`} htmlFor="login-phone">
              Phone
            </label>
            <input
              className={`${fieldInput} rounded-[14px] border-[rgba(29,36,43,0.12)] bg-white/88 py-[0.85rem] px-[0.95rem] focus:outline-none focus:border-primary/45 focus:shadow-[0_0_0_4px_rgba(15,76,67,0.1)] max-[960px]:py-3 max-[960px]:px-[0.9rem] max-[960px]:bg-white/78`}
              id="login-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              autoComplete="tel"
            />
          </div>
          <div className={`${field} mb-0`}>
            <label className={`${fieldLabel} text-[0.84rem]`} htmlFor="login-password">
              Password
            </label>
            <input
              className={`${fieldInput} rounded-[14px] border-[rgba(29,36,43,0.12)] bg-white/88 py-[0.85rem] px-[0.95rem] focus:outline-none focus:border-primary/45 focus:shadow-[0_0_0_4px_rgba(15,76,67,0.1)] max-[960px]:py-3 max-[960px]:px-[0.9rem] max-[960px]:bg-white/78`}
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <div className="flex justify-end -mt-1">
            <Link className="text-brand text-[0.9rem] font-semibold hover:underline hover:underline-offset-[3px]" to="/forgot-password">
              Forgot password?
            </Link>
          </div>

          {error && <p className={errorText}>{error}</p>}

          <button className={`${btn} w-full mt-[0.35rem] py-[0.85rem] px-5 rounded-full text-base max-[960px]:mt-[0.2rem] max-[960px]:py-3 max-[960px]:px-[1.1rem]`} disabled={busy} type="submit">
            {busy ? "Signing in…" : "Sign in"}
          </button>

          <p className={`${muted} mt-[0.35rem] mb-0 text-center max-[960px]:text-[rgba(29,36,43,0.72)]`}>
            No account?{" "}
            <Link className="text-brand font-bold" to="/register">
              Register
            </Link>
          </p>
          <p className={`${muted} m-0 text-center text-[0.78rem] leading-[1.45] max-[960px]:hidden`}>
            Demo: consumer 9000000002 / consumer123 · provider 9000000003 / provider123
          </p>
        </form>
      </main>
    </div>
  );
}
