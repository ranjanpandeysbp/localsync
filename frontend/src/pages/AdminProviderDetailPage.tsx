import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { mediaSrc } from "../components/Attachments";
import { InquiryChatPanel, startOrOpenAdminSupport } from "../components/InquiryChat";
import { MapsLink } from "../components/MapsLink";
import { offerKindLabel } from "../components/ProviderTrust";
import { api } from "../services/api";
import { useAdminNav } from "../store/adminNav";
import type { AdminProviderDetail, AdminSupportConversation } from "../types";

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
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [supportId, setSupportId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);

  async function load() {
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get<AdminProviderDetail>(`/admin/providers/${userId}`);
      setProvider(data);
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

  async function verify(status: "APPROVED" | "REJECTED") {
    if (!userId) return;
    setBusy(true);
    setError("");
    try {
      await api.post(`/providers/${userId}/verify`, { verification_status: status });
      setNote(`Provider ${status.toLowerCase()}`);
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
            <section className="card admin-provider-detail-hero">
              <header className="admin-provider-card-head">
                <div className="admin-provider-card-title">
                  <h2>{provider.business_name}</h2>
                  <p className="admin-provider-card-owner">{provider.full_name}</p>
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
                  <strong>{offerKindLabel(provider.offer_kind || "BOTH")}</strong>
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
                  <strong>{provider.max_radius_km} km</strong>
                </div>
              </div>

              <footer className="admin-provider-card-actions">
                <div className="admin-provider-card-actions-main">
                  {provider.verification_status === "PENDING" && (
                    <>
                      <button
                        className="btn"
                        type="button"
                        disabled={busy}
                        onClick={() => void verify("APPROVED")}
                      >
                        Approve
                      </button>
                      <button
                        className="btn danger"
                        type="button"
                        disabled={busy}
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
                      disabled={busy}
                      onClick={() => void verify("REJECTED")}
                    >
                      Revoke
                    </button>
                  )}
                  {provider.verification_status === "REJECTED" && (
                    <button
                      className="btn secondary"
                      type="button"
                      disabled={busy}
                      onClick={() => void verify("APPROVED")}
                    >
                      Re-approve
                    </button>
                  )}
                  <button
                    className="btn"
                    type="button"
                    disabled={chatBusy || busy}
                    onClick={() => void openChat()}
                  >
                    {chatBusy ? "Opening…" : chatOpen ? "Chat open" : "Chat"}
                  </button>
                </div>
                <button
                  className="btn danger admin-provider-delete"
                  type="button"
                  disabled={busy}
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

            <section className="card admin-provider-detail-section">
              <h3>Contact</h3>
              <dl className="admin-provider-meta">
                <MetaItem label="Phone">{provider.phone_number}</MetaItem>
                <MetaItem label="Alternate phone">{provider.alternate_phone}</MetaItem>
                <MetaItem label="Email">{provider.email}</MetaItem>
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
            </section>

            <section className="card admin-provider-detail-section">
              <h3>Address & location</h3>
              <dl className="admin-provider-meta">
                <MetaItem label="Location label" wide>
                  {provider.location_label}
                </MetaItem>
                <MetaItem label="Address line 1">{provider.address_line1}</MetaItem>
                <MetaItem label="Address line 2">{provider.address_line2}</MetaItem>
                <MetaItem label="City">{provider.city}</MetaItem>
                <MetaItem label="State">{provider.state}</MetaItem>
                <MetaItem label="Pincode">{provider.pincode}</MetaItem>
                <MetaItem label="Coordinates">
                  {provider.latitude != null && provider.longitude != null
                    ? `${provider.latitude.toFixed(5)}, ${provider.longitude.toFixed(5)}`
                    : null}
                </MetaItem>
                <MetaItem label="Map" wide>
                  <div className="admin-provider-maps">
                    <MapsLink
                      latitude={provider.latitude}
                      longitude={provider.longitude}
                      maps_url={provider.maps_url}
                      label={provider.location_label || undefined}
                    />
                  </div>
                </MetaItem>
              </dl>
            </section>

            <section className="card admin-provider-detail-section">
              <h3>Business profile</h3>
              <dl className="admin-provider-meta">
                <MetaItem label="Categories">{categories}</MetaItem>
                <MetaItem label="Offer kind">
                  {offerKindLabel(provider.offer_kind || "BOTH")}
                </MetaItem>
                <MetaItem label="Hours">
                  {provider.opening_time && provider.closing_time
                    ? `${provider.opening_time}–${provider.closing_time}`
                    : null}
                </MetaItem>
                <MetaItem label="Public page">
                  {provider.public_url_path ? (
                    <Link to={provider.public_url_path} target="_blank" rel="noreferrer">
                      {provider.public_slug || provider.public_url_path}
                    </Link>
                  ) : null}
                </MetaItem>
                <MetaItem label="Description" wide>
                  {provider.description}
                </MetaItem>
                <MetaItem label="Offerings" wide>
                  {provider.offerings_detail}
                </MetaItem>
                <MetaItem label="Website">
                  {provider.website_url ? (
                    <a href={provider.website_url} target="_blank" rel="noreferrer">
                      {provider.website_url}
                    </a>
                  ) : null}
                </MetaItem>
                <MetaItem label="Instagram">
                  {provider.instagram_url ? (
                    <a href={provider.instagram_url} target="_blank" rel="noreferrer">
                      {provider.instagram_url}
                    </a>
                  ) : null}
                </MetaItem>
                <MetaItem label="YouTube">
                  {provider.youtube_url ? (
                    <a href={provider.youtube_url} target="_blank" rel="noreferrer">
                      {provider.youtube_url}
                    </a>
                  ) : null}
                </MetaItem>
                <MetaItem label="Tax ID">{provider.tax_id}</MetaItem>
              </dl>
            </section>

            <section className="card admin-provider-detail-section">
              <h3>Verification documents</h3>
              <dl className="admin-provider-meta">
                <MetaItem label="GST number">{provider.gst_number}</MetaItem>
                <MetaItem label="Aadhaar number">{provider.aadhaar_number}</MetaItem>
                <MetaItem label="Aadhaar document">
                  <DocLink href={provider.aadhaar_doc_url} label="View document" />
                </MetaItem>
                <MetaItem label="GST document">
                  <DocLink href={provider.gst_doc_url} label="View document" />
                </MetaItem>
                <MetaItem label="Government ID">
                  <DocLink href={provider.government_id_url} label="View document" />
                </MetaItem>
                <MetaItem label="Business registration">
                  <DocLink href={provider.business_reg_url} label="View document" />
                </MetaItem>
              </dl>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
