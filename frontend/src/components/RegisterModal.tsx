import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CategoryMultiSelect } from "./CategoryMultiSelect";
import { offerKindLabel } from "./ProviderTrust";
import { api, apiErrorMessage } from "../services/api";
import { reverseGeocodeDetails } from "../services/geo";
import { useAuth } from "../store/auth";
import type { CategoryTree, OfferKind, UserRole } from "../types";
import { isStaffRole } from "../types";

const PROVIDER_PENDING_MSG =
  "Thank you for registration, your account is being currently reviewed. Please keep checking email from us in next 24hrs.";

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
  offer_kind: "BOTH" as OfferKind,
  description: "",
  offerings_detail: "",
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
  const [tree, setTree] = useState<CategoryTree[]>([]);
  const [categoryIds, setCategoryIds] = useState<number[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [aadhaarFile, setAadhaarFile] = useState<File | null>(null);
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
      setCategoryIds([]);
      setForm(EMPTY_FORM);
      setAadhaarFile(null);
      setCoords({ latitude: null, longitude: null, label: "" });
      setLocStatus("Detecting location…");
      setError("");
      setBusy(false);
      setProviderPending(false);
      return;
    }
    requestLocation();
  }, [open]);

  useEffect(() => {
    if (!open || !isProvider) return;
    void api
      .get<CategoryTree[]>("/categories/tree")
      .then((res) => setTree(res.data))
      .catch(() => setTree([]));
  }, [open, isProvider]);

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
      if (isProvider && !form.email.trim()) {
        setError("Email is required for provider registration");
        setBusy(false);
        return;
      }
      if (isProvider && !aadhaarFile) {
        setError("Please upload your Aadhaar card for verification");
        setBusy(false);
        return;
      }
      if (isProvider && categoryIds.length === 0) {
        setError("Select at least one service / category");
        setBusy(false);
        return;
      }
      if (isProvider && !form.description.trim()) {
        setError("Please add an About / business description");
        setBusy(false);
        return;
      }
      if (isProvider && !form.offerings_detail.trim()) {
        setError("Please describe what you offer");
        setBusy(false);
        return;
      }

      const body = new FormData();
      body.append("role", role);
      body.append("phone_number", form.phone_number);
      body.append("full_name", form.full_name);
      body.append("password", form.password);
      if (form.email.trim()) body.append("email", form.email.trim());
      if (coords.latitude != null) body.append("latitude", String(coords.latitude));
      if (coords.longitude != null) body.append("longitude", String(coords.longitude));
      if (coords.label) body.append("location_label", coords.label);
      if (form.city.trim()) body.append("city", form.city.trim());
      if (form.pincode.trim()) body.append("pincode", form.pincode.trim());
      if (isProvider) {
        body.append("business_name", form.business_name.trim() || form.full_name.trim());
        body.append("description", form.description.trim());
        body.append("offerings_detail", form.offerings_detail.trim());
        body.append("offer_kind", form.offer_kind);
        body.append("category_ids_json", JSON.stringify(categoryIds));
        if (form.gst_number.trim()) body.append("gst_number", form.gst_number.trim());
        if (aadhaarFile) body.append("aadhaar_file", aadhaarFile);
      }

      await api.post("/auth/register", body);

      if (isProvider) {
        setProviderPending(true);
        return;
      }

      const user = await login(form.phone_number, form.password);
      onClose();
      navigate(isStaffRole(user.role) ? "/admin/providers" : "/profile");
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
            <p className="eyebrow">Join Gharq</p>
            <h2 id={titleId} className="login-modal-title">
              Create your account
            </h2>
            <p className="muted login-modal-lead">
              {isProvider
                ? "Full provider registration — listing details, categories, and verification docs. Login opens after admin approval."
                : "Quick signup — complete address later in My profile."}
            </p>

            <div className="field" style={{ maxWidth: 320 }}>
              <label>I am a</label>
              <select
                value={role}
                onChange={(e) => {
                  setRole(e.target.value as UserRole);
                  setAadhaarFile(null);
                  setCategoryIds([]);
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
                    <label>Email{isProvider ? "" : " (optional)"}</label>
                    <input
                      type="email"
                      required={isProvider}
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="you@example.com"
                    />
                    {isProvider && (
                      <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
                        Required so we can email you within 24 hours about approval.
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
                <>
                  <section className="register-section">
                    <h2>Services &amp; categories</h2>
                    <p className="muted">Select the categories and subcategories you serve.</p>
                    <div className="field">
                      <label>I offer</label>
                      <select
                        value={form.offer_kind}
                        onChange={(e) =>
                          setForm({ ...form, offer_kind: e.target.value as OfferKind })
                        }
                      >
                        <option value="SERVICE">{offerKindLabel("SERVICE")}</option>
                        <option value="PRODUCT">{offerKindLabel("PRODUCT")}</option>
                        <option value="BOTH">{offerKindLabel("BOTH")}</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>Categories</label>
                      <CategoryMultiSelect
                        tree={tree}
                        selected={categoryIds}
                        onChange={setCategoryIds}
                      />
                      {categoryIds.length === 0 && (
                        <p className="muted" style={{ marginTop: "0.35rem", fontSize: "0.85rem" }}>
                          No categories listed yet — pick at least one above.
                        </p>
                      )}
                    </div>
                  </section>

                  <section className="register-section">
                    <h2>About</h2>
                    <p className="muted">Short business description shown on your public page.</p>
                    <div className="field">
                      <label>About your business</label>
                      <textarea
                        required
                        rows={4}
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        placeholder="Tell customers who you are and what makes you reliable…"
                      />
                    </div>
                  </section>

                  <section className="register-section">
                    <h2>What they offer</h2>
                    <p className="muted">Detailed products or services customers can expect.</p>
                    <div className="field">
                      <label>What you offer</label>
                      <textarea
                        required
                        rows={4}
                        value={form.offerings_detail}
                        onChange={(e) => setForm({ ...form, offerings_detail: e.target.value })}
                        placeholder="List services, products, pricing notes, coverage area…"
                      />
                    </div>
                  </section>

                  <section className="register-section">
                    <h2>Verification</h2>
                    <div className="field">
                      <label>Aadhaar card (image or PDF)</label>
                      <input
                        type="file"
                        required
                        accept="image/*,application/pdf"
                        onChange={(e) => setAadhaarFile(e.target.files?.[0] || null)}
                      />
                      <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
                        Required for admin review before your account is activated.
                      </p>
                    </div>
                    <div className="field">
                      <label>GST number (if any)</label>
                      <input
                        value={form.gst_number}
                        onChange={(e) => setForm({ ...form, gst_number: e.target.value })}
                        placeholder="Optional — e.g. 29AAAAA0000A1Z5"
                      />
                    </div>
                  </section>
                </>
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
