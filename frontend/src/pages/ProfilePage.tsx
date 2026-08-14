import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { CategoryMultiSelect } from "../components/CategoryMultiSelect";
import { MapsLink } from "../components/MapsLink";
import { ProviderEkycSection } from "../components/ProviderEkycSection";
import { offerKindLabel } from "../components/ProviderTrust";
import { mediaSrc } from "../components/Attachments";
import { api } from "../services/api";
import { reverseGeocodeDetails } from "../services/geo";
import { useAuth } from "../store/auth";
import type { CategoryTree, OfferKind, ProviderProfile, User } from "../types";

type ProfileAccordion = "contact" | "address" | "business" | "documents" | "ekyc";

function AccordionChevron() {
  return (
    <svg
      className="profile-accordion-chevron"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

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
  const [openAccordion, setOpenAccordion] = useState<ProfileAccordion | null>("contact");
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
        max_radius_km: String(p.data.max_radius_km || 10),
      });
    }
  }

  useEffect(() => {
    void load();
  }, [user?.id]);

  function toggleAccordion(id: ProfileAccordion) {
    setOpenAccordion((prev) => (prev === id ? null : id));
  }

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
      if (!provider?.gst_doc_url) {
        setError("GST certificate is required — upload it under Upload documents");
        setOpenAccordion("documents");
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

  const contactOpen = openAccordion === "contact";
  const addressOpen = openAccordion === "address";
  const businessOpen = openAccordion === "business";
  const documentsOpen = openAccordion === "documents";
  const ekycOpen = openAccordion === "ekyc";

  return (
    <AppShell title="My profile">
      <div className="profile-page">
        <header className="profile-page-hero">
          <p className="dash-eyebrow">Account</p>
          <div className="profile-page-hero-row">
            <div>
              <h2>My profile</h2>
              <p className="muted profile-page-meta">
                <span>{user.phone_number}</span>
                <span aria-hidden="true">·</span>
                <span>{user.role}</span>
              </p>
            </div>
            {user.profile_complete ? (
              <span className="pill online">Profile complete</span>
            ) : (
              <span className="pill">Complete your details</span>
            )}
          </div>
          {note && <p className="profile-page-note">{note}</p>}
          {error && <p className="error profile-page-error">{error}</p>}
        </header>

        <div className="profile-sections" role="list">
          <section
            className={`profile-accordion ${contactOpen ? "is-open" : ""}`}
            role="listitem"
          >
            <button
              type="button"
              className="profile-accordion-trigger"
              aria-expanded={contactOpen}
              aria-controls="profile-accordion-contact"
              onClick={() => toggleAccordion("contact")}
            >
              <span className="profile-accordion-index" aria-hidden="true">
                1
              </span>
              <span className="profile-accordion-copy">
                <span className="profile-accordion-title">Contact</span>
                <span className="muted profile-accordion-hint">
                  Name, email &amp; alternate mobile
                </span>
              </span>
              <AccordionChevron />
            </button>
            {contactOpen && (
              <div className="profile-accordion-panel" id="profile-accordion-contact">
                <form className="profile-section" onSubmit={saveCommon}>
                  <div className="profile-section-list">
                    <div className="field">
                      <label>Full name</label>
                      <input
                        required
                        value={form.full_name}
                        onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                      />
                    </div>
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
                  <div className="profile-actions">
                    <button className="btn" type="submit" disabled={busy}>
                      Save contact
                    </button>
                  </div>
                </form>
              </div>
            )}
          </section>

          <section
            className={`profile-accordion ${addressOpen ? "is-open" : ""}`}
            role="listitem"
          >
            <button
              type="button"
              className="profile-accordion-trigger"
              aria-expanded={addressOpen}
              aria-controls="profile-accordion-address"
              onClick={() => toggleAccordion("address")}
            >
              <span className="profile-accordion-index" aria-hidden="true">
                2
              </span>
              <span className="profile-accordion-copy">
                <span className="profile-accordion-title">Address &amp; location</span>
                <span className="muted profile-accordion-hint">
                  Address lines, city &amp; map pin
                </span>
              </span>
              <AccordionChevron />
            </button>
            {addressOpen && (
              <div className="profile-accordion-panel" id="profile-accordion-address">
                <form className="profile-section" onSubmit={saveCommon}>
                  <div className="profile-section-list">
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
                    <div className="field">
                      <label>Pincode</label>
                      <input
                        value={form.pincode}
                        onChange={(e) => setForm({ ...form, pincode: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="profile-subblock">
                    <p className="dash-eyebrow">Map location</p>
                    <div className="profile-section-list">
                      <div className="field">
                        <label>Area label</label>
                        <input
                          value={form.location_label}
                          onChange={(e) => setForm({ ...form, location_label: e.target.value })}
                        />
                      </div>
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
                  </div>

                  <div className="profile-actions">
                    <button
                      className="btn secondary btn-with-icon"
                      type="button"
                      onClick={detectLocation}
                    >
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
                      Save address
                    </button>
                  </div>
                </form>
              </div>
            )}
          </section>

          {isProvider && (
            <>
              <section
                className={`profile-accordion ${businessOpen ? "is-open" : ""}`}
                role="listitem"
              >
                <button
                  type="button"
                  className="profile-accordion-trigger"
                  aria-expanded={businessOpen}
                  aria-controls="profile-accordion-business"
                  onClick={() => toggleAccordion("business")}
                >
                  <span className="profile-accordion-index" aria-hidden="true">
                    3
                  </span>
                  <span className="profile-accordion-copy">
                    <span className="profile-accordion-title">Business / shop details</span>
                    <span className="muted profile-accordion-hint">
                      Listing, hours &amp; verification info
                    </span>
                  </span>
                  <AccordionChevron />
                </button>
                {businessOpen && (
                  <div className="profile-accordion-panel" id="profile-accordion-business">
                    <form className="profile-section" onSubmit={saveProvider}>
                      <p className="profile-section-lead muted">
                        Required for verification and going online.
                      </p>
                      <div className="profile-section-list">
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
                            onChange={(e) =>
                              setBiz({ ...biz, offer_kind: e.target.value as OfferKind })
                            }
                          >
                            <option value="SERVICE">{offerKindLabel("SERVICE")}</option>
                            <option value="PRODUCT">{offerKindLabel("PRODUCT")}</option>
                            <option value="BOTH">{offerKindLabel("BOTH")}</option>
                          </select>
                        </div>
                        <div className="field">
                          <label>Categories &amp; subcategories</label>
                          <CategoryMultiSelect
                            tree={tree}
                            selected={categoryIds}
                            onChange={setCategoryIds}
                          />
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
                            onChange={(e) =>
                              setBiz({ ...biz, offerings_detail: e.target.value })
                            }
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
                        <div className="field">
                          <label>Max travel radius (km)</label>
                          <input
                            type="number"
                            min={1}
                            max={50}
                            value={biz.max_radius_km}
                            onChange={(e) => setBiz({ ...biz, max_radius_km: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="profile-actions">
                        <button className="btn" type="submit" disabled={busy}>
                          Save business profile
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </section>

              <section
                className={`profile-accordion ${documentsOpen ? "is-open" : ""}`}
                role="listitem"
              >
                <button
                  type="button"
                  className="profile-accordion-trigger"
                  aria-expanded={documentsOpen}
                  aria-controls="profile-accordion-documents"
                  onClick={() => toggleAccordion("documents")}
                >
                  <span className="profile-accordion-index" aria-hidden="true">
                    4
                  </span>
                  <span className="profile-accordion-copy">
                    <span className="profile-accordion-title">Upload documents</span>
                    <span className="muted profile-accordion-hint">
                      GST certificate required · ID &amp; registration
                    </span>
                  </span>
                  <AccordionChevron />
                </button>
                {documentsOpen && (
                  <div className="profile-accordion-panel" id="profile-accordion-documents">
                    <div className="profile-section">
                      <p className="profile-section-lead muted">
                        Images or PDF. <strong>GST certificate is mandatory</strong> before you can
                        save your business profile.
                      </p>
                      <div className="profile-doc-list">
                        {(
                          [
                            ["gst", "GST certificate", provider?.gst_doc_url, true],
                            ["government_id", "Government ID", provider?.government_id_url, false],
                            ["business_reg", "Business registration", provider?.business_reg_url, false],
                          ] as const
                        ).map(([key, label, url, required]) => (
                          <div
                            key={key}
                            className={`profile-doc-row${required && !url ? " is-required-missing" : ""}`}
                          >
                            <div className="profile-doc-meta">
                              <strong>
                                {label}
                                {required ? (
                                  <span className="profile-doc-required" aria-label="required">
                                    {" "}
                                    *
                                  </span>
                                ) : null}
                              </strong>
                              {url ? (
                                <a href={mediaSrc(url)} target="_blank" rel="noreferrer">
                                  View uploaded file
                                </a>
                              ) : (
                                <span className="muted">
                                  {required ? "Required — not uploaded" : "Not uploaded"}
                                </span>
                              )}
                            </div>
                            <label className="profile-doc-upload">
                              <span>{url ? "Replace file" : "Choose file"}</span>
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                disabled={busy}
                                onChange={(e) =>
                                  void uploadDoc(key, e.target.files?.[0] || null)
                                }
                              />
                            </label>
                          </div>
                        ))}
                      </div>
                      {provider && (
                        <p className="profile-verification muted">
                          Verification: {provider.verification_status}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </section>

              <section
                className={`profile-accordion ${ekycOpen ? "is-open" : ""}`}
                role="listitem"
              >
                <button
                  type="button"
                  className="profile-accordion-trigger"
                  aria-expanded={ekycOpen}
                  aria-controls="profile-accordion-ekyc"
                  onClick={() => toggleAccordion("ekyc")}
                >
                  <span className="profile-accordion-index" aria-hidden="true">
                    5
                  </span>
                  <span className="profile-accordion-copy">
                    <span className="profile-accordion-title">eKYC</span>
                    <span className="muted profile-accordion-hint">
                      Live photo, location &amp; video with customer service
                    </span>
                  </span>
                  <AccordionChevron />
                </button>
                {ekycOpen && provider && (
                  <div className="profile-accordion-panel" id="profile-accordion-ekyc">
                    <ProviderEkycSection
                      provider={provider}
                      onUpdated={(p) => {
                        setProvider(p);
                        setNote("");
                      }}
                    />
                  </div>
                )}
              </section>
            </>
          )}
        </div>

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
      </div>
    </AppShell>
  );
}
