import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, apiErrorMessage } from "../services/api";
import { KoshalCityLogo } from "../components/KoshalCityLogo";
import { authWrap, btn, btnSecondary, card, errorText, field, fieldInput, fieldLabel, muted, pillOnline } from "../ui";

type SmsStatus = { enabled: boolean; resend_seconds: number };

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    void api
      .get<SmsStatus>("/auth/sms-status")
      .then((res) => setSmsEnabled(Boolean(res.data.enabled)))
      .catch(() => setSmsEnabled(false));
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((n) => Math.max(0, n - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  async function sendOtp() {
    const { data } = await api.post<{ detail: string }>(
      "/auth/forgot-password",
      { phone_number: phone.trim() },
      { timeout: 25000 },
    );
    setNote(data.detail);
    setOtpSent(true);
    setResendIn(60);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const phoneTrimmed = phone.trim();
    setPhone(phoneTrimmed);
    setBusy(true);
    setError("");
    setNote("");
    try {
      if (!smsEnabled) {
        const { data } = await api.post<{ detail: string }>("/auth/forgot-password", {
          phone_number: phoneTrimmed,
        });
        setNote(data.detail);
        return;
      }
      if (!otpSent) {
        await sendOtp();
        return;
      }
      if (password !== confirm) {
        setError("Passwords do not match");
        return;
      }
      const { data } = await api.post<{ detail: string }>("/auth/reset-password-otp", {
        phone_number: phoneTrimmed,
        otp: otp.trim(),
        password,
      });
      setNote(data.detail);
      window.setTimeout(() => navigate("/?login=1", { replace: true }), 1600);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "Could not reset password"));
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
        <h2 className="mt-[0.35rem] mb-0">Forgot password</h2>
        <p className={muted}>
          {smsEnabled
            ? otpSent
              ? "Enter the OTP sent to your phone and choose a new password."
              : "Enter the phone number for your account. We’ll send an OTP if it is registered."
            : "Enter the phone number for your account. If you have an email, we’ll send a reset link."}
        </p>
        <div className={field}>
          <label className={fieldLabel}>Phone</label>
          <input
            className={fieldInput}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            minLength={8}
            autoComplete="username"
            disabled={smsEnabled && otpSent}
          />
        </div>
        {smsEnabled && otpSent && (
          <>
            <div className={field}>
              <label className={fieldLabel}>OTP</label>
              <input
                className={fieldInput}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 10))}
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit OTP"
              />
            </div>
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
              />
            </div>
          </>
        )}
        {error && <p className={errorText}>{error}</p>}
        {note && <p className={pillOnline}>{note}</p>}
        <button className={btn} disabled={busy} type="submit">
          {busy
            ? smsEnabled && !otpSent
              ? "Sending…"
              : smsEnabled
                ? "Updating…"
                : "Sending…"
            : smsEnabled && !otpSent
              ? "Send OTP"
              : smsEnabled
                ? "Update password"
                : "Send reset link"}
        </button>
        {smsEnabled && otpSent && (
          <p className={`${muted} mt-3 mb-0 flex flex-wrap gap-3`}>
            <button
              type="button"
              className={btnSecondary}
              disabled={busy || resendIn > 0}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await sendOtp();
                } catch (err: unknown) {
                  setError(apiErrorMessage(err, "Could not resend OTP"));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend OTP"}
            </button>
            <button
              type="button"
              className="bg-transparent border-0 p-0 text-brand cursor-pointer font-semibold"
              onClick={() => {
                setOtpSent(false);
                setOtp("");
                setPassword("");
                setConfirm("");
                setNote("");
                setResendIn(0);
              }}
            >
              Change number
            </button>
          </p>
        )}
        <p className={`${muted} mt-4`}>
          <Link to="/?login=1">← Back to sign in</Link>
        </p>
      </form>
    </div>
  );
}
