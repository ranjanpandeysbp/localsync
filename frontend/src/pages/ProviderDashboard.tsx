import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { AttachmentGallery } from "../components/Attachments";
import { EditQuoteModal } from "../components/EditQuoteModal";
import { CompleteOrderModal } from "../components/CompleteOrderModal";
import { InquiryChatPanel, startProviderChatWithConsumer } from "../components/InquiryChat";
import { MapsLink } from "../components/MapsLink";
import { offerKindClass, offerKindLabel } from "../components/ProviderTrust";
import { SubmitQuoteModal } from "../components/SubmitQuoteModal";
import { useWebSocket } from "../hooks/useWebSocket";
import { api } from "../services/api";
import { isMeaningfulLocationLabel } from "../services/geo";
import { useProviderNav } from "../store/providerNav";
import { useAuth } from "../store/auth";
import { isProviderOnlineNow } from "../utils/businessHours";
import type { AdminSupportConversation, Conversation, Order, ProviderProfile, Quote, ServiceRequest } from "../types";

type ProviderSection =
  | "overview"
  | "support"
  | "requests"
  | "quotes"
  | "orders";

type OverviewAccordion = "storefront" | "location";
type SentQuoteFilter = "all" | "pending" | "accepted" | "upcoming";

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

const SECTIONS: ProviderSection[] = [
  "overview",
  "support",
  "requests",
  "quotes",
  "orders",
];

const REVOKED_SECTIONS: ProviderSection[] = ["overview", "support"];

const TITLES: Record<ProviderSection, string> = {
  overview: "Overview",
  support: "Admin messages",
  requests: "Incoming requests",
  quotes: "My sent quotes",
  orders: "Orders",
};

export function ProviderDashboard() {
  const { section } = useParams<{ section?: string }>();
  const isLegacyQuoteRoute = section === "quote";
  const tab = (
    !isLegacyQuoteRoute && section && SECTIONS.includes(section as ProviderSection)
      ? section
      : "overview"
  ) as ProviderSection;
  const invalidSection =
    !!section && !isLegacyQuoteRoute && !SECTIONS.includes(section as ProviderSection);

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
  const refreshUser = useAuth((s) => s.refreshUser);
  const [toast, setToast] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [overviewAccordion, setOverviewAccordion] = useState<OverviewAccordion | null>(
    "storefront",
  );
  const [quoteTarget, setQuoteTarget] = useState<ServiceRequest | null>(null);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [completingQuote, setCompletingQuote] = useState<Quote | null>(null);
  const [sentQuoteFilter, setSentQuoteFilter] = useState<SentQuoteFilter>("all");
  const [sentQuoteSearchDraft, setSentQuoteSearchDraft] = useState("");
  const [sentQuoteSearch, setSentQuoteSearch] = useState("");
  const [loc, setLoc] = useState({ longitude: "77.5946", latitude: "12.9716", max_radius_km: "10" });
  const [hoursTick, setHoursTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setHoursTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const openNow = useMemo(
    () =>
      isProviderOnlineNow({
        opening_time: profile?.opening_time,
        closing_time: profile?.closing_time,
        verification_status: profile?.verification_status,
      }),
    // Recompute when profile hours change or the clock ticks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile?.opening_time, profile?.closing_time, profile?.verification_status, hoursTick],
  );

  const { connected } = useWebSocket((msg) => {
    const m = msg as {
      type?: string;
      payload?: { title?: string; conversation_id?: string; reason?: string; body?: string };
    };
    if (m.type === "new_request") {
      setToast(`New lead: ${m.payload?.title || "Request nearby"}`);
      void refresh();
    }
    if (m.type === "request_cancelled") {
      const title = m.payload?.title || "a request";
      setToast(`Request cancelled: ${title}`);
      void refresh();
      void loadConversations();
    }
    if (m.type === "inquiry_message") {
      setToast("New inquiry from a consumer");
      void loadConversations();
    }
    if (m.type === "order_confirmed" || m.type === "order_completed" || m.type === "order_status") {
      void refresh();
    }
    if (m.type === "admin_message") {
      if (m.payload?.reason === "provider_revoked") {
        setToast("Your provider access was revoked — check Admin messages");
        void refresh();
        void refreshUser();
        void loadSupportThreads();
        bumpAdminUnread(1);
        return;
      }
      if (m.payload?.reason === "provider_approved") {
        setToast("Your account was approved — check Admin messages");
        void refresh();
        void refreshUser();
        void loadSupportThreads();
        bumpAdminUnread(1);
        return;
      }
      if (m.payload?.reason === "provider_reapproved") {
        setToast("Your account was re-approved — check Admin messages");
        void refresh();
        void refreshUser();
        void loadSupportThreads();
        bumpAdminUnread(1);
        return;
      }
      setToast("New message from Gharq admin");
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
      void refreshUser();
    } catch {
      /* profile may be missing */
    }
  }

  useEffect(() => {
    if (!invalidSection && !isLegacyQuoteRoute) void refresh();
  }, [tab, invalidSection, isLegacyQuoteRoute]);

  useEffect(() => {
    if (tab !== "requests" || invalidSection || isLegacyQuoteRoute) return;
    const timer = window.setInterval(() => {
      void api
        .get<ServiceRequest[]>("/requests/feed")
        .then(({ data }) => setFeed(data))
        .catch(() => {
          /* keep current list on poll failure */
        });
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [tab, invalidSection, isLegacyQuoteRoute]);

  const activeSentQuotes = useMemo(() => {
    const completedQuoteIds = new Set(
      orders.filter((o) => o.status === "COMPLETED").map((o) => o.quote_id),
    );
    return sentQuotes.filter((q) => !completedQuoteIds.has(q.id));
  }, [sentQuotes, orders]);

  const sentQuoteFilterCounts = useMemo(() => {
    let pending = 0;
    let accepted = 0;
    let upcoming = 0;
    for (const q of activeSentQuotes) {
      if (q.status === "PENDING") pending += 1;
      if (q.status === "ACCEPTED") {
        accepted += 1;
        const order = orders.find((o) => o.quote_id === q.id);
        if (
          order &&
          (order.status === "CONFIRMED" || order.status === "IN_PROGRESS")
        ) {
          upcoming += 1;
        }
      }
    }
    return {
      all: activeSentQuotes.length,
      pending,
      accepted,
      upcoming,
    };
  }, [activeSentQuotes, orders]);

  const filteredSentQuotes = useMemo(() => {
    const query = sentQuoteSearch.trim().toLowerCase();
    return activeSentQuotes.filter((q) => {
      if (sentQuoteFilter === "pending" && q.status !== "PENDING") return false;
      if (sentQuoteFilter === "accepted" && q.status !== "ACCEPTED") return false;
      if (sentQuoteFilter === "upcoming") {
        const order = orders.find((o) => o.quote_id === q.id);
        const isUpcoming =
          q.status === "ACCEPTED" &&
          !!order &&
          (order.status === "CONFIRMED" || order.status === "IN_PROGRESS");
        if (!isUpcoming) return false;
      }
      if (!query) return true;
      const haystack = [
        q.request_title,
        q.consumer_name,
        q.message,
        q.status,
        String(q.price_quote),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [activeSentQuotes, orders, sentQuoteFilter, sentQuoteSearch]);

  if (isLegacyQuoteRoute) {
    return <Navigate to="/provider/requests" replace />;
  }

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

  async function chatAboutQuote(q: Quote) {
    if (!q.consumer_id) {
      setToast("Consumer details unavailable for chat");
      return;
    }
    try {
      const conv = await startProviderChatWithConsumer(
        q.consumer_id,
        q.category_id,
        q.request_title
          ? `Hi, following up on my quote for "${q.request_title}".`
          : "Hi, following up on my quote.",
      );
      setActiveChatId(conv.id);
      setActiveChatTitle(q.consumer_name || "Consumer");
      await loadConversations();
      setToast("Chat opened with consumer");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Cannot start chat";
      setToast(String(msg));
    }
  }

  const isLimited =
    profile?.verification_status === "REVOKED" ||
    profile?.verification_status === "REJECTED";
  if (isLimited && !REVOKED_SECTIONS.includes(tab)) {
    return <Navigate to="/provider/overview" replace />;
  }

  return (
    <AppShell title={TITLES[tab]} connected={connected} onRefresh={refresh}>
      {toast && (
        <div className="toast" onClick={() => setToast("")}>
          {toast}
        </div>
      )}

      <SubmitQuoteModal
        open={!!quoteTarget}
        request={quoteTarget}
        onClose={() => setQuoteTarget(null)}
        onSuccess={(message) => {
          setToast(message);
          void refresh();
        }}
      />

      <EditQuoteModal
        open={!!editingQuote}
        quote={editingQuote}
        onClose={() => setEditingQuote(null)}
        onSuccess={(updated, message) => {
          setToast(message);
          setSentQuotes((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
          void refresh();
        }}
      />

      <CompleteOrderModal
        open={!!completingQuote}
        quote={completingQuote}
        order={
          completingQuote
            ? orders.find((o) => o.quote_id === completingQuote.id) || null
            : null
        }
        onClose={() => setCompletingQuote(null)}
        onSuccess={(completed, message) => {
          setToast(message);
          setOrders((prev) => prev.map((o) => (o.id === completed.id ? completed : o)));
          void refresh();
        }}
      />

      {tab === "overview" && (
        <div className="provider-overview">
          <section className="dash-surface provider-overview-hero">
            <div className="provider-overview-hero-main">
              <span
                className={`provider-overview-mark ${offerKindClass(profile?.offer_kind)}`}
                aria-hidden="true"
              >
                {(profile?.business_name || "P").trim().slice(0, 1).toUpperCase()}
              </span>
              <div className="provider-overview-identity">
                <p className="dash-eyebrow">Overview</p>
                <div className="provider-overview-title-row">
                  <h2>{profile?.business_name || "Your business"}</h2>
                  <span
                    className={`pill ${
                      profile?.verification_status === "APPROVED"
                        ? "online"
                        : profile?.verification_status === "REJECTED" ||
                            profile?.verification_status === "REVOKED"
                          ? "offline"
                          : "pending"
                    }`}
                  >
                    {profile?.verification_status === "APPROVED"
                      ? "Verified"
                      : profile?.verification_status === "REJECTED"
                        ? "Rejected"
                        : profile?.verification_status === "REVOKED"
                          ? "Revoked"
                          : "Pending approval"}
                  </span>
                  <span className="provider-overview-rating" title="Average rating">
                    ★ {(profile?.average_rating ?? 0).toFixed(1)}
                    <span className="muted">({profile?.rating_count ?? 0})</span>
                  </span>
                </div>
                <p className="provider-overview-owner muted">
                  {profile?.full_name || "Complete your profile"}
                  {profile?.offer_kind ? ` · ${offerKindLabel(profile.offer_kind)}` : ""}
                </p>
                <div className="provider-overview-status">
                  <span
                    className={`provider-overview-status-pill ${
                      openNow ? "is-online" : "is-offline"
                    }`}
                  >
                    <span className="provider-overview-status-dot" aria-hidden="true" />
                    {openNow ? "Online now" : "Offline"}
                  </span>
                  {profile?.opening_time && profile?.closing_time && (
                    <span className="provider-overview-chip" title="Business hours (IST)">
                      Hours {profile.opening_time}–{profile.closing_time}
                    </span>
                  )}
                  {(profile?.categories || []).slice(0, 3).map((cat) => (
                    <span key={cat} className="provider-overview-chip">
                      {cat}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="provider-overview-actions">
              <Link
                className="btn secondary provider-overview-edit"
                to="/profile"
                title="Edit profile"
                aria-label="Edit profile"
              >
                <span className="provider-overview-edit-label">Edit profile</span>
                <svg
                  className="provider-overview-edit-icon"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </Link>
            </div>
          </section>

          {profile?.verification_status === "PENDING" && (
            <p className="provider-overview-banner pending">
              Finish My profile, then wait for admin verification. Online status follows your
              Opens–Closes hours after approval.
            </p>
          )}
          {profile?.verification_status === "APPROVED" &&
            !(profile.opening_time && profile.closing_time) && (
              <p className="provider-overview-banner pending">
                Set Opens and Closes in My profile so your Online/Offline status can update
                automatically.
              </p>
            )}
          {profile?.verification_status === "REJECTED" && (
            <p className="provider-overview-banner error">
              Your verification was rejected. You can update My profile and message admin.
            </p>
          )}
          {profile?.verification_status === "REVOKED" && (
            <p className="provider-overview-banner error">
              Your provider access was revoked. You can update My profile and message admin.
              Marketplace features stay locked until re-approval.
            </p>
          )}

          <section className="provider-overview-kpis">
            {(() => {
              const openOrders = orders.filter(
                (o) => o.status !== "COMPLETED" && o.status !== "CANCELLED",
              ).length;
              const kpiItems = [
                {
                  key: "requests",
                  label: "Incoming requests",
                  value: feed.length,
                  to: "/provider/requests",
                  accent: true,
                },
                {
                  key: "orders",
                  label: "Open orders",
                  value: openOrders,
                  to: "/provider/orders",
                  accent: false,
                },
                {
                  key: "quotes",
                  label: "Quotes sent",
                  value: sentQuotes.length,
                  to: "/provider/quotes",
                  accent: false,
                },
              ] as const;
              return kpiItems.map((kpi) => {
                const className = `dash-surface provider-overview-kpi ${
                  kpi.accent ? "accent" : ""
                }`;
                const body = (
                  <>
                    <span className="dash-kpi-label">{kpi.label}</span>
                    <strong>{kpi.value}</strong>
                  </>
                );
                if (isLimited) {
                  return (
                    <div key={kpi.key} className={className}>
                      {body}
                    </div>
                  );
                }
                return (
                  <Link key={kpi.key} className={`${className} is-link`} to={kpi.to}>
                    {body}
                  </Link>
                );
              });
            })()}
          </section>

          <div className="profile-sections provider-overview-accordions">
            <section
              className={`profile-accordion ${overviewAccordion === "storefront" ? "is-open" : ""}`}
            >
              <button
                type="button"
                className="profile-accordion-trigger"
                aria-expanded={overviewAccordion === "storefront"}
                aria-controls="provider-overview-storefront"
                onClick={() =>
                  setOverviewAccordion((prev) => (prev === "storefront" ? null : "storefront"))
                }
              >
                <span className="profile-accordion-index" aria-hidden="true">
                  1
                </span>
                <span className="profile-accordion-copy">
                  <span className="profile-accordion-title">Storefront</span>
                  <span className="muted profile-accordion-hint">
                    Public page link &amp; marketplace shortcuts
                  </span>
                </span>
                <AccordionChevron />
              </button>
              {overviewAccordion === "storefront" && (
                <div className="profile-accordion-panel" id="provider-overview-storefront">
                  <div className="provider-overview-panel-body">
                    {profile?.user_id && profile.verification_status === "APPROVED" ? (
                      <div className="provider-overview-public">
                        <span className="provider-overview-meta-label">Public link</span>
                        <div className="provider-overview-link-row">
                          <a
                            className="provider-overview-link"
                            href={
                              profile.public_url_path ||
                              `/p/${profile.public_slug || profile.user_id}`
                            }
                            target="_blank"
                            rel="noreferrer"
                          >
                            {typeof window !== "undefined" ? window.location.origin : ""}
                            {profile.public_url_path ||
                              `/p/${profile.public_slug || profile.user_id}`}
                          </a>
                          <button
                            className="icon-btn provider-overview-copy"
                            type="button"
                            title={linkCopied ? "Copied" : "Copy public link"}
                            aria-label={linkCopied ? "Copied" : "Copy public link"}
                            onClick={() => {
                              const path =
                                profile.public_url_path ||
                                `/p/${profile.public_slug || profile.user_id}`;
                              const url = `${window.location.origin}${path}`;
                              void navigator.clipboard.writeText(url).then(() => {
                                setLinkCopied(true);
                                window.setTimeout(() => setLinkCopied(false), 2000);
                              });
                            }}
                          >
                            {linkCopied ? (
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                aria-hidden="true"
                              >
                                <path d="M20 6 9 17l-5-5" />
                              </svg>
                            ) : (
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                aria-hidden="true"
                              >
                                <rect x="9" y="9" width="13" height="13" rx="2" />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                              </svg>
                            )}
                          </button>
                          <a
                            className="icon-btn provider-overview-copy"
                            href={
                              profile.public_url_path ||
                              `/p/${profile.public_slug || profile.user_id}`
                            }
                            target="_blank"
                            rel="noreferrer"
                            title="Open in new tab"
                            aria-label="Open public page in new tab"
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
                              <path d="M14 3h7v7" />
                              <path d="M10 14 21 3" />
                              <path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6" />
                            </svg>
                          </a>
                        </div>
                      </div>
                    ) : (
                      <p className="muted provider-overview-public-empty">
                        Your public link appears here after admin approval.
                      </p>
                    )}

                    <div className="provider-overview-shortcuts-head">
                      <p className="dash-eyebrow">Shortcuts</p>
                    </div>
                    <div className="provider-overview-shortcuts">
                      {!isLimited && (
                        <>
                          <Link className="provider-overview-shortcut" to="/provider/requests">
                            <strong>Incoming requests</strong>
                            <span className="muted">Review leads in your radius</span>
                          </Link>
                          <Link className="provider-overview-shortcut" to="/provider/orders">
                            <strong>Orders</strong>
                            <span className="muted">Track active work</span>
                          </Link>
                        </>
                      )}
                      <Link className="provider-overview-shortcut" to="/profile">
                        <strong>My profile</strong>
                        <span className="muted">GST, docs & categories</span>
                      </Link>
                      {isLimited && (
                        <Link className="provider-overview-shortcut" to="/provider/support">
                          <strong>Admin messages</strong>
                          <span className="muted">Contact Gharq support</span>
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section
              className={`profile-accordion ${overviewAccordion === "location" ? "is-open" : ""}`}
            >
              <button
                type="button"
                className="profile-accordion-trigger"
                aria-expanded={overviewAccordion === "location"}
                aria-controls="provider-overview-location"
                onClick={() =>
                  setOverviewAccordion((prev) => (prev === "location" ? null : "location"))
                }
              >
                <span className="profile-accordion-index" aria-hidden="true">
                  2
                </span>
                <span className="profile-accordion-copy">
                  <span className="profile-accordion-title">Location &amp; reach</span>
                  <span className="muted profile-accordion-hint">
                    Map pin, area &amp; travel radius
                  </span>
                </span>
                <AccordionChevron />
              </button>
              {overviewAccordion === "location" && (
                <div className="profile-accordion-panel" id="provider-overview-location">
                  <div className="provider-overview-panel-body">
                    <div className="provider-overview-meta-chips">
                      <div className="provider-overview-meta-chip">
                        <span className="provider-overview-meta-label">Map</span>
                        <MapsLink
                          latitude={profile?.latitude}
                          longitude={profile?.longitude}
                          maps_url={profile?.maps_url}
                          label="Open map"
                        />
                      </div>
                      {isMeaningfulLocationLabel(profile?.location_label) && (
                        <div className="provider-overview-meta-chip">
                          <span className="provider-overview-meta-label">Area</span>
                          <strong>{profile?.location_label}</strong>
                        </div>
                      )}
                      <div className="provider-overview-meta-chip">
                        <span className="provider-overview-meta-label">Max radius</span>
                        <strong>{profile?.max_radius_km ?? "—"} km</strong>
                      </div>
                    </div>

                    <form className="provider-overview-location page-form" onSubmit={saveLocation}>
                      <div className="provider-overview-location-head">
                        <p className="dash-eyebrow">Quick update</p>
                        <h4>Adjust coordinates</h4>
                      </div>
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
                      <div className="field">
                        <label>Max travel radius (km)</label>
                        <input
                          value={loc.max_radius_km}
                          onChange={(e) => setLoc({ ...loc, max_radius_km: e.target.value })}
                        />
                      </div>
                      <div className="provider-overview-location-actions page-actions">
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
                        <button className="btn" type="submit">
                          Save location
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {tab === "support" && (
        <div className="page-stack">
          <header className="page-hero">
            <p className="dash-eyebrow">Support</p>
            <h2>Admin messages</h2>
            <p className="page-lead">
              Messages from Gharq admins about your account or listings.
            </p>
          </header>
          <section className="page-panel">
            {activeSupportId ? (
              <InquiryChatPanel
                conversationId={activeSupportId}
                mode="inline"
                title="Gharq admin"
                subtitle="Support chat"
                avatarLabel="G"
                autoFocus
                messagesPath={`/support-conversations/${activeSupportId}/messages`}
                emptyHint="No messages yet."
                placeholder="Type your reply…"
                onClose={() => setActiveSupportId(null)}
              />
            ) : (
              <div className="page-list list">
                {supportThreads.length === 0 && (
                  <p className="page-empty">No admin messages yet.</p>
                )}
                {supportThreads.map((t) => (
                  <div key={t.id} className="list-item">
                    <strong>{t.admin_name || "Gharq Admin"}</strong>
                    <div className="muted">{t.last_message || "Conversation started"}</div>
                    <p className="muted" style={{ fontSize: "0.85rem" }}>
                      Updated {new Date(t.updated_at).toLocaleString()}
                    </p>
                    <div className="page-actions">
                      <button
                        className="btn"
                        type="button"
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
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "requests" && (
        <div className="page-stack">
          <header className="page-hero">
            <p className="dash-eyebrow">Leads</p>
            <h2>Incoming requests</h2>
            <p className="page-lead">
              Chat to clarify details, then send a quote. After the consumer accepts, agree delivery
              and payment on the order and complete with OTP.
            </p>
          </header>
          <section className="page-panel">
            {activeChatId && (
              <InquiryChatPanel
                conversationId={activeChatId}
                mode="overlay"
                title={activeChatTitle}
                subtitle="Request inquiry"
                avatarLabel={activeChatTitle}
                autoFocus
                emptyHint="Ask clarifying questions before sending your quote."
                placeholder="Write a message…"
                onClose={() => setActiveChatId(null)}
              />
            )}
            <div className="page-list list">
              {feed.length === 0 && <p className="page-empty">No matching active requests.</p>}
              {feed.map((r) => (
                <div key={r.id} className="list-item">
                  <strong>{r.title}</strong>
                  <p className="muted">{r.description}</p>
                  <p className="muted" style={{ fontSize: "0.85rem" }}>
                    {r.target_mode === "TARGETED" ? "Sent to you" : "Nearby broadcast"}
                  </p>
                  <MapsLink latitude={r.latitude} longitude={r.longitude} />
                  <AttachmentGallery attachments={r.attachments} />
                  <div className="page-actions">
                    <button
                      className="btn secondary"
                      type="button"
                      onClick={() => void chatAboutRequest(r)}
                    >
                      Chat & ask
                    </button>
                    <button className="btn" type="button" onClick={() => setQuoteTarget(r)}>
                      Send quote
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === "quotes" && (
        <div className="page-stack">
          <header className="page-hero">
            <p className="dash-eyebrow">Quotes</p>
            <h2>My sent quotes</h2>
            <p className="page-lead">Quotes you have sent to consumers.</p>
            <div className="provider-sent-quotes-tools">
              <div className="dash-segment" role="tablist" aria-label="Filter sent quotes">
                {(
                  [
                    { id: "all", label: "All" },
                    { id: "pending", label: "Pending" },
                    { id: "accepted", label: "Accepted" },
                    { id: "upcoming", label: "Upcoming" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="tab"
                    aria-selected={sentQuoteFilter === opt.id}
                    className={`dash-segment-btn ${sentQuoteFilter === opt.id ? "active" : ""}`}
                    onClick={() => setSentQuoteFilter(opt.id)}
                  >
                    {opt.label}
                    <span className="consumer-requests-count">
                      {sentQuoteFilterCounts[opt.id]}
                    </span>
                  </button>
                ))}
              </div>
              <form
                className="provider-sent-quotes-search-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  setSentQuoteSearch(sentQuoteSearchDraft.trim());
                }}
              >
                <div className="field provider-sent-quotes-search">
                  <label htmlFor="sent-quote-search">Search requests</label>
                  <input
                    id="sent-quote-search"
                    type="search"
                    value={sentQuoteSearchDraft}
                    placeholder="Request title, consumer, message…"
                    onChange={(e) => setSentQuoteSearchDraft(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <button className="btn" type="submit">
                  Search
                </button>
                {sentQuoteSearch && (
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => {
                      setSentQuoteSearchDraft("");
                      setSentQuoteSearch("");
                    }}
                  >
                    Clear
                  </button>
                )}
              </form>
            </div>
          </header>
          <section className="provider-sent-quotes-panel">
            {activeChatId && (
              <InquiryChatPanel
                conversationId={activeChatId}
                mode="overlay"
                title={activeChatTitle}
                subtitle="Quote follow-up"
                avatarLabel={activeChatTitle}
                autoFocus
                emptyHint="Follow up on your quote with the consumer."
                placeholder="Write a message…"
                onClose={() => setActiveChatId(null)}
                onMessagesLoaded={() => void loadConversations()}
              />
            )}
            {activeSentQuotes.length === 0 ? (
              <div className="dash-surface provider-sent-quotes-empty">
                <h3>No open quotes</h3>
                <p className="muted">Completed deals move to Orders after you finish them.</p>
              </div>
            ) : filteredSentQuotes.length === 0 ? (
              <div className="dash-surface provider-sent-quotes-empty">
                <h3>No matches</h3>
                <p className="muted">
                  {sentQuoteSearch
                    ? `Nothing matched “${sentQuoteSearch}”. Try another search or filter.`
                    : "No quotes in this filter."}
                </p>
              </div>
            ) : (
              <div className="provider-sent-quotes-grid">
                {filteredSentQuotes.map((q) => {
                  const statusKey = q.status.toLowerCase();
                  const canEdit = q.status === "PENDING";
                  const linkedOrder = orders.find((o) => o.quote_id === q.id) || null;
                  const canComplete =
                    !!linkedOrder &&
                    linkedOrder.status !== "COMPLETED" &&
                    linkedOrder.status !== "CANCELLED";
                  const unread =
                    conversations.find((c) => c.consumer_id === q.consumer_id)?.unread_count || 0;
                  const consumerLabel = q.consumer_name || "Consumer";
                  const initial = (q.request_title || consumerLabel).trim().slice(0, 1).toUpperCase() || "Q";
                  return (
                    <article
                      key={q.id}
                      className={`provider-sent-quote-card status-${statusKey}`}
                    >
                      <div className="provider-sent-quote-accent" aria-hidden="true" />
                      <div className="provider-sent-quote-body">
                        <header className="provider-sent-quote-top">
                          <span className="provider-sent-quote-mark" aria-hidden="true">
                            {initial}
                          </span>
                          <div className="provider-sent-quote-identity">
                            <div className="provider-sent-quote-topline">
                              <span className={`pill quote-status ${statusKey}`}>{q.status}</span>
                              {linkedOrder && (
                                <span className={`pill order-status ${linkedOrder.status.toLowerCase()}`}>
                                  {linkedOrder.status.replaceAll("_", " ")}
                                </span>
                              )}
                            </div>
                            <h3>{q.request_title || "Request"}</h3>
                            <p className="muted provider-sent-quote-meta">
                              For {consumerLabel}
                              <span aria-hidden="true"> · </span>
                              {new Date(q.created_at).toLocaleString()}
                            </p>
                          </div>
                          <div className="provider-sent-quote-price">
                            <span className="provider-sent-quote-price-label">Quote</span>
                            <strong>₹{Number(q.price_quote).toLocaleString("en-IN")}</strong>
                            <span className="muted">
                              ETA {q.estimated_days} day{q.estimated_days === 1 ? "" : "s"}
                            </span>
                          </div>
                        </header>

                        {q.message && <p className="provider-sent-quote-message">{q.message}</p>}

                        {(q.attachments?.length || 0) > 0 && (
                          <div className="provider-sent-quote-attachments">
                            <AttachmentGallery attachments={q.attachments} />
                          </div>
                        )}

                        <footer className="provider-sent-quote-footer">
                          {linkedOrder ? (
                            <Link className="provider-sent-quote-order-link" to={`/orders/${linkedOrder.id}`}>
                              Open order
                            </Link>
                          ) : (
                            <span className="muted">Awaiting consumer response</span>
                          )}
                          <div className="provider-sent-quote-actions">
                            {canEdit && (
                              <button
                                className="btn secondary btn-sm"
                                type="button"
                                onClick={() => setEditingQuote(q)}
                              >
                                Edit
                              </button>
                            )}
                            {canComplete && (
                              <button
                                className="btn btn-sm"
                                type="button"
                                onClick={() => setCompletingQuote(q)}
                              >
                                Complete
                              </button>
                            )}
                            <button
                              className="btn secondary btn-sm provider-quote-chat-btn"
                              type="button"
                              disabled={!q.consumer_id}
                              aria-label={
                                unread > 0
                                  ? `Chat with ${consumerLabel}, ${unread} unread`
                                  : `Chat with ${consumerLabel}`
                              }
                              onClick={() => void chatAboutQuote(q)}
                            >
                              Chat
                              {unread > 0 && (
                                <span className="nav-badge provider-quote-chat-badge">
                                  {unread > 99 ? "99+" : unread}
                                </span>
                              )}
                            </button>
                          </div>
                        </footer>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "orders" && (
        <div className="page-stack">
          <header className="page-hero">
            <p className="dash-eyebrow">Work</p>
            <h2>Orders</h2>
            <p className="page-lead">Accepted deals and completion status.</p>
          </header>
          <section className="page-panel">
            <div className="page-list list">
              {orders.length === 0 && <p className="page-empty">No orders yet.</p>}
              {orders.map((o) => {
                const statusKey = o.status.toLowerCase();
                return (
                  <div key={o.id} className="list-item provider-order-row">
                    <div className="provider-sent-quote-head">
                      <div className="provider-sent-quote-main">
                        <strong>₹{Number(o.agreed_price).toLocaleString("en-IN")}</strong>
                        <span className={`pill order-status ${statusKey}`}>
                          {o.status === "COMPLETED"
                            ? "Completed"
                            : o.status.replaceAll("_", " ")}
                        </span>
                      </div>
                      <Link className="btn secondary btn-sm" to={`/orders/${o.id}`}>
                        Open
                      </Link>
                    </div>
                    <div className="muted" style={{ fontSize: "0.85rem" }}>
                      {o.fulfillment_type.replaceAll("_", " ")}
                      {o.payment_mode ? ` · ${o.payment_mode.replaceAll("_", " ")}` : ""}
                      {" · "}
                      {new Date(o.created_at).toLocaleString()}
                      {o.completed_at
                        ? ` · Completed ${new Date(o.completed_at).toLocaleString()}`
                        : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
