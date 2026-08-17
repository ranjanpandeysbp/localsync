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
import { StatusFilterSelect } from "../components/StatusFilterSelect";
import { useWebSocket } from "../hooks/useWebSocket";
import { api } from "../services/api";
import { isMeaningfulLocationLabel } from "../services/geo";
import { useProviderNav } from "../store/providerNav";
import { useAuth } from "../store/auth";
import { isProviderOnlineNow } from "../utils/businessHours";
import type { AdminSupportConversation, CategoryTree, Conversation, Order, ProviderProfile, Quote, ServiceRequest } from "../types";

type ProviderSection =
  | "overview"
  | "support"
  | "requests"
  | "quotes"
  | "orders";

type OverviewAccordion = "storefront" | "location";
type SentQuoteFilter = "all" | "pending" | "accepted" | "rejected" | "upcoming";
type OrderStatusFilter =
  | "all"
  | "CONFIRMED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "DISPUTED"
  | "REJECTED"
  | "EXPIRED_REQUEST";

const ORDER_STATUS_FILTERS: { id: OrderStatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "CONFIRMED", label: "Confirmed" },
  { id: "IN_PROGRESS", label: "In progress" },
  { id: "COMPLETED", label: "Completed" },
  { id: "CANCELLED", label: "Cancelled" },
  { id: "DISPUTED", label: "Disputed" },
  { id: "REJECTED", label: "Rejected" },
  { id: "EXPIRED_REQUEST", label: "Expired" },
];

function orderStatusLabel(status: Order["status"]): string {
  if (status === "COMPLETED") return "Completed";
  if (status === "REJECTED") return "Rejected";
  return status.replaceAll("_", " ");
}

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

const EXPIRING_HOURS = 6;

function formatInr(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function hoursUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return ms / 3_600_000;
}

function formatEta(iso: string | null | undefined): string {
  const hours = hoursUntil(iso);
  if (hours == null) return "";
  if (hours <= 0) return "Expired";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min left`;
  if (hours < 24) return `${Math.round(hours)} hr left`;
  return `${Math.round(hours / 24)} d left`;
}

function isSameLocalDay(iso: string | null | undefined, now = new Date()): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function startOfMonth(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function daysAgo(n: number, now = new Date()): Date {
  return new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
}

function categoryLabel(tree: CategoryTree[], id: number | null | undefined): string {
  if (id == null) return "Other";
  for (const parent of tree) {
    if (parent.id === id) return parent.name;
    const sub = (parent.subcategories || []).find((s) => s.id === id);
    if (sub) return `${parent.name} › ${sub.name}`;
  }
  return "Other";
}

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
  const [categoryTree, setCategoryTree] = useState<CategoryTree[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeChatTitle, setActiveChatTitle] = useState("");
  const [supportThreads, setSupportThreads] = useState<AdminSupportConversation[]>([]);
  const [activeSupportId, setActiveSupportId] = useState<string | null>(null);
  const bumpAdminUnread = useProviderNav((s) => s.bumpAdminUnread);
  const clearAdminUnread = useProviderNav((s) => s.clearAdminUnread);
  const refreshAdminUnread = useProviderNav((s) => s.refreshAdminUnread);
  const refreshInquiryUnread = useProviderNav((s) => s.refreshInquiryUnread);
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
  const [orderStatusFilter, setOrderStatusFilter] = useState<OrderStatusFilter>("all");
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
      payload?: {
        title?: string;
        conversation_id?: string;
        consumer_id?: string;
        reason?: string;
        body?: string;
        request_title?: string;
      };
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
    if (m.type === "request_expired") {
      setToast("A request expired before a deal was locked");
      void refresh();
    }
    if (m.type === "inquiry_message") {
      setToast("New inquiry from a consumer");
      void loadConversations();
      void refreshInquiryUnread();
    }
    if (m.type === "order_confirmed" || m.type === "order_status") {
      void refresh();
    }
    if (m.type === "order_completed" || m.type === "conversation_reset") {
      const closedId = m.payload?.conversation_id;
      const closedConsumerId = m.payload?.consumer_id;
      setConversations((prev) =>
        prev.filter((c) => {
          if (closedId && c.id === closedId) return false;
          if (closedConsumerId && c.consumer_id === closedConsumerId) return false;
          return true;
        }),
      );
      setActiveChatId((current) => {
        if (closedId && current === closedId) {
          setActiveChatTitle("");
          return null;
        }
        return current;
      });
      if (m.type === "order_completed") {
        void refresh();
      } else {
        void loadConversations();
        void refreshInquiryUnread();
      }
    }
    if (m.type === "quote_rejected") {
      setToast(
        `Another quote was accepted for ${m.payload?.request_title || "a request"} — yours was rejected`,
      );
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
    const sorted = [...data].sort((a, b) => {
      const aUnread = (a.unread_count || 0) > 0 ? 0 : 1;
      const bUnread = (b.unread_count || 0) > 0 ? 0 : 1;
      if (aUnread !== bUnread) return aUnread - bUnread;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
    setConversations(sorted);
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
      const [p, f, o, q, cats] = await Promise.all([
        api.get<ProviderProfile>("/providers/me"),
        api.get<ServiceRequest[]>("/requests/feed"),
        api.get<Order[]>("/orders/mine"),
        api.get<Quote[]>("/quotes/sent"),
        api.get<CategoryTree[]>("/categories/tree").catch(() => ({ data: [] as CategoryTree[] })),
      ]);
      setProfile(p.data);
      setFeed(f.data);
      setOrders(o.data);
      setSentQuotes(q.data);
      setCategoryTree(cats.data || []);
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
    return sentQuotes.filter(
      (q) => !completedQuoteIds.has(q.id) && q.request_status !== "EXPIRED",
    );
  }, [sentQuotes, orders]);

  const sentQuoteFilterCounts = useMemo(() => {
    let pending = 0;
    let accepted = 0;
    let rejected = 0;
    let upcoming = 0;
    for (const q of activeSentQuotes) {
      if (q.status === "PENDING") pending += 1;
      if (q.status === "REJECTED") rejected += 1;
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
      rejected,
      upcoming,
    };
  }, [activeSentQuotes, orders]);

  const filteredSentQuotes = useMemo(() => {
    const query = sentQuoteSearch.trim().toLowerCase();
    return activeSentQuotes.filter((q) => {
      if (sentQuoteFilter === "pending" && q.status !== "PENDING") return false;
      if (sentQuoteFilter === "accepted" && q.status !== "ACCEPTED") return false;
      if (sentQuoteFilter === "rejected" && q.status !== "REJECTED") return false;
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

  const expiredSentQuotes = useMemo(
    () => sentQuotes.filter((q) => q.request_status === "EXPIRED"),
    [sentQuotes],
  );

  const completeOrdersFeed = useMemo(() => {
    const orderItems = orders.map((o) => ({
      kind: "order" as const,
      id: o.id,
      sortAt: o.completed_at || o.created_at,
      order: o,
    }));
    const expiredItems = expiredSentQuotes.map((q) => ({
      kind: "expired_request" as const,
      id: q.id,
      sortAt: q.created_at,
      quote: q,
    }));
    return [...orderItems, ...expiredItems].sort(
      (a, b) => new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime(),
    );
  }, [orders, expiredSentQuotes]);

  const orderStatusFilterCounts = useMemo(() => {
    const counts: Record<OrderStatusFilter, number> = {
      all: completeOrdersFeed.length,
      CONFIRMED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      CANCELLED: 0,
      DISPUTED: 0,
      REJECTED: 0,
      EXPIRED_REQUEST: 0,
    };
    for (const item of completeOrdersFeed) {
      if (item.kind === "expired_request") {
        counts.EXPIRED_REQUEST += 1;
      } else {
        counts[item.order.status] += 1;
      }
    }
    return counts;
  }, [completeOrdersFeed]);

  const filteredOrders = useMemo(() => {
    if (orderStatusFilter === "all") return completeOrdersFeed;
    if (orderStatusFilter === "EXPIRED_REQUEST") {
      return completeOrdersFeed.filter((item) => item.kind === "expired_request");
    }
    return completeOrdersFeed.filter(
      (item) => item.kind === "order" && item.order.status === orderStatusFilter,
    );
  }, [completeOrdersFeed, orderStatusFilter]);

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
        r.id,
      );
      setActiveChatId(conv.id);
      setActiveChatTitle("Consumer");
      await loadConversations();
      void refreshInquiryUnread();
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
      void refreshInquiryUnread();
      setToast("Chat opened with consumer");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Cannot start chat";
      setToast(String(msg));
    }
  }

  const overviewDash = useMemo(() => {
    const quotedIds = new Set(sentQuotes.map((q) => q.request_id));
    const quoteThese = [...feed]
      .filter((r) => r.status === "ACTIVE" && !quotedIds.has(r.id))
      .sort((a, b) => {
        const ae = a.expires_at ? new Date(a.expires_at).getTime() : Number.POSITIVE_INFINITY;
        const be = b.expires_at ? new Date(b.expires_at).getTime() : Number.POSITIVE_INFINITY;
        return ae - be;
      });
    const waitingQuotes = sentQuotes.filter((q) => q.status === "PENDING");
    const activeJobs = orders.filter(
      (o) => o.status === "CONFIRMED" || o.status === "IN_PROGRESS",
    );
    const unreadChats = conversations.filter((c) => (c.unread_count || 0) > 0);
    const expiringLeads = quoteThese.filter((r) => {
      const h = hoursUntil(r.expires_at);
      return h != null && h > 0 && h <= EXPIRING_HOURS;
    });
    const leadsToday = feed.filter((r) => isSameLocalDay(r.created_at)).length;
    const pending = sentQuotes.filter((q) => q.status === "PENDING").length;
    const accepted = sentQuotes.filter((q) => q.status === "ACCEPTED").length;
    const rejected = sentQuotes.filter((q) => q.status === "REJECTED").length;
    const decided = accepted + rejected;
    const winRate = decided > 0 ? Math.round((accepted / decided) * 100) : null;
    const weekStart = daysAgo(7);
    const monthStart = startOfMonth();
    const completed = orders.filter((o) => o.status === "COMPLETED");
    const sumSince = (since: Date) =>
      completed.reduce((sum, o) => {
        const stamp = o.completed_at || o.created_at;
        return new Date(stamp).getTime() >= since.getTime() ? sum + (o.agreed_price || 0) : sum;
      }, 0);
    const checks = [
      {
        id: "hours",
        label: "Business hours",
        ok: Boolean(profile?.opening_time && profile?.closing_time),
        to: "/profile",
      },
      {
        id: "location",
        label: "Map location",
        ok: profile?.latitude != null && profile?.longitude != null,
        to: "/profile",
      },
      {
        id: "radius",
        label: "Service radius",
        ok: (profile?.max_radius_km || 0) > 0,
        to: "/profile",
      },
      {
        id: "categories",
        label: "Categories",
        ok: (profile?.categories || []).length > 0,
        to: "/profile",
      },
      {
        id: "description",
        label: "Business description",
        ok: Boolean(profile?.description?.trim()),
        to: "/profile",
      },
      {
        id: "public",
        label: "Public page",
        ok:
          profile?.verification_status === "APPROVED" &&
          Boolean(profile.public_url_path || profile.public_slug || profile.user_id),
        to: profile?.public_url_path || `/p/${profile?.public_slug || profile?.user_id || ""}`,
      },
    ];
    const mixMap = new Map<string, number>();
    const bump = (id: number | null | undefined) => {
      const label = categoryLabel(categoryTree, id);
      mixMap.set(label, (mixMap.get(label) || 0) + 1);
    };
    const since30 = daysAgo(30).getTime();
    for (const r of feed) {
      if (new Date(r.created_at).getTime() >= since30) bump(r.category_id);
    }
    for (const q of sentQuotes) {
      if (new Date(q.created_at).getTime() >= since30) bump(q.category_id);
    }
    for (const o of orders) {
      const stamp = o.completed_at || o.created_at;
      if (new Date(stamp).getTime() < since30) continue;
      const quote = sentQuotes.find((q) => q.id === o.quote_id);
      bump(quote?.category_id ?? null);
    }
    const mix = [...mixMap.entries()]
      .filter(([label]) => label !== "Other" || mixMap.size === 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const mixTotal = mix.reduce((s, [, n]) => s + n, 0) || 1;
    return {
      quoteThese,
      waitingQuotes,
      activeJobs,
      unreadChats,
      expiringLeads,
      leadsToday,
      pending,
      accepted,
      rejected,
      winRate,
      weekEarn: sumSince(weekStart),
      monthEarn: sumSince(monthStart),
      completedCount: completed.length,
      checks,
      checksDone: checks.filter((c) => c.ok).length,
      mix,
      mixTotal,
    };
  }, [feed, sentQuotes, orders, conversations, profile, categoryTree]);

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

          <section className="provider-today" aria-label="Today">
            <div className="provider-today-item">
              <span className="provider-today-label">Status</span>
              <strong className={openNow ? "is-on" : ""}>{openNow ? "Online now" : "Offline"}</strong>
            </div>
            <div className="provider-today-item">
              <span className="provider-today-label">Hours</span>
              <strong>
                {profile?.opening_time && profile?.closing_time
                  ? `${profile.opening_time}–${profile.closing_time}`
                  : "Not set"}
              </strong>
            </div>
            <div className="provider-today-item">
              <span className="provider-today-label">New leads today</span>
              <strong>{overviewDash.leadsToday}</strong>
            </div>
            <div className="provider-today-item">
              <span className="provider-today-label">Jobs in progress</span>
              <strong>{overviewDash.activeJobs.length}</strong>
            </div>
          </section>

          {!isLimited && (
            <section className="provider-board" aria-label="Needs attention">
              <div className="provider-board-head">
                <div>
                  <p className="dash-eyebrow">Work</p>
                  <h3>Needs attention</h3>
                </div>
              </div>
              <div className="provider-board-grid">
                <article className="dash-surface provider-board-col">
                  <div className="provider-board-col-head">
                    <h4>Quote these</h4>
                    <span>{overviewDash.quoteThese.length}</span>
                  </div>
                  {overviewDash.quoteThese.length === 0 ? (
                    <p className="muted provider-board-empty">No new leads to quote.</p>
                  ) : (
                    <ul>
                      {overviewDash.quoteThese.slice(0, 4).map((r) => (
                        <li key={r.id}>
                          <Link to="/provider/requests">
                            <strong>{r.title}</strong>
                            <span className="muted">
                              {formatEta(r.expires_at) || "Open"}
                              {r.target_mode === "TARGETED" ? " · Sent to you" : ""}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link className="provider-board-more" to="/provider/requests">
                    All requests
                  </Link>
                </article>
                <article className="dash-surface provider-board-col">
                  <div className="provider-board-col-head">
                    <h4>Waiting on customer</h4>
                    <span>{overviewDash.waitingQuotes.length}</span>
                  </div>
                  {overviewDash.waitingQuotes.length === 0 ? (
                    <p className="muted provider-board-empty">No pending quotes.</p>
                  ) : (
                    <ul>
                      {overviewDash.waitingQuotes.slice(0, 4).map((q) => (
                        <li key={q.id}>
                          <Link to="/provider/quotes">
                            <strong>{q.request_title || "Quote"}</strong>
                            <span className="muted">{formatInr(q.price_quote)}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link className="provider-board-more" to="/provider/quotes">
                    All quotes
                  </Link>
                </article>
                <article className="dash-surface provider-board-col">
                  <div className="provider-board-col-head">
                    <h4>Do the job</h4>
                    <span>{overviewDash.activeJobs.length}</span>
                  </div>
                  {overviewDash.activeJobs.length === 0 ? (
                    <p className="muted provider-board-empty">No active jobs.</p>
                  ) : (
                    <ul>
                      {overviewDash.activeJobs.slice(0, 4).map((o) => (
                        <li key={o.id}>
                          <Link to="/provider/orders">
                            <strong>{o.request_title || "Order"}</strong>
                            <span className="muted">
                              {o.status === "IN_PROGRESS" ? "In progress" : "Confirmed"} ·{" "}
                              {formatInr(o.agreed_price)}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link className="provider-board-more" to="/provider/orders">
                    All orders
                  </Link>
                </article>
                <article className="dash-surface provider-board-col">
                  <div className="provider-board-col-head">
                    <h4>Unread chats</h4>
                    <span>{overviewDash.unreadChats.length}</span>
                  </div>
                  {overviewDash.unreadChats.length === 0 ? (
                    <p className="muted provider-board-empty">No unread messages.</p>
                  ) : (
                    <ul>
                      {overviewDash.unreadChats.slice(0, 4).map((c) => (
                        <li key={c.id}>
                          <button type="button" onClick={() => {
                            setActiveChatId(c.id);
                            setActiveChatTitle(c.consumer_name || "Inquiry");
                          }}>
                            <strong>{c.consumer_name || "Customer"}</strong>
                            <span className="muted">
                              {c.unread_count} new
                              {c.last_message ? ` · ${c.last_message}` : ""}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              </div>
            </section>
          )}

          {!isLimited && overviewDash.expiringLeads.length > 0 && (
            <section className="dash-surface provider-expire" aria-label="Leads about to expire">
              <div className="provider-expire-head">
                <div>
                  <p className="dash-eyebrow">Urgent</p>
                  <h3>Leads expiring soon</h3>
                </div>
                <Link to="/provider/requests">Open requests</Link>
              </div>
              <ul>
                {overviewDash.expiringLeads.slice(0, 4).map((r) => (
                  <li key={r.id}>
                    <strong>{r.title}</strong>
                    <span>{formatEta(r.expires_at)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!isLimited && (
            <section className="provider-overview-kpis provider-overview-kpis-4" aria-label="Quote and earnings">
              <Link className="dash-surface provider-overview-kpi is-link" to="/provider/quotes">
                <span className="dash-kpi-label">Quote health</span>
                <strong>
                  {overviewDash.winRate != null ? `${overviewDash.winRate}%` : "—"}
                </strong>
                <span className="provider-overview-kpi-sub">
                  {overviewDash.pending} pending · {overviewDash.accepted} won · {overviewDash.rejected} lost
                </span>
              </Link>
              <div className="dash-surface provider-overview-kpi">
                <span className="dash-kpi-label">Earned this week</span>
                <strong>{formatInr(overviewDash.weekEarn)}</strong>
                <span className="provider-overview-kpi-sub">Completed jobs, last 7 days</span>
              </div>
              <div className="dash-surface provider-overview-kpi">
                <span className="dash-kpi-label">Earned this month</span>
                <strong>{formatInr(overviewDash.monthEarn)}</strong>
                <span className="provider-overview-kpi-sub">
                  {overviewDash.completedCount} completed all time
                </span>
              </div>
              <Link className="dash-surface provider-overview-kpi is-link accent" to="/provider/requests">
                <span className="dash-kpi-label">Open leads</span>
                <strong>{overviewDash.quoteThese.length}</strong>
                <span className="provider-overview-kpi-sub">Requests still to quote</span>
              </Link>
            </section>
          )}

          <section className="provider-overview-split">
            <article className="dash-surface provider-complete">
              <div className="provider-complete-head">
                <div>
                  <p className="dash-eyebrow">Profile</p>
                  <h3>Completeness</h3>
                </div>
                <strong>
                  {overviewDash.checksDone}/{overviewDash.checks.length}
                </strong>
              </div>
              <ul className="provider-check-list">
                {overviewDash.checks.map((item) => (
                  <li key={item.id} className={item.ok ? "is-done" : ""}>
                    <Link to={item.ok && item.id === "public" ? item.to : "/profile"}>
                      <span className="provider-check-mark" aria-hidden="true">
                        {item.ok ? "✓" : "○"}
                      </span>
                      <span>{item.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </article>
            {!isLimited && (
              <article className="dash-surface provider-mix">
                <p className="dash-eyebrow">Last 30 days</p>
                <h3>Category mix</h3>
                {overviewDash.mix.length === 0 ? (
                  <p className="muted">No recent requests or jobs in your categories yet.</p>
                ) : (
                  <ul>
                    {overviewDash.mix.map(([label, count]) => (
                      <li key={label}>
                        <div className="provider-mix-row">
                          <span>{label}</span>
                          <strong>{count}</strong>
                        </div>
                        <span
                          className="provider-mix-bar"
                          style={{ width: `${Math.max(8, (count / overviewDash.mixTotal) * 100)}%` }}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            )}
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
          {activeChatId && (
            <InquiryChatPanel
              conversationId={activeChatId}
              mode="overlay"
              title={activeChatTitle}
              subtitle="Inquiry chat"
              avatarLabel={activeChatTitle}
              autoFocus
              emptyHint="Reply to the customer."
              placeholder="Write a message…"
              onClose={() => setActiveChatId(null)}
              onMessagesLoaded={() => {
                void loadConversations();
                void refreshInquiryUnread();
              }}
            />
          )}
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
                onMessagesLoaded={() => {
                  void loadConversations();
                  void refreshInquiryUnread();
                }}
              />
            )}
            <div className="page-list list">
              {feed.length === 0 && <p className="page-empty">No matching active requests.</p>}
              {feed.map((r) => {
                const unread =
                  conversations.find((c) => c.consumer_id === r.consumer_id)?.unread_count || 0;
                return (
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
                      className="btn secondary provider-quote-chat-btn"
                      type="button"
                      aria-label={
                        unread > 0
                          ? `Chat about request, ${unread} unread`
                          : "Chat & ask"
                      }
                      onClick={() => void chatAboutRequest(r)}
                    >
                      Chat & ask
                      {unread > 0 && (
                        <span className="nav-badge provider-quote-chat-badge">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </button>
                    <button className="btn" type="button" onClick={() => setQuoteTarget(r)}>
                      Send quote
                    </button>
                  </div>
                </div>
              );
              })}
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
                    { id: "rejected", label: "Rejected" },
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
                onMessagesLoaded={() => {
                  void loadConversations();
                  void refreshInquiryUnread();
                }}
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
                    linkedOrder.status !== "CANCELLED" &&
                    linkedOrder.status !== "REJECTED";
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
                                  {linkedOrder.status === "REJECTED"
                                    ? "Rejected"
                                    : linkedOrder.status.replaceAll("_", " ")}
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
                            linkedOrder.status === "REJECTED" ? (
                              <span className="muted">Consumer chose another quote</span>
                            ) : (
                              <Link className="provider-sent-quote-order-link" to={`/orders/${linkedOrder.id}`}>
                                Open order
                              </Link>
                            )
                          ) : q.status === "REJECTED" ? (
                            <span className="muted">Consumer chose another quote</span>
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
            <p className="page-lead">
              Accepted deals, rejected quotes, expired requests, and completion status.
            </p>
            <StatusFilterSelect
              label="Filter by status"
              value={orderStatusFilter}
              options={ORDER_STATUS_FILTERS.map((opt) => ({
                ...opt,
                count: orderStatusFilterCounts[opt.id],
              }))}
              onChange={setOrderStatusFilter}
            />
          </header>
          <section className="page-panel">
            <div className="page-list list">
              {completeOrdersFeed.length === 0 && <p className="page-empty">No orders yet.</p>}
              {completeOrdersFeed.length > 0 && filteredOrders.length === 0 && (
                <p className="page-empty">No orders in this status.</p>
              )}
              {filteredOrders.map((item) => {
                if (item.kind === "expired_request") {
                  const q = item.quote;
                  return (
                    <div key={`expired-${q.id}`} className="list-item provider-order-row">
                      <div className="provider-sent-quote-head">
                        <div className="provider-sent-quote-main">
                          <strong>₹{Number(q.price_quote).toLocaleString("en-IN")}</strong>
                          <span className="pill request-status expired">Expired</span>
                        </div>
                      </div>
                      <div className="muted" style={{ fontSize: "0.85rem" }}>
                        {q.request_title ? `${q.request_title} · ` : ""}
                        Request expired with no locked deal
                        {" · "}
                        {new Date(q.created_at).toLocaleString()}
                      </div>
                    </div>
                  );
                }
                const o = item.order;
                const statusKey = o.status.toLowerCase();
                const isRejected = o.status === "REJECTED";
                return (
                  <div key={o.id} className="list-item provider-order-row">
                    <div className="provider-sent-quote-head">
                      <div className="provider-sent-quote-main">
                        <strong>₹{Number(o.agreed_price).toLocaleString("en-IN")}</strong>
                        <span className={`pill order-status ${statusKey}`}>
                          {orderStatusLabel(o.status)}
                        </span>
                      </div>
                      {!isRejected && (
                        <Link className="btn secondary btn-sm" to={`/orders/${o.id}`}>
                          Open
                        </Link>
                      )}
                    </div>
                    <div className="muted" style={{ fontSize: "0.85rem" }}>
                      {o.request_title ? `${o.request_title} · ` : ""}
                      {isRejected
                        ? "Consumer accepted another provider’s quote"
                        : `${o.fulfillment_type.replaceAll("_", " ")}${
                            o.payment_mode ? ` · ${o.payment_mode.replaceAll("_", " ")}` : ""
                          }`}
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
