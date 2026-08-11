import { FormEvent, useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { mediaSrc } from "../components/Attachments";
import { InquiryChatPanel, startOrOpenAdminSupport } from "../components/InquiryChat";
import { MapsLink } from "../components/MapsLink";
import { offerKindLabel } from "../components/ProviderTrust";
import { api } from "../services/api";
import { useAdminNav } from "../store/adminNav";
import type { AdminProviderDetail, AdminSupportConversation, OfferKind } from "../types";

type EditForm = {
  full_name: string;
  email: string;
  alternate_phone: string;
  location_label: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  pincode: string;
  latitude: string;
  longitude: string;
  business_name: string;
  description: string;
  offerings_detail: string;
  offer_kind: OfferKind;
  opening_time: string;
  closing_time: string;
  max_radius_km: string;
  website_url: string;
  instagram_url: string;
  youtube_url: string;
  tax_id: string;
  gst_number: string;
  aadhaar_number: string;
};

function emptyForm(): EditForm {
  return {
    full_name: "",
    email: "",
    alternate_phone: "",
    location_label: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    pincode: "",
    latitude: "",
    longitude: "",
    business_name: "",
    description: "",
    offerings_detail: "",
    offer_kind: "BOTH",
    opening_time: "",
    closing_time: "",
    max_radius_km: "5",
    website_url: "",
    instagram_url: "",
    youtube_url: "",
    tax_id: "",
    gst_number: "",
    aadhaar_number: "",
  };
}

function formFromProvider(p: AdminProviderDetail): EditForm {
  return {
    full_name: p.full_name || "",
    email: p.email || "",
    alternate_phone: p.alternate_phone || "",
    location_label: p.location_label || "",
    address_line1: p.address_line1 || "",
    address_line2: p.address_line2 || "",
    city: p.city || "",
    state: p.state || "",
    pincode: p.pincode || "",
    latitude: p.latitude != null ? String(p.latitude) : "",
    longitude: p.longitude != null ? String(p.longitude) : "",
    business_name: p.business_name || "",
    description: p.description || "",
    offerings_detail: p.offerings_detail || "",
    offer_kind: p.offer_kind || "BOTH",
    opening_time: p.opening_time || "",
    closing_time: p.closing_time || "",
    max_radius_km: String(p.max_radius_km ?? 5),
    website_url: p.website_url || "",
    instagram_url: p.instagram_url || "",
    youtube_url: p.youtube_url || "",
    tax_id: p.tax_id || "",
    gst_number: p.gst_number || "",
    aadhaar_number: p.aadhaar_number || "",
  };
}

function DocLink({ href, label }: { href?: string | null; label: string }) {
  if (!href) return <span className="muted">Not uploaded</span>;
  return (
    <a href={mediaSrc(href)} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
}

function MetaItem({
  label,
  children,
  wide,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const empty =
    children == null || children === false || children === "" || children === undefined;
  return (
    <div className={wide ? "admin-provider-meta-wide" : undefined}>
      <dt>{label}</dt>
      <dd>{empty ? <span className="muted">—</span> : children}</dd>
    </div>
  );
}

export function AdminProviderDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const refreshCounts = useAdminNav((s) => s.refreshCounts);
  const [provider, setProvider] = useState<AdminProviderDetail | null>(null);
  const [form, setForm] = useState<EditForm>(emptyForm);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [supportId, setSupportId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);

  function applyProvider(data: AdminProviderDetail) {
    setProvider(data);
    setForm(formFromProvider(data));
  }

  async function load() {
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get<AdminProviderDetail>(`/admin/providers/${userId}`);
      applyProvider(data);
      try {
        const existing = await api.get<AdminSupportConversation>(
          `/support-conversations/with-provider/${userId}`,
        );
        setSupportId(existing.data.id);
      } catch {
        setSupportId(null);
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Could not load provider";
      setError(String(msg));
      setProvider(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [userId]);

  useEffect(() => {
    if (loading || !provider) return;
    if (window.location.hash === "#messaging" || window.location.hash === "#chat") {
      void openChat();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, provider]);

  function setField<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function saveDetails(e: FormEvent) {
    e.preventDefault();
    if (!userId) return;
    if (form.aadhaar_number && !/^\d{12}$/.test(form.aadhaar_number.trim())) {
      setError("Aadhaar must be 12 digits");
      return;
    }
    if (!form.business_name.trim()) {
      setError("Business name is required");
      return;
    }
    setSaving(true);
    setError("");
    setNote("");
    try {
      const lat = form.latitude.trim() ? Number(form.latitude) : null;
      const lon = form.longitude.trim() ? Number(form.longitude) : null;
      if ((lat == null) !== (lon == null) || (lat != null && Number.isNaN(lat)) || (lon != null && Number.isNaN(lon))) {
        setError("Enter both latitude and longitude, or leave both blank");
        setSaving(false);
        return;
      }
      const { data } = await api.patch<AdminProviderDetail>(`/admin/providers/${userId}`, {
        full_name: form.full_name.trim() || null,
        email: form.email.trim() || null,
        alternate_phone: form.alternate_phone.trim() || null,
        location_label: form.location_label.trim() || null,
        address_line1: form.address_line1.trim() || null,
        address_line2: form.address_line2.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        pincode: form.pincode.trim() || null,
        latitude: lat,
        longitude: lon,
        business_name: form.business_name.trim(),
        description: form.description.trim() || null,
        offerings_detail: form.offerings_detail.trim() || null,
        offer_kind: form.offer_kind,
        opening_time: form.opening_time.trim() || null,
        closing_time: form.closing_time.trim() || null,
        max_radius_km: Number(form.max_radius_km) || 5,
        website_url: form.website_url.trim() || null,
        instagram_url: form.instagram_url.trim() || null,
        youtube_url: form.youtube_url.trim() || null,
        tax_id: form.tax_id.trim() || null,
        gst_number: form.gst_number.trim() || null,
        aadhaar_number: form.aadhaar_number.trim() || null,
      });
      applyProvider(data);
      setNote("Provider details saved");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed to save provider details";
      setError(String(msg));
    } finally {
      setSaving(false);
    }
  }

  async function uploadDoc(docType: string, file: File | null) {
    if (!file || !userId) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const { data } = await api.post<AdminProviderDetail>(
        `/admin/providers/${userId}/documents?doc_type=${encodeURIComponent(docType)}`,
        body,
      );
      applyProvider(data);
      setNote("Document uploaded");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Document upload failed";
      setError(String(msg));
    } finally {
      setBusy(false);
    }
  }

  async function verify(status: "APPROVED" | "REJECTED" | "REVOKED") {
    if (!userId) return;
    setBusy(true);
    setError("");
    try {
      await api.post(`/providers/${userId}/verify`, { verification_status: status });
      setNote(
        status === "REVOKED"
          ? "Provider revoked — notification sent"
          : `Provider ${status.toLowerCase()}`,
      );
      await load();
      await refreshCounts();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Verification failed";
      setError(String(msg));
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser() {
    if (!provider || !userId) return;
    const label = provider.business_name || provider.full_name;
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    setBusy(true);
    setError("");
    try {
      await api.delete(`/admin/users/${userId}`);
      await refreshCounts();
      navigate("/admin/providers", { replace: true });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed to delete user";
      setError(String(msg));
      setBusy(false);
    }
  }

  async function openChat() {
    if (!userId) return;
    setChatBusy(true);
    setError("");
    try {
      if (!supportId) {
        const conv = await startOrOpenAdminSupport(userId);
        setSupportId(conv.id);
      }
      setChatOpen(true);
      await refreshCounts();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Could not open chat";
      setError(String(msg));
    } finally {
      setChatBusy(false);
    }
  }

  const statusLabel =
    provider?.verification_status === "PENDING"
      ? "Pending review"
      : provider?.verification_status === "APPROVED"
        ? "Approved"
        : provider?.verification_status === "REVOKED"
          ? "Revoked"
          : "Rejected";
  const statusClass =
    provider?.verification_status === "APPROVED"
      ? "online"
      : provider?.verification_status === "PENDING"
        ? "pending"
        : "offline";
  const categories =
    provider &&
    ((provider.categories && provider.categories.length > 0
      ? provider.categories.join(", ")
      : provider.category_name) ||
      null);

  const latPreview = form.latitude.trim() ? Number(form.latitude) : provider?.latitude ?? null;
  const lonPreview = form.longitude.trim() ? Number(form.longitude) : provider?.longitude ?? null;

  return (
    <AppShell title={provider?.business_name || "Provider details"} onRefresh={load}>
      <div className="admin-provider-detail">
        <div className="admin-provider-detail-nav">
          <Link className="btn secondary" to="/admin/providers">
            ← Back to providers
          </Link>
        </div>

        {note && <p className="pill online">{note}</p>}
        {error && <p className="error">{error}</p>}
        {loading && <p className="muted">Loading provider…</p>}

        {provider && !loading && (
          <>
            <section className="page-panel admin-provider-detail-hero">
              <header className="admin-provider-card-head">
                <div className="admin-provider-card-title">
                  <h2>{form.business_name || provider.business_name}</h2>
                  <p className="admin-provider-card-owner">{form.full_name || provider.full_name}</p>
                </div>
                <div className="admin-provider-card-badges">
                  <span className={`pill ${statusClass}`}>{statusLabel}</span>
                  <span className={`pill ${provider.is_online ? "online" : "offline"}`}>
                    {provider.is_online ? "Online" : "Offline"}
                  </span>
                  <span className={`pill ${provider.is_active ? "online" : "offline"}`}>
                    {provider.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
              </header>

              <div className="admin-provider-stats">
                <div>
                  <span className="admin-provider-stat-label">Offer type</span>
                  <strong>{offerKindLabel(form.offer_kind || "BOTH")}</strong>
                </div>
                <div>
                  <span className="admin-provider-stat-label">Rating</span>
                  <strong>
                    {provider.average_rating.toFixed(1)}{" "}
                    <span className="muted">
                      ({provider.rating_count} review{provider.rating_count === 1 ? "" : "s"})
                    </span>
                  </strong>
                </div>
                <div>
                  <span className="admin-provider-stat-label">Orders</span>
                  <strong>{provider.order_count}</strong>
                </div>
                <div>
                  <span className="admin-provider-stat-label">Radius</span>
                  <strong>{form.max_radius_km || provider.max_radius_km} km</strong>
                </div>
              </div>

              <footer className="admin-provider-card-actions">
                <div className="admin-provider-card-actions-main">
                  {provider.verification_status === "PENDING" && (
                    <>
                      <button
                        className="btn"
                        type="button"
                        disabled={busy || saving}
                        onClick={() => void verify("APPROVED")}
                      >
                        Approve
                      </button>
                      <button
                        className="btn danger"
                        type="button"
                        disabled={busy || saving}
                        onClick={() => void verify("REJECTED")}
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {provider.verification_status === "APPROVED" && (
                    <button
                      className="btn danger"
                      type="button"
                      disabled={busy || saving}
                      onClick={() => void verify("REVOKED")}
                    >
                      Revoke
                    </button>
                  )}
                  {(provider.verification_status === "REJECTED" ||
                    provider.verification_status === "REVOKED") && (
                    <button
                      className="btn secondary"
                      type="button"
                      disabled={busy || saving}
                      onClick={() => void verify("APPROVED")}
                    >
                      Re-approve
                    </button>
                  )}
                  <button
                    className="btn"
                    type="button"
                    disabled={chatBusy || busy || saving}
                    onClick={() => void openChat()}
                  >
                    {chatBusy ? "Opening…" : chatOpen ? "Chat open" : "Chat"}
                  </button>
                </div>
                <button
                  className="btn danger admin-provider-delete"
                  type="button"
                  disabled={busy || saving}
                  onClick={() => void deleteUser()}
                >
                  {busy ? "Working…" : "Delete"}
                </button>
              </footer>
            </section>

            {chatOpen && supportId && (
              <InquiryChatPanel
                conversationId={supportId}
                title={`Chat with ${provider.business_name}`}
                messagesPath={`/support-conversations/${supportId}/messages`}
                emptyHint="No messages yet. Say hello below."
                placeholder="Type a message to the provider…"
                onClose={() => setChatOpen(false)}
              />
            )}

            <form className="admin-provider-edit-form" onSubmit={saveDetails}>
              <section className="page-panel admin-provider-detail-section">
                <h3>Contact</h3>
                <dl className="admin-provider-meta">
                  <MetaItem label="Phone">{provider.phone_number}</MetaItem>
                  <MetaItem label="Username">
                    <code className="admin-provider-id">
                      {provider.username || provider.phone_number}
                    </code>
                  </MetaItem>
                  <MetaItem label="Joined">{new Date(provider.created_at).toLocaleString()}</MetaItem>
                  {provider.updated_at && (
                    <MetaItem label="Profile updated">
                      {new Date(provider.updated_at).toLocaleString()}
                    </MetaItem>
                  )}
                </dl>
                <div className="page-form admin-provider-edit-grid">
                  <label className="field">
                    <span>Full name</span>
                    <input
                      value={form.full_name}
                      onChange={(e) => setField("full_name", e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Email</span>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setField("email", e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Alternate phone</span>
                    <input
                      value={form.alternate_phone}
                      onChange={(e) => setField("alternate_phone", e.target.value)}
                    />
                  </label>
                </div>
              </section>

              <section className="page-panel admin-provider-detail-section">
                <h3>Address &amp; location</h3>
                <div className="page-form admin-provider-edit-grid">
                  <label className="field admin-provider-edit-wide">
                    <span>Location label</span>
                    <input
                      value={form.location_label}
                      onChange={(e) => setField("location_label", e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Address line 1</span>
                    <input
                      value={form.address_line1}
                      onChange={(e) => setField("address_line1", e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Address line 2</span>
                    <input
                      value={form.address_line2}
                      onChange={(e) => setField("address_line2", e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>City</span>
                    <input value={form.city} onChange={(e) => setField("city", e.target.value)} />
                  </label>
                  <label className="field">
                    <span>State</span>
                    <input value={form.state} onChange={(e) => setField("state", e.target.value)} />
                  </label>
                  <label className="field">
                    <span>Pincode</span>
                    <input
                      value={form.pincode}
                      onChange={(e) => setField("pincode", e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Latitude</span>
                    <input
                      value={form.latitude}
                      onChange={(e) => setField("latitude", e.target.value)}
                      inputMode="decimal"
                    />
                  </label>
                  <label className="field">
                    <span>Longitude</span>
                    <input
                      value={form.longitude}
                      onChange={(e) => setField("longitude", e.target.value)}
                      inputMode="decimal"
                    />
                  </label>
                  <div className="admin-provider-edit-wide admin-provider-maps">
                    <MapsLink
                      latitude={
                        latPreview != null && !Number.isNaN(latPreview) ? latPreview : null
                      }
                      longitude={
                        lonPreview != null && !Number.isNaN(lonPreview) ? lonPreview : null
                      }
                      maps_url={provider.maps_url}
                      label={form.location_label || undefined}
                    />
                  </div>
                </div>
              </section>

              <section className="page-panel admin-provider-detail-section">
                <h3>Business profile</h3>
                <p className="muted admin-provider-edit-hint">
                  Categories: {categories || "None assigned"}
                  {provider.public_url_path ? (
                    <>
                      {" · "}
                      <Link to={provider.public_url_path} target="_blank" rel="noreferrer">
                        Public page
                      </Link>
                    </>
                  ) : null}
                </p>
                <div className="page-form admin-provider-edit-grid">
                  <label className="field">
                    <span>Business name</span>
                    <input
                      value={form.business_name}
                      onChange={(e) => setField("business_name", e.target.value)}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Offer kind</span>
                    <select
                      value={form.offer_kind}
                      onChange={(e) => setField("offer_kind", e.target.value as OfferKind)}
                    >
                      <option value="PRODUCT">Product</option>
                      <option value="SERVICE">Service</option>
                      <option value="BOTH">Both</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Opens</span>
                    <input
                      value={form.opening_time}
                      onChange={(e) => setField("opening_time", e.target.value)}
                      placeholder="09:00"
                    />
                  </label>
                  <label className="field">
                    <span>Closes</span>
                    <input
                      value={form.closing_time}
                      onChange={(e) => setField("closing_time", e.target.value)}
                      placeholder="18:00"
                    />
                  </label>
                  <label className="field">
                    <span>Max radius (km)</span>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={form.max_radius_km}
                      onChange={(e) => setField("max_radius_km", e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Tax ID</span>
                    <input
                      value={form.tax_id}
                      onChange={(e) => setField("tax_id", e.target.value)}
                    />
                  </label>
                  <label className="field admin-provider-edit-wide">
                    <span>Description</span>
                    <textarea
                      rows={3}
                      value={form.description}
                      onChange={(e) => setField("description", e.target.value)}
                    />
                  </label>
                  <label className="field admin-provider-edit-wide">
                    <span>Offerings</span>
                    <textarea
                      rows={3}
                      value={form.offerings_detail}
                      onChange={(e) => setField("offerings_detail", e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Website</span>
                    <input
                      value={form.website_url}
                      onChange={(e) => setField("website_url", e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Instagram</span>
                    <input
                      value={form.instagram_url}
                      onChange={(e) => setField("instagram_url", e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>YouTube</span>
                    <input
                      value={form.youtube_url}
                      onChange={(e) => setField("youtube_url", e.target.value)}
                    />
                  </label>
                </div>
              </section>

              <section className="page-panel admin-provider-detail-section">
                <h3>Verification documents</h3>
                <div className="page-form admin-provider-edit-grid">
                  <label className="field">
                    <span>GST number</span>
                    <input
                      value={form.gst_number}
                      onChange={(e) => setField("gst_number", e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Aadhaar number</span>
                    <input
                      value={form.aadhaar_number}
                      onChange={(e) => setField("aadhaar_number", e.target.value)}
                      inputMode="numeric"
                      maxLength={12}
                    />
                  </label>
                </div>
                <div className="admin-provider-doc-list">
                  {(
                    [
                      ["aadhaar", "Aadhaar document", provider.aadhaar_doc_url],
                      ["gst", "GST document", provider.gst_doc_url],
                      ["government_id", "Government ID", provider.government_id_url],
                      ["business_reg", "Business registration", provider.business_reg_url],
                    ] as const
                  ).map(([key, label, url]) => (
                    <div key={key} className="admin-provider-doc-row">
                      <div className="admin-provider-doc-meta">
                        <strong>{label}</strong>
                        <div>
                          <DocLink href={url} label="View current" />
                        </div>
                      </div>
                      <label className="btn secondary admin-provider-doc-upload">
                        {busy ? "Uploading…" : "Replace"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          hidden
                          disabled={busy || saving}
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            e.target.value = "";
                            void uploadDoc(key, file);
                          }}
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </section>

              <div className="admin-provider-save-bar">
                <button className="btn" type="submit" disabled={saving || busy}>
                  {saving ? "Saving…" : "Save details"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </AppShell>
  );
}
