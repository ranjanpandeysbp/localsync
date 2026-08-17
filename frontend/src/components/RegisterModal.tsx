import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, apiErrorMessage } from "../services/api";
import { reverseGeocodeDetails } from "../services/geo";
import { useAuth } from "../store/auth";
import type { UserRole } from "../types";
import { roleHome } from "../types";

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

export function RegisterModal({ open, onClose, onSignIn }: Props) {
  const login = useAuth((s) => s.login);
  const navigate = useNavigate();
  const titleId = useId();
  const onCloseRef = useRef(onClose);
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
  const [providerPending, setProviderPending] = useState(false);

  onCloseRef.current = onClose;

  const hasCoords = coords.latitude != null && coords.longitude != null;
  const needsPincode = !hasCoords;
  const isProvider = role === "PROVIDER";

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
      setProviderPending(false);
      return;
    }
    requestLocation();
  }, [open]);

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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (form.password !== form.confirm_password) {
        setError("Password and confirm password do not match");
        setBusy(false);
        return;
      }
      if (!form.full_name.trim()) {
        setError("Full name is required");
        setBusy(false);
        return;
      }
      if (!form.phone_number.trim()) {
        setError("Mobile number is required");
        setBusy(false);
        return;
      }
      if (!form.email.trim()) {
        setError("Email is required");
        setBusy(false);
        return;
      }
      if (!form.password.trim()) {
        setError("Password is required");
        setBusy(false);
        return;
      }
      if (!form.city.trim()) {
        setError("Enter your city / locality");
        setBusy(false);
        return;
      }
      if (!/^\d{6}$/.test(form.pincode.trim())) {
        setError(
          needsPincode
            ? "Enter a valid 6-digit pincode so we can match you nearby"
            : "Enter a valid 6-digit pincode",
        );
        setBusy(false);
        return;
      }
      if (isProvider && !form.business_name.trim()) {
        setError("Business / shop name is required");
        setBusy(false);
        return;
      }
      const gstin = form.gst_number.trim().toUpperCase();
      if (isProvider && !GSTIN_RE.test(gstin)) {
        setError("Enter a valid 15-character GSTIN (e.g. 29AAAAA0000A1Z5)");
        setBusy(false);
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
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="login-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`login-modal register-modal${isProvider ? " register-modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <button type="button" className="login-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        {providerPending ? (
          <>
            <p className="eyebrow">Almost there</p>
            <h2 id={titleId} className="login-modal-title">
              Registration received
            </h2>
            <p>{PROVIDER_PENDING_MSG}</p>
            <p className="muted">You will be able to sign in after an admin approves your account.</p>
            <div className="register-modal-actions">
              <button type="button" className="btn secondary" onClick={onSignIn}>
                Sign in later
              </button>
            </div>
          </>
        ) : (
          <form className="register-modal-form" onSubmit={onSubmit}>
            <p className="eyebrow">Join SahiLocal</p>
            <h2 id={titleId} className="login-modal-title">
              Create your account
            </h2>
            <p className="muted login-modal-lead">
              {isProvider
                ? "All fields are required. Login opens after admin approval."
                : "All fields are required."}
            </p>

            <div className="field" style={{ maxWidth: 320 }}>
              <label>I am a</label>
              <select
                value={role}
                onChange={(e) => {
                  setRole(e.target.value as UserRole);
                }}
              >
                <option value="CONSUMER">Consumer</option>
                <option value="PROVIDER">Provider</option>
              </select>
            </div>

            <div className={isProvider ? "register-grid" : undefined}>
              <section className="register-section">
                <h2>Account details</h2>
                <div className={isProvider ? undefined : "grid grid-2"}>
                  <div className="field">
                    <label>Full name</label>
                    <input
                      required
                      value={form.full_name}
                      onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    />
                  </div>
                  {isProvider && (
                    <div className="field">
                      <label>Business / shop name</label>
                      <input
                        required
                        value={form.business_name}
                        onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                        placeholder="Shown on your public page"
                      />
                    </div>
                  )}
                  <div className="field">
                    <label>Mobile number</label>
                    <input
                      required
                      inputMode="tel"
                      value={form.phone_number}
                      onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
                      placeholder="10-digit mobile"
                    />
                  </div>
                  <div
                    className="field"
                    style={!isProvider ? { gridColumn: "1 / -1" } : undefined}
                  >
                    <label>Email</label>
                    <input
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="you@example.com"
                    />
                    {isProvider && (
                      <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
                        Used to email you within 24 hours about approval.
                      </p>
                    )}
                  </div>
                  {isProvider ? (
                    <div className="grid grid-2">
                      <div className="field">
                        <label>Password</label>
                        <input
                          type="password"
                          required
                          minLength={6}
                          value={form.password}
                          onChange={(e) => setForm({ ...form, password: e.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label>Confirm password</label>
                        <input
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
                      <div className="field">
                        <label>Password</label>
                        <input
                          type="password"
                          required
                          minLength={6}
                          value={form.password}
                          onChange={(e) => setForm({ ...form, password: e.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label>Confirm password</label>
                        <input
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
                    <div className="grid grid-2">
                      <div className="field">
                        <label>City / locality</label>
                        <input
                          required
                          value={form.city}
                          onChange={(e) => setForm({ ...form, city: e.target.value })}
                          placeholder="e.g. Indiranagar"
                        />
                        <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
                          Auto-filled from GPS — edit if needed.
                        </p>
                      </div>
                      <div className="field">
                        <label>Pincode</label>
                        <input
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
                        <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
                          Auto-filled from GPS — edit if needed.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="field">
                        <label>City / locality</label>
                        <input
                          required
                          value={form.city}
                          onChange={(e) => setForm({ ...form, city: e.target.value })}
                          placeholder="e.g. Indiranagar"
                        />
                        <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
                          Auto-filled from GPS — edit if needed.
                        </p>
                      </div>
                      <div className="field">
                        <label>Pincode</label>
                        <input
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
                        <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
                          Auto-filled from GPS — edit if needed.
                        </p>
                      </div>
                    </>
                  )}
                  <div
                    className="field"
                    style={!isProvider ? { gridColumn: "1 / -1" } : undefined}
                  >
                    <label>Location</label>
                    <p className="muted" style={{ margin: 0 }}>
                      {locStatus}
                    </p>
                    <button
                      className="btn secondary"
                      type="button"
                      style={{ marginTop: "0.5rem" }}
                      onClick={requestLocation}
                    >
                      Retry location
                    </button>
                  </div>
                </div>
              </section>

              {isProvider && (
                <section className="register-section">
                  <h2>Verification</h2>
                  <div className="field">
                    <label>GSTIN</label>
                    <input
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
                    <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
                      Required 15-character GSTIN for admin review before your account is activated.
                    </p>
                  </div>
                </section>
              )}
            </div>

            {error && <p className="error">{error}</p>}
            <div className="register-actions">
              <button className="btn" disabled={busy} type="submit">
                {busy ? "Creating…" : "Create account"}
              </button>
              <p className="muted" style={{ margin: 0 }}>
                Already registered?{" "}
                <button type="button" className="link-blue link-btn" onClick={onSignIn}>
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
