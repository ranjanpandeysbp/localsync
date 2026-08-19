import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, apiErrorMessage } from "../services/api";
import { reverseGeocodeDetails } from "../services/geo";
import { useAuth } from "../store/auth";
import type { UserRole } from "../types";
import { roleHome } from "../types";
import {
  btn,
  btnSecondary,
  cn,
  errorText,
  eyebrow,
  field,
  fieldInput,
  fieldLabel,
  fieldSelect,
  linkBlue,
  linkBtn,
  loginModal,
  loginModalBackdrop,
  loginModalClose,
  loginModalTitle,
  muted,
} from "../ui";

const PROVIDER_PENDING_MSG =
  "Thank you for registration, your account is being currently reviewed. Please keep checking email from us in next 24hrs.";

/** Indian GSTIN: 15 chars — e.g. 29AAAAA0000A1Z5 */
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const EMPTY_FORM = {
  phone_number: "",
  full_name: "",
  business_name: "",
  email: "",
  password: "",
  confirm_password: "",
  city: "",
  pincode: "",
  gst_number: "",
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSignIn: () => void;
};

function indianMobile(raw: string): string {
  let digits = (raw || "").replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  return digits.slice(0, 10);
}

function GreenTick() {
  return (
    <span
      className="absolute right-2.5 top-1/2 -translate-y-1/2 grid place-items-center w-5 h-5 rounded-full bg-[#16a34a] text-white pointer-events-none"
      aria-label="Mobile number verified"
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M5 12.5 9.5 17 19 7.5"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function RegisterModal({ open, onClose, onSignIn }: Props) {
  const login = useAuth((s) => s.login);
  const navigate = useNavigate();
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  const otpInputRef = useRef<HTMLInputElement>(null);
  const sendingRef = useRef(false);
  const verifyingRef = useRef(false);
  const [role, setRole] = useState<UserRole>("CONSUMER");
  const [form, setForm] = useState(EMPTY_FORM);
  const [coords, setCoords] = useState<{
    latitude: number | null;
    longitude: number | null;
    label: string;
  }>({ latitude: null, longitude: null, label: "" });
  const [locStatus, setLocStatus] = useState("Detecting location…");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [providerPending, setProviderPending] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(60);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpNote, setOtpNote] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [lastSentMobile, setLastSentMobile] = useState("");

  onCloseRef.current = onClose;

  const hasCoords = coords.latitude != null && coords.longitude != null;
  const needsPincode = !hasCoords;
  const isProvider = role === "PROVIDER";
  const mobile = indianMobile(form.phone_number);
  const mobileReady = mobile.length === 10;
  const showOtpBox = otpSent && !phoneVerified;

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
      setRole("CONSUMER");
      setForm(EMPTY_FORM);
      setCoords({ latitude: null, longitude: null, label: "" });
      setLocStatus("Detecting location…");
      setError("");
      setBusy(false);
      setSaving(false);
      setProviderPending(false);
      setPhoneVerified(false);
      setOtpSent(false);
      setOtp("");
      setOtpNote("");
      setResendIn(0);
      setLastSentMobile("");
      sendingRef.current = false;
      verifyingRef.current = false;
      return;
    }
    void api
      .get<{ enabled: boolean; resend_seconds: number }>("/auth/sms-status")
      .then((res) => {
        setResendSeconds(Math.max(15, Number(res.data.resend_seconds) || 60));
      })
      .catch(() => undefined);
    requestLocation();
  }, [open]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((n) => Math.max(0, n - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  function onLocationFail(message: string) {
    setCoords({ latitude: null, longitude: null, label: "" });
    setLocStatus(message);
  }

  async function onLocationOk(lat: number, lng: number) {
    const coordsText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    setCoords({ latitude: lat, longitude: lng, label: "" });
    setLocStatus(`Resolving place name · ${coordsText}`);
    const details = await reverseGeocodeDetails(lat, lng);
    const cityName = details?.city?.trim() || "";
    const label =
      details?.location_label?.trim() ||
      (cityName ? `${cityName} · ${coordsText}` : coordsText);
    setCoords({ latitude: lat, longitude: lng, label });
    setForm((f) => ({
      ...f,
      city: cityName || f.city,
      pincode: details?.pincode?.trim() || f.pincode,
    }));
    setLocStatus(label);
  }

  function requestLocation() {
    setLocStatus("Detecting location…");
    if (!navigator.geolocation) {
      onLocationFail("Location unavailable — enter your pincode below.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void onLocationOk(pos.coords.latitude, pos.coords.longitude);
      },
      () => onLocationFail("Could not detect location — enter your pincode below."),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  async function sendRegisterOtp(force = false) {
    if (!mobileReady || sendingRef.current || phoneVerified) return;
    if (!force && lastSentMobile === mobile && otpSent) return;
    sendingRef.current = true;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post<{ detail: string; demo_otp?: string | null }>(
        "/auth/otp/send",
        { phone_number: mobile, purpose: "register" },
        { timeout: 25000 },
      );
      setForm((f) => ({ ...f, phone_number: mobile }));
      setLastSentMobile(mobile);
      setOtpSent(true);
      setOtp("");
      setOtpNote(
        data.demo_otp
          ? `Enter OTP. Local demo code: ${data.demo_otp}`
          : data.detail || "OTP sent to your mobile number",
      );
      setResendIn(resendSeconds);
      window.setTimeout(() => otpInputRef.current?.focus(), 50);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "Could not send OTP"));
    } finally {
      sendingRef.current = false;
      setBusy(false);
    }
  }

  async function verifyRegisterOtp() {
    const code = otp.replace(/\D/g, "");
    if (code.length < 4 || verifyingRef.current || phoneVerified) return;
    verifyingRef.current = true;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post<{ detail: string }>("/auth/otp/verify", {
        phone_number: mobile || lastSentMobile,
        otp: code,
        purpose: "register",
      });
      setPhoneVerified(true);
      setOtpSent(false);
      setOtp("");
      setOtpNote(data.detail || "Mobile number verified");
      setForm((f) => ({ ...f, phone_number: mobile || lastSentMobile }));
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "Could not verify OTP"));
    } finally {
      verifyingRef.current = false;
      setBusy(false);
    }
  }

  function changeNumber() {
    setPhoneVerified(false);
    setOtpSent(false);
    setOtp("");
    setOtpNote("");
    setResendIn(0);
    setLastSentMobile("");
    setError("");
    sendingRef.current = false;
    verifyingRef.current = false;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!phoneVerified) {
      setError("Verify your mobile number before creating the account");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (form.password !== form.confirm_password) {
        setError("Password and confirm password do not match");
        setSaving(false);
        return;
      }
      if (!form.full_name.trim()) {
        setError("Full name is required");
        setSaving(false);
        return;
      }
      if (!form.phone_number.trim()) {
        setError("Mobile number is required");
        setSaving(false);
        return;
      }
      if (!form.email.trim()) {
        setError("Email is required");
        setSaving(false);
        return;
      }
      if (!form.password.trim()) {
        setError("Password is required");
        setSaving(false);
        return;
      }
      if (!form.city.trim()) {
        setError("Enter your city / locality");
        setSaving(false);
        return;
      }
      if (!/^\d{6}$/.test(form.pincode.trim())) {
        setError(
          needsPincode
            ? "Enter a valid 6-digit pincode so we can match you nearby"
            : "Enter a valid 6-digit pincode",
        );
        setSaving(false);
        return;
      }
      if (isProvider && !form.business_name.trim()) {
        setError("Business / shop name is required");
        setSaving(false);
        return;
      }
      const gstin = form.gst_number.trim().toUpperCase();
      if (isProvider && !GSTIN_RE.test(gstin)) {
        setError("Enter a valid 15-character GSTIN (e.g. 29AAAAA0000A1Z5)");
        setSaving(false);
        return;
      }

      const body = new FormData();
      body.append("role", role);
      body.append("phone_number", form.phone_number.trim());
      body.append("full_name", form.full_name.trim());
      body.append("password", form.password);
      body.append("email", form.email.trim());
      if (coords.latitude != null) body.append("latitude", String(coords.latitude));
      if (coords.longitude != null) body.append("longitude", String(coords.longitude));
      if (coords.label) body.append("location_label", coords.label);
      body.append("city", form.city.trim());
      body.append("pincode", form.pincode.trim());
      if (isProvider) {
        body.append("business_name", form.business_name.trim());
        body.append("gst_number", gstin);
      }

      await api.post("/auth/register", body);

      if (isProvider) {
        setProviderPending(true);
        return;
      }

      const user = await login(form.phone_number, form.password);
      onClose();
      navigate(roleHome(user.role));
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "Registration failed"));
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const hint = `${muted} mt-[0.35rem] mb-0 text-[0.85rem]`;
  const twoCol = "grid gap-4 grid-cols-[repeat(auto-fit,minmax(260px,1fr))]";
  const section =
    "bg-bg border border-solid border-line rounded-xl py-4 px-[1.1rem]";

  return (
    <div
      className={loginModalBackdrop}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          loginModal,
          "w-[min(560px,100%)] max-h-[min(90dvh,920px)] overflow-auto pt-6",
          isProvider && "w-[min(920px,100%)]",
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <button type="button" className={loginModalClose} onClick={onClose} aria-label="Close">
          ×
        </button>

        {providerPending ? (
          <>
            <p className={eyebrow}>Almost there</p>
            <h2 id={titleId} className={loginModalTitle}>
              Registration received
            </h2>
            <p>{PROVIDER_PENDING_MSG}</p>
            <p className={muted}>You will be able to sign in after an admin approves your account.</p>
            <div className="flex gap-3 mt-[1.1rem]">
              <button type="button" className={btnSecondary} onClick={onSignIn}>
                Sign in later
              </button>
            </div>
          </>
        ) : (
          <form className="flex flex-col gap-[0.85rem]" onSubmit={onSubmit}>
            <p className={eyebrow}>Join KoshalKarobar</p>
            <h2 id={titleId} className={loginModalTitle}>

              Create your account
            </h2>
            <p className={`${muted} m-0 mb-[1.1rem]`}>
              {isProvider
                ? "All fields are required. Verify your mobile with OTP. Login opens after admin approval."
                : "All fields are required. Verify your mobile with OTP."}
            </p>

            <>
                <div className={field} style={{ maxWidth: 320 }}>
                  <label className={fieldLabel}>I am a</label>
                  <select
                    className={fieldSelect}
                    value={role}
                    onChange={(e) => {
                      setRole(e.target.value as UserRole);
                    }}
                  >
                    <option value="CONSUMER">Consumer</option>
                    <option value="PROVIDER">Provider</option>
                  </select>
                </div>

                <div className={isProvider ? "grid grid-cols-1 min-[901px]:grid-cols-2 gap-x-6 gap-y-5 mt-2" : undefined}>
                  <section className={section}>
                    <h2 className="m-0 mb-[0.35rem] text-[1.05rem]">Account details</h2>
                    <div className={isProvider ? undefined : twoCol}>
                      <div className={field}>
                        <label className={fieldLabel}>Full name</label>
                        <input
                          className={fieldInput}
                          required
                          value={form.full_name}
                          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                        />
                      </div>
                      {isProvider && (
                        <div className={field}>
                          <label className={fieldLabel}>Business / shop name</label>
                          <input
                            className={fieldInput}
                            required
                            value={form.business_name}
                            onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                            placeholder="Shown on your public page"
                          />
                        </div>
                      )}
                      <div className={field}>
                        <label className={fieldLabel} htmlFor="register-mobile">
                          Mobile number
                        </label>
                        <div className="flex items-stretch gap-2">
                          <div className="relative min-w-0 flex-1">
                            <input
                              id="register-mobile"
                              className={cn(fieldInput, phoneVerified && "pr-10")}
                              required
                              inputMode="tel"
                              autoComplete="tel"
                              value={form.phone_number}
                              onChange={(e) => {
                                const next = e.target.value;
                                setForm({ ...form, phone_number: next });
                                if (phoneVerified || indianMobile(next) !== lastSentMobile) {
                                  setPhoneVerified(false);
                                  setOtpSent(false);
                                  setOtp("");
                                  setOtpNote("");
                                }
                              }}
                              placeholder="10-digit mobile"
                              readOnly={phoneVerified || otpSent}
                            />
                            {phoneVerified && <GreenTick />}
                          </div>
                          {(!phoneVerified && !otpSent) && (
                            <button
                              type="button"
                              className={cn(btn, "shrink-0 px-4")}
                              disabled={busy || saving || !mobileReady}
                              onClick={() => void sendRegisterOtp()}
                            >
                              {busy ? "Sending…" : "Verify"}
                            </button>
                          )}
                        </div>
                        {showOtpBox && (
                          <div className="mt-3">
                            <label className={fieldLabel} htmlFor="register-otp">
                              Enter OTP
                            </label>
                            <div className="flex items-stretch gap-2 mt-[0.35rem]">
                              <input
                                id="register-otp"
                                ref={otpInputRef}
                                className={fieldInput}
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                value={otp}
                                onChange={(e) =>
                                  setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                                }
                                placeholder="6-digit OTP"
                              />
                              <button
                                type="button"
                                className={cn(btn, "shrink-0 px-4")}
                                disabled={busy || otp.replace(/\D/g, "").length < 4}
                                onClick={() => void verifyRegisterOtp()}
                              >
                                {busy ? "Checking…" : "Confirm"}
                              </button>
                            </div>
                            {otpNote && <p className={hint}>{otpNote}</p>}
                            <div className="flex flex-wrap gap-3 mt-2">
                              <button
                                type="button"
                                className={btnSecondary}
                                disabled={busy || resendIn > 0}
                                onClick={() => void sendRegisterOtp(true)}
                              >
                                {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend OTP"}
                              </button>
                              <button
                                type="button"
                                className={`${linkBlue} ${linkBtn}`}
                                onClick={changeNumber}
                              >
                                Change number
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className={cn(field, !isProvider && "col-span-full")}>
                        <label className={fieldLabel}>Email</label>
                        <input
                          className={fieldInput}
                          type="email"
                          required
                          value={form.email}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                          placeholder="you@example.com"
                        />
                        {isProvider && (
                          <p className={hint}>Used to email you within 24 hours about approval.</p>
                        )}
                      </div>
                      {isProvider ? (
                        <div className={twoCol}>
                          <div className={field}>
                            <label className={fieldLabel}>Password</label>
                            <input
                              className={fieldInput}
                              type="password"
                              required
                              minLength={6}
                              value={form.password}
                              onChange={(e) => setForm({ ...form, password: e.target.value })}
                            />
                          </div>
                          <div className={field}>
                            <label className={fieldLabel}>Confirm password</label>
                            <input
                              className={fieldInput}
                              type="password"
                              required
                              minLength={6}
                              value={form.confirm_password}
                              onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
                            />
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className={field}>
                            <label className={fieldLabel}>Password</label>
                            <input
                              className={fieldInput}
                              type="password"
                              required
                              minLength={6}
                              value={form.password}
                              onChange={(e) => setForm({ ...form, password: e.target.value })}
                            />
                          </div>
                          <div className={field}>
                            <label className={fieldLabel}>Confirm password</label>
                            <input
                              className={fieldInput}
                              type="password"
                              required
                              minLength={6}
                              value={form.confirm_password}
                              onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
                            />
                          </div>
                        </>
                      )}
                      {isProvider ? (
                        <div className={twoCol}>
                          <div className={field}>
                            <label className={fieldLabel}>City / locality</label>
                            <input
                              className={fieldInput}
                              required
                              value={form.city}
                              onChange={(e) => setForm({ ...form, city: e.target.value })}
                              placeholder="e.g. Indiranagar"
                            />
                            <p className={hint}>Auto-filled from GPS — edit if needed.</p>
                          </div>
                          <div className={field}>
                            <label className={fieldLabel}>Pincode</label>
                            <input
                              className={fieldInput}
                              required
                              inputMode="numeric"
                              pattern="\d{6}"
                              maxLength={6}
                              value={form.pincode}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  pincode: e.target.value.replace(/\D/g, "").slice(0, 6),
                                })
                              }
                              placeholder="6-digit pincode"
                            />
                            <p className={hint}>Auto-filled from GPS — edit if needed.</p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className={field}>
                            <label className={fieldLabel}>City / locality</label>
                            <input
                              className={fieldInput}
                              required
                              value={form.city}
                              onChange={(e) => setForm({ ...form, city: e.target.value })}
                              placeholder="e.g. Indiranagar"
                            />
                            <p className={hint}>Auto-filled from GPS — edit if needed.</p>
                          </div>
                          <div className={field}>
                            <label className={fieldLabel}>Pincode</label>
                            <input
                              className={fieldInput}
                              required
                              inputMode="numeric"
                              pattern="\d{6}"
                              maxLength={6}
                              value={form.pincode}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  pincode: e.target.value.replace(/\D/g, "").slice(0, 6),
                                })
                              }
                              placeholder="6-digit pincode"
                            />
                            <p className={hint}>Auto-filled from GPS — edit if needed.</p>
                          </div>
                        </>
                      )}
                      <div className={cn(field, !isProvider && "col-span-full")}>
                        <label className={fieldLabel}>Location</label>
                        <p className={`${muted} m-0`}>{locStatus}</p>
                        <button className={`${btnSecondary} mt-2`} type="button" onClick={requestLocation}>
                          Retry location
                        </button>
                      </div>
                    </div>
                  </section>

                  {isProvider && (
                    <section className={section}>
                      <h2 className="m-0 mb-[0.35rem] text-[1.05rem]">Verification</h2>
                      <div className={field}>
                        <label className={fieldLabel}>GSTIN</label>
                        <input
                          className={fieldInput}
                          required
                          value={form.gst_number}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              gst_number: e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 15),
                            })
                          }
                          placeholder="e.g. 29AAAAA0000A1Z5"
                          maxLength={15}
                          autoComplete="off"
                          spellCheck={false}
                        />
                        <p className={hint}>
                          Required 15-character GSTIN for admin review before your account is activated.
                        </p>
                      </div>
                    </section>
                  )}
                </div>
              </>

            {error && <p className={errorText}>{error}</p>}
            <div className="flex flex-wrap items-center gap-4 mt-5 pt-3 border-t border-solid border-line">
              <button className={btn} disabled={busy || saving} type="submit">
                {saving ? "Creating…" : "Create account"}
              </button>
              <p className={`${muted} m-0`}>
                Already registered?{" "}
                <button type="button" className={`${linkBlue} ${linkBtn}`} onClick={onSignIn}>
                  Sign in
                </button>
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
