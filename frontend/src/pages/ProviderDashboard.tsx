import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { AttachmentGallery, FilePicker } from "../components/Attachments";
import { InquiryChatPanel, startProviderChatWithConsumer } from "../components/InquiryChat";
import { MapsLink } from "../components/MapsLink";
import { offerKindLabel } from "../components/ProviderTrust";
import { useWebSocket } from "../hooks/useWebSocket";
import { api } from "../services/api";
import { uploadFiles } from "../services/uploads";
import { useProviderNav } from "../store/providerNav";
import type { AdminSupportConversation, Conversation, Order, ProviderProfile, Quote, ServiceRequest } from "../types";

type ProviderSection =
  | "overview"
  | "inquiries"
  | "support"
  | "requests"
  | "quote"
  | "quotes"
  | "orders";

const SECTIONS: ProviderSection[] = [
  "overview",
  "inquiries",
  "support",
  "requests",
  "quote",
  "quotes",
  "orders",
];

const TITLES: Record<ProviderSection, string> = {
  overview: "Overview",
  inquiries: "Consumer inquiries",
  support: "Admin messages",
  requests: "Nearby requests",
  quote: "Submit quote",
  quotes: "My sent quotes",
  orders: "Orders",
};

type QuoteNavState = { request_id?: string; message?: string };

export function ProviderDashboard() {
  const { section } = useParams<{ section?: string }>();
  const tab = (
    section && SECTIONS.includes(section as ProviderSection) ? section : "overview"
  ) as ProviderSection;
  const invalidSection = !!section && !SECTIONS.includes(section as ProviderSection);
  const navigate = useNavigate();
  const location = useLocation();

  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [feed, setFeed] = useState<ServiceRequest[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [sentQuotes, setSentQuotes] = useState<Quote[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeChatTitle, setActiveChatTitle] = useState("");
  const [supportThreads, setSupportThreads] = useState<AdminSupportConversation[]>([]);
  const [activeSupportId, setActiveSupportId] = useState<string | null>(null);
  const bumpAdminUnread = useProviderNav((s) => s.bumpAdminUnread);
  const clearAdminUnread = useProviderNav((s) => s.clearAdminUnread);
  const refreshAdminUnread = useProviderNav((s) => s.refreshAdminUnread);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [loc, setLoc] = useState({ longitude: "77.5946", latitude: "12.9716", max_radius_km: "10" });
  const [quoteForm, setQuoteForm] = useState({
    request_id: "",
    price_quote: "",
    estimated_days: "1",
    message: "",
  });

  const { connected } = useWebSocket((msg) => {
    const m = msg as { type?: string; payload?: { title?: string; conversation_id?: string } };
    if (m.type === "new_request") {
      setToast(`New lead: ${m.payload?.title || "Request nearby"}`);
      void refresh();
    }
    if (m.type === "inquiry_message") {
      setToast("New inquiry from a consumer");
      void loadConversations();
    }
    if (m.type === "admin_message") {
      setToast("New message from LocalSync admin");
      void loadSupportThreads();
      if (activeSupportId) {
        clearAdminUnread();
      } else {
        bumpAdminUnread(1);
      }
    }
  });

  async function loadConversations() {
    const { data } = await api.get<Conversation[]>("/conversations");
    setConversations(data);
  }

  async function loadSupportThreads() {
    try {
      const { data } = await api.get<AdminSupportConversation[]>("/support-conversations");
      setSupportThreads(data);
    } catch {
      setSupportThreads([]);
    }
  }

  async function refresh() {
    try {
      const [p, f, o, q] = await Promise.all([
        api.get<ProviderProfile>("/providers/me"),
        api.get<ServiceRequest[]>("/requests/feed"),
        api.get<Order[]>("/orders/mine"),
        api.get<Quote[]>("/quotes/sent"),
      ]);
      setProfile(p.data);
      setFeed(f.data);
      setOrders(o.data);
      setSentQuotes(q.data);
      if (p.data.longitude != null) {
        setLoc({
          longitude: String(p.data.longitude),
          latitude: String(p.data.latitude ?? ""),
          max_radius_km: String(p.data.max_radius_km),
        });
      }
      await loadConversations();
      await loadSupportThreads();
      await refreshAdminUnread();
    } catch {
      /* profile may be missing */
    }
  }

  useEffect(() => {
    if (!invalidSection) void refresh();
  }, [tab, invalidSection]);

  useEffect(() => {
    const state = location.state as QuoteNavState | null;
    if (state?.request_id) {
      setQuoteForm((f) => ({
        ...f,
        request_id: state.request_id || "",
        message: state.message || f.message,
      }));
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  if (invalidSection) {
    return <Navigate to="/provider/overview" replace />;
  }

  async function saveLocation(e: FormEvent) {
    e.preventDefault();
    const { data } = await api.patch<ProviderProfile>("/providers/me", {
      longitude: Number(loc.longitude),
      latitude: Number(loc.latitude),
      max_radius_km: Number(loc.max_radius_km),
    });
    setProfile(data);
    setToast("Location updated");
  }

  function detectLocation() {
    if (!navigator.geolocation) {
      setToast("Geolocation not supported on this device");
      return;
    }
    setToast("Detecting location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoc((s) => ({
          ...s,
          latitude: String(pos.coords.latitude),
          longitude: String(pos.coords.longitude),
        }));
        setToast("Coordinates updated from GPS — click Save to apply");
      },
      () => setToast("Could not detect location"),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  async function toggleOnline() {
    if (!profile) {
      setToast("Provider profile not loaded yet");
      return;
    }

    const goingOnline = !profile.is_online;
    try {
      if (goingOnline) {
        if (!loc.latitude || !loc.longitude) {
          setToast("Set latitude and longitude, then save location before going online");
          return;
        }
        await api.patch<ProviderProfile>("/providers/me", {
          longitude: Number(loc.longitude),
          latitude: Number(loc.latitude),
          max_radius_km: Number(loc.max_radius_km || 10),
        });
      }

      const { data } = await api.post<ProviderProfile>(
        `/providers/me/online?online=${goingOnline}`,
      );
      setProfile(data);
      setToast(data.is_online ? "You are now online" : "You are now offline");
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data
        ?.detail;
      setToast(String(detail || "Could not update online status"));
    }
  }

  async function submitQuote(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const uploaded = await uploadFiles(files);
      await api.post("/quotes", {
        request_id: quoteForm.request_id,
        price_quote: Number(quoteForm.price_quote),
        estimated_days: Number(quoteForm.estimated_days),
        message: quoteForm.message || null,
        attachment_ids: uploaded.map((a) => a.id),
      });
      setToast(`Quote submitted${uploaded.length ? ` with ${uploaded.length} file(s)` : ""}`);
      setQuoteForm({ request_id: "", price_quote: "", estimated_days: "1", message: "" });
      setFiles([]);
      await refresh();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed to submit quote";
      setToast(String(msg));
    } finally {
      setBusy(false);
    }
  }

  function quoteThis(r: ServiceRequest) {
    navigate("/provider/quote", {
      state: { request_id: r.id, message: `Re: ${r.title}` } satisfies QuoteNavState,
    });
  }

  async function chatAboutRequest(r: ServiceRequest) {
    try {
      const conv = await startProviderChatWithConsumer(
        r.consumer_id,
        r.category_id,
        `Hi, I received your request "${r.title}". Could I ask a few clarifying questions?`,
      );
      setActiveChatId(conv.id);
      setActiveChatTitle("Consumer");
      await loadConversations();
      setToast("Chat opened — ask questions before sending your quote");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Cannot start chat";
      setToast(String(msg));
    }
  }

  return (
    <AppShell title={TITLES[tab]} connected={connected} onRefresh={refresh}>
      {toast && (
        <div className="toast" onClick={() => setToast("")}>
          {toast}
        </div>
      )}

      {tab === "overview" && (
        <div className="card">
          <h2>{profile?.business_name || "Provider overview"}</h2>
          <p className="muted">
            {profile?.full_name} · {offerKindLabel(profile?.offer_kind)} ·{" "}
            {profile?.verification_status}
          </p>
          {profile?.categories && profile.categories.length > 0 && (
            <p className="muted">Categories: {profile.categories.join(", ")}</p>
          )}
          <p>
            Complete address, GST, Aadhaar, categories and documents in{" "}
            <Link to="/profile">My profile</Link>.
          </p>
          {profile?.verification_status === "PENDING" && (
            <p className="error">
              Pending admin approval — finish My profile, then wait for verification before going
              online.
            </p>
          )}
          {profile?.verification_status === "REJECTED" && (
            <p className="error">Your verification was rejected. Contact support/admin.</p>
          )}
          <MapsLink
            latitude={profile?.latitude}
            longitude={profile?.longitude}
            maps_url={profile?.maps_url}
            label={profile?.location_label || undefined}
          />
          <div style={{ marginTop: "0.75rem" }}>
            <span className={`pill ${profile?.is_online ? "online" : "offline"}`}>
              {profile?.is_online ? "Online" : "Offline"}
            </span>
          </div>
          <div className="nav-actions" style={{ marginTop: "1rem" }}>
            <button
              className="btn secondary"
              type="button"
              disabled={
                !profile || (!profile.is_online && profile.verification_status !== "APPROVED")
              }
              onClick={() => void toggleOnline()}
            >
              Go {profile?.is_online ? "offline" : "online"}
            </button>
            <Link className="btn" to="/profile">
              Edit My profile
            </Link>
          </div>
          {profile?.user_id && profile.verification_status === "APPROVED" && (
            <div className="public-link-row">
              <p style={{ fontSize: "0.85rem", margin: 0, wordBreak: "break-all" }}>
                Public link:{" "}
                <a
                  className="link-blue public-link-open"
                  href={profile.public_url_path || `/p/${profile.public_slug || profile.user_id}`}
                  target="_blank"
                  rel="noreferrer"
                  title="Open in new tab"
                >
                  {typeof window !== "undefined" ? window.location.origin : ""}
                  {profile.public_url_path || `/p/${profile.public_slug || profile.user_id}`}
                  <svg
                    className="external-link-icon"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M14 3h7v7" />
                    <path d="M10 14 21 3" />
                    <path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6" />
                  </svg>
                </a>
              </p>
              <button
                className="icon-btn"
                type="button"
                title={linkCopied ? "Copied" : "Copy public link"}
                aria-label={linkCopied ? "Copied" : "Copy public link"}
                onClick={() => {
                  const path =
                    profile.public_url_path || `/p/${profile.public_slug || profile.user_id}`;
                  const url = `${window.location.origin}${path}`;
                  void navigator.clipboard.writeText(url).then(() => {
                    setLinkCopied(true);
                    window.setTimeout(() => setLinkCopied(false), 2000);
                  });
                }}
              >
                {linkCopied ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
            </div>
          )}
          <form onSubmit={saveLocation} style={{ marginTop: "1.25rem" }}>
            <h3>Quick location</h3>
            <div className="grid grid-2">
              <div className="field">
                <label>Longitude</label>
                <input
                  value={loc.longitude}
                  onChange={(e) => setLoc({ ...loc, longitude: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Latitude</label>
                <input
                  value={loc.latitude}
                  onChange={(e) => setLoc({ ...loc, latitude: e.target.value })}
                />
              </div>
            </div>
            <MapsLink latitude={Number(loc.latitude)} longitude={Number(loc.longitude)} />
            <div className="field">
              <label>Max travel radius (km)</label>
              <input
                value={loc.max_radius_km}
                onChange={(e) => setLoc({ ...loc, max_radius_km: e.target.value })}
              />
            </div>
            <div className="nav-actions">
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
              <button className="btn" type="submit">
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {tab === "inquiries" && (
        <div className="card">
          <h2>Consumer inquiries</h2>
          <p className="muted">Pre-request questions from consumers while you are online.</p>
          {activeChatId ? (
            <InquiryChatPanel
              conversationId={activeChatId}
              title={`Chat with ${activeChatTitle}`}
              onClose={() => setActiveChatId(null)}
            />
          ) : (
            <div className="list">
              {conversations.length === 0 && <p className="muted">No inquiries yet.</p>}
              {conversations.map((c) => (
                <div key={c.id} className="list-item">
                  <strong>{c.consumer_name}</strong>
                  <div className="muted">{c.last_message || "Opened a chat"}</div>
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => {
                      setActiveChatId(c.id);
                      setActiveChatTitle(c.consumer_name || "Consumer");
                    }}
                  >
                    Reply
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "support" && (
        <div className="card">
          <h2>Admin messages</h2>
          <p className="muted">Messages from LocalSync admins about your account or listings.</p>
          {activeSupportId ? (
            <InquiryChatPanel
              conversationId={activeSupportId}
              title="Chat with LocalSync admin"
              messagesPath={`/support-conversations/${activeSupportId}/messages`}
              emptyHint="No messages yet."
              placeholder="Type your reply…"
              onClose={() => setActiveSupportId(null)}
            />
          ) : (
            <div className="list">
              {supportThreads.length === 0 && (
                <p className="muted">No admin messages yet.</p>
              )}
              {supportThreads.map((t) => (
                <div key={t.id} className="list-item">
                  <strong>{t.admin_name || "LocalSync Admin"}</strong>
                  <div className="muted">{t.last_message || "Conversation started"}</div>
                  <p className="muted" style={{ fontSize: "0.85rem" }}>
                    Updated {new Date(t.updated_at).toLocaleString()}
                  </p>
                  <button
                    className="btn"
                    type="button"
                    style={{ marginTop: "0.5rem" }}
                    onClick={() => {
                      setActiveSupportId(t.id);
                      clearAdminUnread();
                    }}
                  >
                    Open chat
                    {(t.unread_count || 0) > 0 && (
                      <span className="nav-badge" style={{ marginLeft: "0.4rem" }}>
                        {t.unread_count}
                      </span>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "requests" && (
        <div className="card">
          <h2>Nearby requests</h2>
          <p className="muted">
            Chat to clarify details, then send a quote. After the consumer accepts, agree delivery
            and payment on the order and complete with OTP.
          </p>
          {activeChatId && (
            <div style={{ marginBottom: "1rem" }}>
              <InquiryChatPanel
                conversationId={activeChatId}
                title={`Chat with ${activeChatTitle}`}
                onClose={() => setActiveChatId(null)}
              />
            </div>
          )}
          <div className="list">
            {feed.length === 0 && <p className="muted">No matching active requests.</p>}
            {feed.map((r) => (
              <div key={r.id} className="list-item">
                <strong>{r.title}</strong>
                <p className="muted">{r.description}</p>
                <p className="muted" style={{ fontSize: "0.85rem" }}>
                  {r.target_mode === "TARGETED" ? "Sent to you" : "Nearby broadcast"}
                </p>
                <MapsLink latitude={r.latitude} longitude={r.longitude} />
                <AttachmentGallery attachments={r.attachments} />
                <div className="nav-actions" style={{ marginTop: "0.5rem" }}>
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => void chatAboutRequest(r)}
                  >
                    Chat & ask
                  </button>
                  <button className="btn" type="button" onClick={() => quoteThis(r)}>
                    Send quote
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "quote" && (
        <form className="card" onSubmit={submitQuote} style={{ maxWidth: 640 }}>
          <h2>Submit quote</h2>
          <p className="muted">Pick a request from Nearby requests, or paste a request ID.</p>
          <div className="field">
            <label>Request ID</label>
            <input
              required
              value={quoteForm.request_id}
              onChange={(e) => setQuoteForm({ ...quoteForm, request_id: e.target.value })}
            />
          </div>
          <div className="grid grid-2">
            <div className="field">
              <label>Price (₹)</label>
              <input
                required
                type="number"
                min={1}
                value={quoteForm.price_quote}
                onChange={(e) => setQuoteForm({ ...quoteForm, price_quote: e.target.value })}
              />
            </div>
            <div className="field">
              <label>ETA (days)</label>
              <input
                required
                type="number"
                min={1}
                max={365}
                value={quoteForm.estimated_days}
                onChange={(e) => setQuoteForm({ ...quoteForm, estimated_days: e.target.value })}
              />
            </div>
          </div>
          <div className="field">
            <label>Message</label>
            <textarea
              rows={2}
              value={quoteForm.message}
              onChange={(e) => setQuoteForm({ ...quoteForm, message: e.target.value })}
            />
          </div>
          <FilePicker files={files} onChange={setFiles} disabled={busy} />
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Uploading & sending…" : "Send quote"}
          </button>
        </form>
      )}

      {tab === "quotes" && (
        <div className="card">
          <h2>My sent quotes</h2>
          <div className="list">
            {sentQuotes.length === 0 && <p className="muted">No quotes sent yet.</p>}
            {sentQuotes.map((q) => (
              <div key={q.id} className="list-item">
                <strong>
                  ₹{q.price_quote} · ETA {q.estimated_days} day{q.estimated_days === 1 ? "" : "s"}
                </strong>
                <div className="muted">
                  {q.request_title || "Request"} · for {q.consumer_name || "consumer"} · {q.status}
                </div>
                {q.message && <p>{q.message}</p>}
                <AttachmentGallery attachments={q.attachments} />
                <div className="muted" style={{ fontSize: "0.8rem" }}>
                  {new Date(q.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "orders" && (
        <div className="card">
          <h2>Orders</h2>
          <div className="list">
            {orders.length === 0 && <p className="muted">No orders yet.</p>}
            {orders.map((o) => (
              <div key={o.id} className="list-item">
                ₹{o.agreed_price} · {o.status}
                <div>
                  <Link to={`/orders/${o.id}`}>Open →</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}
