import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { CategoryMultiSelect } from "../components/CategoryMultiSelect";
import { MapsLink } from "../components/MapsLink";
import { offerKindLabel } from "../components/ProviderTrust";
import { mediaSrc } from "../components/Attachments";
import { api } from "../services/api";
import { reverseGeocodeDetails } from "../services/geo";
import { useAuth } from "../store/auth";
import type { CategoryTree, OfferKind, ProviderProfile, User } from "../types";

export function ProfilePage() {
  const user = useAuth((s) => s.user);
  const token = useAuth((s) => s.token);
  const setSession = useAuth((s) => s.setSession);
  const [tree, setTree] = useState<CategoryTree[]>([]);
  const [provider, setProvider] = useState<ProviderProfile | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showSavedPopup, setShowSavedPopup] = useState(false);
  const [categoryIds, setCategoryIds] = useState<number[]>([]);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    alternate_phone: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    pincode: "",
    location_label: "",
    latitude: "",
    longitude: "",
  });
  const [biz, setBiz] = useState({
    business_name: "",
    offer_kind: "BOTH" as OfferKind,
    description: "",
    offerings_detail: "",
    website_url: "",
    instagram_url: "",
    youtube_url: "",
    opening_time: "09:00",
    closing_time: "18:00",
    gst_number: "",
    aadhaar_number: "",
    max_radius_km: "10",
  });

  const isProvider = user?.role === "PROVIDER";

  async function load() {
    if (!user) return;
    setForm({
      full_name: user.full_name || "",
      email: user.email || "",
      alternate_phone: user.alternate_phone || "",
      address_line1: user.address_line1 || "",
      address_line2: user.address_line2 || "",
      city: user.city || "",
      state: user.state || "",
      pincode: user.pincode || "",
      location_label: user.location_label || "",
      latitude: user.latitude != null ? String(user.latitude) : "",
      longitude: user.longitude != null ? String(user.longitude) : "",
    });
    if (
      user.latitude != null &&
      user.longitude != null &&
      (!user.state || !user.city || !user.pincode)
    ) {
      void reverseGeocodeDetails(user.latitude, user.longitude).then((details) => {
        if (!details) return;
        setForm((f) => ({
          ...f,
          city: f.city || details.city?.trim() || "",
          state: f.state || details.state?.trim() || "",
          pincode: f.pincode || details.pincode?.trim() || "",
          location_label:
            f.location_label ||
            details.location_label?.trim() ||
            f.location_label,
        }));
      });
    }
    if (isProvider) {
      const [p, cats] = await Promise.all([
        api.get<ProviderProfile>("/providers/me"),
        api.get<CategoryTree[]>("/categories/tree"),
      ]);
      setProvider(p.data);
      setTree(cats.data);
      setCategoryIds(p.data.category_ids || (p.data.category_id ? [p.data.category_id] : []));
      setBiz({
        business_name: p.data.business_name || "",
        offer_kind: p.data.offer_kind || "BOTH",
        description: p.data.description || "",
        offerings_detail: p.data.offerings_detail || "",
        website_url: p.data.website_url || "",
        instagram_url: p.data.instagram_url || "",
        youtube_url: p.data.youtube_url || "",
        opening_time: p.data.opening_time || "09:00",
        closing_time: p.data.closing_time || "18:00",
        gst_number: p.data.gst_number || "",
        aadhaar_number: p.data.aadhaar_number || "",
        max_radius_km: String(p.data.max_radius_km || 10),
      });
    }
  }

  useEffect(() => {
    void load();
  }, [user?.id]);

  function detectLocation() {
    if (!navigator.geolocation) {
      setError("Geolocation not supported on this device");
      return;
    }
    setNote("Detecting location…");
    setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setForm((f) => ({
          ...f,
          latitude: String(lat),
          longitude: String(lng),
        }));
        setNote("Resolving place name…");
        void reverseGeocodeDetails(lat, lng).then((details) => {
          const coordsText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          const cityName = details?.city?.trim() || "";
          const place =
            details?.location_label?.trim() ||
            (cityName ? `${cityName} · ${coordsText}` : coordsText);
          setForm((f) => ({
            ...f,
            latitude: String(lat),
            longitude: String(lng),
            location_label: place,
            city: cityName || f.city,
            state: details?.state?.trim() || f.state,
            pincode: details?.pincode?.trim() || f.pincode,
          }));
          setNote(`Location updated · ${place}`);
        });
      },
      () => setError("Could not detect location"),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  async function saveCommon(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data } = await api.patch<User>("/auth/me", {
        full_name: form.full_name,
        email: form.email || null,
        alternate_phone: form.alternate_phone || null,
        address_line1: form.address_line1 || null,
        address_line2: form.address_line2 || null,
        city: form.city || null,
        state: form.state || null,
        pincode: form.pincode || null,
        location_label: form.location_label || null,
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
      });
      if (token) setSession(token, data);
      setNote("");
      setShowSavedPopup(true);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed to save profile";
      setError(String(msg));
    } finally {
      setBusy(false);
    }
  }

  async function saveProvider(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (categoryIds.length === 0) {
        setError("Select at least one category or subcategory");
        setBusy(false);
        return;
      }
      if (biz.aadhaar_number && !/^\d{12}$/.test(biz.aadhaar_number)) {
        setError("Aadhaar must be 12 digits");
        setBusy(false);
        return;
      }
      const { data } = await api.patch<ProviderProfile>("/providers/me", {
        business_name: biz.business_name,
        offer_kind: biz.offer_kind,
        description: biz.description || null,
        offerings_detail: biz.offerings_detail || null,
        website_url: biz.website_url.trim() || null,
        instagram_url: biz.instagram_url.trim() || null,
        youtube_url: biz.youtube_url.trim() || null,
        opening_time: biz.opening_time || null,
        closing_time: biz.closing_time || null,
        gst_number: biz.gst_number || null,
        aadhaar_number: biz.aadhaar_number || null,
        category_ids: categoryIds,
        max_radius_km: Number(biz.max_radius_km) || 10,
        latitude: form.latitude ? Number(form.latitude) : undefined,
        longitude: form.longitude ? Number(form.longitude) : undefined,
      });
      setProvider(data);
      setNote("Business profile saved");
      const me = await api.get<User>("/auth/me");
      if (token) setSession(token, me.data);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed to save business profile";
      setError(String(msg));
    } finally {
      setBusy(false);
    }
  }

  async function uploadDoc(docType: string, file: File | null) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const { data } = await api.post<ProviderProfile>(
        `/providers/me/documents?doc_type=${docType}`,
        body,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      setProvider(data);
      setNote(`${docType.replace("_", " ")} document uploaded`);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Upload failed";
      setError(String(msg));
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    <AppShell title="My profile">
      <div className="grid" style={{ gap: "1rem" }}>
        <div className="card">
          <h2 style={{ marginBottom: "0.35rem" }}>My profile</h2>
          <p className="muted">
            Mobile <strong>{user.phone_number}</strong> · {user.role}
            {user.profile_complete ? (
              <span className="pill online" style={{ marginLeft: "0.5rem" }}>
                Profile complete
              </span>
            ) : (
              <span className="pill" style={{ marginLeft: "0.5rem" }}>
                Complete your details
              </span>
            )}
          </p>
          {note && <p className="pill online">{note}</p>}
          {error && <p className="error">{error}</p>}
        </div>

        <form className="card" onSubmit={saveCommon}>
          <h3>Contact &amp; address</h3>
          <div className="field">
            <label>Full name</label>
            <input
              required
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </div>
          <div className="grid grid-2">
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Alternate mobile</label>
              <input
                value={form.alternate_phone}
                onChange={(e) => setForm({ ...form, alternate_phone: e.target.value })}
              />
            </div>
          </div>
          <div className="field">
            <label>Address line 1</label>
            <input
              value={form.address_line1}
              onChange={(e) => setForm({ ...form, address_line1: e.target.value })}
              placeholder="House / shop no., street"
            />
          </div>
          <div className="field">
            <label>Address line 2</label>
            <input
              value={form.address_line2}
              onChange={(e) => setForm({ ...form, address_line2: e.target.value })}
              placeholder="Landmark / area"
            />
          </div>
          <div className="grid grid-2">
            <div className="field">
              <label>City</label>
              <input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </div>
            <div className="field">
              <label>State</label>
              <input
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
              />
            </div>
          </div>
          <div className="field" style={{ maxWidth: 200 }}>
            <label>Pincode</label>
            <input
              value={form.pincode}
              onChange={(e) => setForm({ ...form, pincode: e.target.value })}
            />
          </div>
          <h3>Map location</h3>
          <div className="field">
            <label>Area label</label>
            <input
              value={form.location_label}
              onChange={(e) => setForm({ ...form, location_label: e.target.value })}
            />
          </div>
          <div className="grid grid-2">
            <div className="field">
              <label>Latitude</label>
              <input
                value={form.latitude}
                onChange={(e) => setForm({ ...form, latitude: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Longitude</label>
              <input
                value={form.longitude}
                onChange={(e) => setForm({ ...form, longitude: e.target.value })}
              />
            </div>
          </div>
          <MapsLink
            latitude={form.latitude ? Number(form.latitude) : null}
            longitude={form.longitude ? Number(form.longitude) : null}
            label={form.location_label || undefined}
          />
          <div className="nav-actions" style={{ marginTop: "0.75rem" }}>
            <button className="btn secondary btn-with-icon" type="button" onClick={detectLocation}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              Detect location
            </button>
            <button className="btn" type="submit" disabled={busy}>
              Save
            </button>
          </div>
        </form>

        {showSavedPopup && (
          <div
            className="modal-backdrop"
            role="presentation"
            onClick={() => setShowSavedPopup(false)}
          >
            <div
              className="modal-dialog card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="profile-saved-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="profile-saved-title" style={{ margin: "0 0 0.5rem" }}>
                Profile Updated Successfully
              </h3>
              <p className="muted" style={{ margin: "0 0 1rem" }}>
                Your contact and address details have been saved.
              </p>
              <button className="btn" type="button" onClick={() => setShowSavedPopup(false)}>
                OK
              </button>
            </div>
          </div>
        )}

        {isProvider && (
          <>
            <form className="card" onSubmit={saveProvider}>
              <h3>Business / shop details</h3>
              <p className="muted">Required for verification and going online.</p>
              <div className="field">
                <label>Business / shop name</label>
                <input
                  required
                  value={biz.business_name}
                  onChange={(e) => setBiz({ ...biz, business_name: e.target.value })}
                />
              </div>
              <div className="field">
                <label>I offer</label>
                <select
                  value={biz.offer_kind}
                  onChange={(e) => setBiz({ ...biz, offer_kind: e.target.value as OfferKind })}
                >
                  <option value="SERVICE">{offerKindLabel("SERVICE")}</option>
                  <option value="PRODUCT">{offerKindLabel("PRODUCT")}</option>
                  <option value="BOTH">{offerKindLabel("BOTH")}</option>
                </select>
              </div>
              <div className="field">
                <label>Categories &amp; subcategories</label>
                <CategoryMultiSelect tree={tree} selected={categoryIds} onChange={setCategoryIds} />
              </div>
              <div className="field">
                <label>About</label>
                <textarea
                  rows={3}
                  value={biz.description}
                  onChange={(e) => setBiz({ ...biz, description: e.target.value })}
                  placeholder="Short business description shown on your public page"
                />
              </div>
              <div className="field">
                <label>What you offer</label>
                <textarea
                  rows={3}
                  value={biz.offerings_detail}
                  onChange={(e) => setBiz({ ...biz, offerings_detail: e.target.value })}
                  placeholder="Detailed services or products customers can expect"
                />
              </div>
              <div className="field">
                <label>Website</label>
                <input
                  type="url"
                  value={biz.website_url}
                  onChange={(e) => setBiz({ ...biz, website_url: e.target.value })}
                  placeholder="https://yourshop.com"
                />
              </div>
              <div className="grid grid-2">
                <div className="field">
                  <label>Instagram</label>
                  <input
                    type="url"
                    value={biz.instagram_url}
                    onChange={(e) => setBiz({ ...biz, instagram_url: e.target.value })}
                    placeholder="https://instagram.com/yourshop"
                  />
                </div>
                <div className="field">
                  <label>YouTube</label>
                  <input
                    type="url"
                    value={biz.youtube_url}
                    onChange={(e) => setBiz({ ...biz, youtube_url: e.target.value })}
                    placeholder="https://youtube.com/@yourshop"
                  />
                </div>
              </div>
              <div className="grid grid-2">
                <div className="field">
                  <label>Opens</label>
                  <input
                    type="time"
                    value={biz.opening_time}
                    onChange={(e) => setBiz({ ...biz, opening_time: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Closes</label>
                  <input
                    type="time"
                    value={biz.closing_time}
                    onChange={(e) => setBiz({ ...biz, closing_time: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-2">
                <div className="field">
                  <label>GST number</label>
                  <input
                    value={biz.gst_number}
                    onChange={(e) => setBiz({ ...biz, gst_number: e.target.value })}
                    placeholder="29AAAAA0000A1Z5"
                  />
                </div>
                <div className="field">
                  <label>Aadhaar number</label>
                  <input
                    value={biz.aadhaar_number}
                    onChange={(e) => setBiz({ ...biz, aadhaar_number: e.target.value })}
                    maxLength={12}
                    placeholder="12 digits"
                  />
                </div>
              </div>
              <div className="field" style={{ maxWidth: 200 }}>
                <label>Max travel radius (km)</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={biz.max_radius_km}
                  onChange={(e) => setBiz({ ...biz, max_radius_km: e.target.value })}
                />
              </div>
              <button className="btn" type="submit" disabled={busy}>
                Save business profile
              </button>
            </form>

            <div className="card">
              <h3>Upload documents</h3>
              <p className="muted">Images or PDF — Aadhaar, GST certificate, ID, business registration.</p>
              {(
                [
                  ["aadhaar", "Aadhaar document", provider?.aadhaar_doc_url],
                  ["gst", "GST certificate", provider?.gst_doc_url],
                  ["government_id", "Government ID", provider?.government_id_url],
                  ["business_reg", "Business registration", provider?.business_reg_url],
                ] as const
              ).map(([key, label, url]) => (
                <div key={key} className="field">
                  <label>{label}</label>
                  {url ? (
                    <p style={{ margin: "0.25rem 0" }}>
                      <a href={mediaSrc(url)} target="_blank" rel="noreferrer">
                        View uploaded file
                      </a>
                    </p>
                  ) : (
                    <p className="muted" style={{ margin: "0.25rem 0" }}>
                      Not uploaded
                    </p>
                  )}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    disabled={busy}
                    onChange={(e) => void uploadDoc(key, e.target.files?.[0] || null)}
                  />
                </div>
              ))}
              {provider && (
                <p className="muted" style={{ fontSize: "0.85rem" }}>
                  Verification: {provider.verification_status}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
