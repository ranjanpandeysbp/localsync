import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { AttachmentGallery, FilePicker } from "../components/Attachments";
import { CategorySearchBox } from "../components/CategorySearchBox";
import { CitySearchBox } from "../components/CitySearchBox";
import { InquiryChatPanel } from "../components/InquiryChat";
import { MapsLink } from "../components/MapsLink";
import { PostRequestModal } from "../components/PostRequestModal";
import { ProfileCard } from "../components/ProfileCard";
import { StatusFilterSelect } from "../components/StatusFilterSelect";
import { flattenCategoryOptions } from "../components/ProviderTrust";
import { useWebSocket } from "../hooks/useWebSocket";
import { api } from "../services/api";
import { useAuth } from "../store/auth";
import { useConsumerNav } from "../store/consumerNav";
import { playQuoteBell } from "../services/sounds";
import { uploadFiles } from "../services/uploads";
import {
  clearPostRequestDraft,
  readPostRequestDraft,
  type PostRequestDraft,
} from "../utils/postRequestDraft";
import {
  findServiceCityByName,
  readSavedServiceCity,
  saveServiceCity,
} from "../utils/serviceCities";
import type {
  CategoryTree,
  Conversation,
  Order,
  Quote,
  ServiceRequest,
} from "../types";

type ConsumerSection =
  | "details"
  | "requests"
  | "post"
  | "inquiries"
  | "quotes"
  | "orders";

const SECTIONS: ConsumerSection[] = [
  "details",
  "requests",
  "post",
  "inquiries",
  "quotes",
  "orders",
];

const TITLES: Record<ConsumerSection, string> = {
  details: "My Account",
  requests: "My requests",
  post: "Broadcast request",
  inquiries: "Recent inquiries",
  quotes: "Received Quotes",
  orders: "Orders",
};

type ConsumerOrderFilter =
  | "all"
  | "CONFIRMED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "DISPUTED"
  | "CANCELLED_REQUEST"
  | "EXPIRED_REQUEST";

const CONSUMER_ORDER_FILTERS: { id: ConsumerOrderFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "CONFIRMED", label: "Confirmed" },
  { id: "IN_PROGRESS", label: "In progress" },
  { id: "COMPLETED", label: "Completed" },
  { id: "CANCELLED", label: "Cancelled" },
  { id: "DISPUTED", label: "Disputed" },
  { id: "CANCELLED_REQUEST", label: "Cancelled request" },
  { id: "EXPIRED_REQUEST", label: "Expired" },
];

export function ConsumerDashboard() {
  const { section } = useParams<{ section?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const tab = (
    section && SECTIONS.includes(section as ConsumerSection) ? section : "details"
  ) as ConsumerSection;
  const invalidSection = !!section && !SECTIONS.includes(section as ConsumerSection);

  const user = useAuth((s) => s.user);
  const refreshQuotesChatUnread = useConsumerNav((s) => s.refreshQuotesChatUnread);
  const bumpQuotesChatUnread = useConsumerNav((s) => s.bumpQuotesChatUnread);
  const refreshReceivedQuotesUnread = useConsumerNav((s) => s.refreshReceivedQuotesUnread);
  const markReceivedQuotesSeen = useConsumerNav((s) => s.markReceivedQuotesSeen);
  const [tree, setTree] = useState<CategoryTree[]>([]);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [receivedQuotes, setReceivedQuotes] = useState<Quote[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeChatTitle, setActiveChatTitle] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [requestSearch, setRequestSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState<ConsumerOrderFilter>("all");
  const [closingRequestId, setClosingRequestId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{
    id: string;
    title: string;
    quoteCount: number;
  } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelNotice, setCancelNotice] = useState<string | null>(null);
  const [simpleCancelTarget, setSimpleCancelTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [deleteChatTarget, setDeleteChatTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const [form, setForm] = useState({
    category_id: "",
    title: "",
    description: "",
    longitude: "",
    latitude: "",
    target_mode: "broadcast" as "broadcast" | "selected",
  });
  const [broadcastCity, setBroadcastCity] = useState(
    () => readSavedServiceCity()?.name || "",
  );
  const [postModalOpen, setPostModalOpen] = useState(false);
  const [postDraft, setPostDraft] = useState<PostRequestDraft | null>(null);
  const categoryOptions = useMemo(() => flattenCategoryOptions(tree), [tree]);
  const selectedBroadcastCity = useMemo(
    () => findServiceCityByName(broadcastCity),
    [broadcastCity],
  );

    const { connected } = useWebSocket((msg) => {
    const m = msg as {
      type?: string;
      payload?: Quote & {
        conversation_id?: string;
        request_id?: string;
        provider_id?: string;
        order_id?: string;
      };
    };
    if (m.type === "new_quote") {
      void playQuoteBell();
      setToast(`New quote: ₹${m.payload?.price_quote}`);
      void refresh();
      if (tab === "quotes") {
        void markReceivedQuotesSeen();
      } else {
        void refreshReceivedQuotesUnread();
      }
    }
    if (m.type === "quote_updated") {
      setToast(`Quote updated: ₹${m.payload?.price_quote}`);
      void refresh();
      if (tab === "quotes") {
        void markReceivedQuotesSeen();
      } else {
        void refreshReceivedQuotesUnread();
      }
    }
    if (m.type === "inquiry_message") {
      setToast("New reply from a provider");
      void loadConversations();
      if (tab === "inquiries" || tab === "quotes") {
        void refreshQuotesChatUnread();
      } else {
        bumpQuotesChatUnread(1);
      }
    }
    if (m.type === "order_confirmed") {
      const requestId = m.payload?.request_id;
      if (requestId) {
        setRequests((prev) =>
          prev.map((r) => (r.id === requestId ? { ...r, status: "FULFILLED" } : r)),
        );
      }
      void refresh();
    }
    if (m.type === "request_expired") {
      void refresh();
    }
    if (m.type === "order_completed" || m.type === "conversation_reset") {
      if (m.type === "order_completed") {
        setToast("Order completed");
      }
      const closedId = m.payload?.conversation_id;
      const closedProviderId = m.payload?.provider_id;
      setConversations((prev) =>
        prev.filter((c) => {
          if (closedId && c.id === closedId) return false;
          if (closedProviderId && c.provider_id === closedProviderId) return false;
          return true;
        }),
      );
      setActiveChatId((current) => {
        if (!current) return null;
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
        void refreshQuotesChatUnread();
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

  async function refresh() {
    const [cats, reqs, ords, quotes] = await Promise.all([
      api.get<CategoryTree[]>("/categories/tree"),
      api.get<ServiceRequest[]>("/requests/mine"),
      api.get<Order[]>("/orders/mine"),
      api.get<Quote[]>("/quotes/received"),
    ]);
    setTree(cats.data);
    setRequests(reqs.data);
    setOrders(ords.data);
    setReceivedQuotes(quotes.data);
    if (tab === "quotes") {
      void markReceivedQuotesSeen();
    } else {
      void refreshReceivedQuotesUnread();
    }
    const opts = flattenCategoryOptions(cats.data);
    if (opts[0]) {
      setForm((f) => ({
        ...f,
        category_id: f.category_id || String(opts[0].id),
      }));
    }
    await loadConversations();
    void refreshQuotesChatUnread();
  }

  useEffect(() => {
    if (!invalidSection) void refresh();
  }, [tab, invalidSection]);

  useEffect(() => {
    const state = location.state as { toast?: string; providerIds?: string[] } | null;
    if (state?.toast) {
      setToast(state.toast);
      navigate(location.pathname, { replace: true, state: null });
      return;
    }
    const fromState = (location.state as PostRequestDraft | null) || null;
    const draft = fromState?.providerIds?.length ? fromState : readPostRequestDraft();
    if (!draft?.providerIds?.length) return;
    clearPostRequestDraft();
    setPostDraft(draft);
    setPostModalOpen(true);
    if (fromState) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    if (tab !== "post") return;
    const saved = readSavedServiceCity();
    if (!saved) return;
    setBroadcastCity(saved.name);
    setForm((f) => ({
      ...f,
      latitude: String(saved.latitude),
      longitude: String(saved.longitude),
    }));
  }, [tab]);

  useEffect(() => {
    if (user?.latitude != null && user?.longitude != null && !readSavedServiceCity()) {
      setForm((f) => ({
        ...f,
        latitude: String(user.latitude),
        longitude: String(user.longitude),
      }));
    }
  }, [user?.latitude, user?.longitude]);

  function onBroadcastCityChange(name: string) {
    setBroadcastCity(name);
    const city = findServiceCityByName(name);
    if (!city) {
      setForm((f) => ({ ...f, latitude: "", longitude: "" }));
      return;
    }
    saveServiceCity(city);
    setForm((f) => ({
      ...f,
      latitude: String(city.latitude),
      longitude: String(city.longitude),
    }));
  }

  const categoryNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const opt of flattenCategoryOptions(tree)) {
      map.set(opt.id, opt.label);
    }
    return map;
  }, [tree]);

  const activeRequests = useMemo(() => {
    // My requests = open work only. Fulfilled deals live under Orders / request quotes.
    const lockedRequestIds = new Set<string>([
      ...orders.map((o) => o.request_id),
      ...receivedQuotes.filter((q) => q.status === "ACCEPTED").map((q) => q.request_id),
    ]);
    return requests.filter(
      (r) => r.status === "ACTIVE" && !lockedRequestIds.has(r.id),
    );
  }, [requests, orders, receivedQuotes]);

  const filteredRequests = useMemo(() => {
    const q = requestSearch.trim().toLowerCase();
    return activeRequests.filter((r) => {
      if (!q) return true;
      const category = categoryNameById.get(r.category_id) || "";
      const haystack = [r.title, r.description, category, r.request_pincode || ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [activeRequests, requestSearch, categoryNameById]);

  const completeOrdersFeed = useMemo(() => {
    const orderItems = orders.map((o) => ({
      kind: "order" as const,
      id: o.id,
      sortAt: o.completed_at || o.created_at,
      order: o,
    }));
    const cancelledItems = requests
      .filter((r) => r.status === "CANCELLED")
      .map((r) => ({
        kind: "cancelled_request" as const,
        id: r.id,
        sortAt: r.created_at,
        request: r,
        quoteCount: receivedQuotes.filter((q) => q.request_id === r.id).length,
      }));
    const expiredItems = requests
      .filter((r) => r.status === "EXPIRED")
      .map((r) => ({
        kind: "expired_request" as const,
        id: r.id,
        sortAt: r.expires_at || r.created_at,
        request: r,
        quoteCount: receivedQuotes.filter((q) => q.request_id === r.id).length,
      }));
    return [...orderItems, ...cancelledItems, ...expiredItems].sort(
      (a, b) => new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime(),
    );
  }, [orders, requests, receivedQuotes]);

  const consumerOrderFilterCounts = useMemo(() => {
    const counts: Record<ConsumerOrderFilter, number> = {
      all: completeOrdersFeed.length,
      CONFIRMED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      CANCELLED: 0,
      DISPUTED: 0,
      CANCELLED_REQUEST: 0,
      EXPIRED_REQUEST: 0,
    };
    for (const item of completeOrdersFeed) {
      if (item.kind === "cancelled_request") {
        counts.CANCELLED_REQUEST += 1;
      } else if (item.kind === "expired_request") {
        counts.EXPIRED_REQUEST += 1;
      } else if (item.order.status in counts) {
        counts[item.order.status as Exclude<ConsumerOrderFilter, "all" | "CANCELLED_REQUEST" | "EXPIRED_REQUEST">] += 1;
      }
    }
    return counts;
  }, [completeOrdersFeed]);

  const filteredOrdersFeed = useMemo(() => {
    if (orderStatusFilter === "all") return completeOrdersFeed;
    if (orderStatusFilter === "CANCELLED_REQUEST") {
      return completeOrdersFeed.filter((item) => item.kind === "cancelled_request");
    }
    if (orderStatusFilter === "EXPIRED_REQUEST") {
      return completeOrdersFeed.filter((item) => item.kind === "expired_request");
    }
    return completeOrdersFeed.filter(
      (item) => item.kind === "order" && item.order.status === orderStatusFilter,
    );
  }, [completeOrdersFeed, orderStatusFilter]);

  if (invalidSection) {
    return <Navigate to="/consumer/details" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (!form.category_id) {
        setToast("Pick a category first");
        setBusy(false);
        return;
      }
      const city = findServiceCityByName(broadcastCity);
      if (!city) {
        setToast("Select a city to broadcast");
        setBusy(false);
        return;
      }
      const uploaded = await uploadFiles(files);
      const { data } = await api.post<ServiceRequest>("/requests", {
        category_id: Number(form.category_id),
        title: form.title,
        description: form.description,
        longitude: city.longitude,
        latitude: city.latitude,
        pincode: city.pincode,
        attachment_ids: uploaded.map((a) => a.id),
        target_provider_ids: [],
      });
      setToast(
        `Request broadcast to ${data.matched_provider_count ?? 0} nearby providers in ${city.name}` +
          (uploaded.length ? ` · ${uploaded.length} file(s)` : ""),
      );
      setForm((f) => ({ ...f, title: "", description: "" }));
      setFiles([]);
      await refresh();
      navigate("/consumer/requests");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed to create request";
      setToast(String(msg));
    } finally {
      setBusy(false);
    }
  }

  async function submitCancelRequest(
    requestId: string,
    opts?: { reason?: string; title?: string; notifyProviders?: boolean },
  ) {
    setClosingRequestId(requestId);
    try {
      const { data } = await api.post<ServiceRequest>(`/requests/${requestId}/close`, {
        reason: opts?.reason?.trim() || null,
      });
      setRequests((prev) => prev.map((r) => (r.id === requestId ? data : r)));
      setReceivedQuotes((prev) =>
        prev.map((q) =>
          q.request_id === requestId && q.status === "PENDING"
            ? { ...q, status: "WITHDRAWN" }
            : q,
        ),
      );
      setCancelTarget(null);
      setCancelReason("");
      setSimpleCancelTarget(null);
      if (opts?.notifyProviders) {
        setToast("Request cancelled — providers were notified");
      } else {
        setCancelNotice(
          opts?.title
            ? `“${opts.title}” was cancelled and moved to Orders.`
            : "Request cancelled and moved to Orders.",
        );
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Could not cancel request";
      setToast(String(msg));
    } finally {
      setClosingRequestId(null);
    }
  }

  function beginCancelRequest(requestId: string, title: string, pendingQuoteCount: number) {
    if (pendingQuoteCount > 0) {
      setCancelTarget({ id: requestId, title, quoteCount: pendingQuoteCount });
      setCancelReason("");
      return;
    }
    setSimpleCancelTarget({ id: requestId, title });
  }

  async function confirmSimpleCancel() {
    if (!simpleCancelTarget) return;
    await submitCancelRequest(simpleCancelTarget.id, { title: simpleCancelTarget.title });
  }

  async function deleteConversation(conversationId: string) {
    setDeletingChatId(conversationId);
    try {
      await api.delete(`/conversations/${conversationId}`);
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      if (activeChatId === conversationId) {
        setActiveChatId(null);
        setActiveChatTitle("");
      }
      setDeleteChatTarget(null);
      setToast("Chat deleted");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Could not delete chat";
      setToast(String(msg));
    } finally {
      setDeletingChatId(null);
    }
  }

  async function confirmCancelWithReason() {
    if (!cancelTarget) return;
    const reason = cancelReason.trim();
    if (!reason) {
      setToast("Please enter a reason for the providers");
      return;
    }
    await submitCancelRequest(cancelTarget.id, {
      reason,
      title: cancelTarget.title,
      notifyProviders: true,
    });
  }

  return (
    <AppShell title={TITLES[tab]} connected={connected} onRefresh={refresh}>
      {toast && (
        <div className="toast" onClick={() => setToast("")}>
          {toast}
        </div>
      )}

      <PostRequestModal
        open={postModalOpen}
        draft={postDraft}
        onClose={() => {
          setPostModalOpen(false);
          setPostDraft(null);
        }}
        onSuccess={() => {
          setPostDraft(null);
          void refresh();
        }}
      />

      {simpleCancelTarget &&
        createPortal(
          <div
            className="modal-backdrop consumer-cancel-popup-backdrop"
            onClick={() => {
              if (closingRequestId) return;
              setSimpleCancelTarget(null);
            }}
            role="presentation"
          >
            <div
              className="modal-dialog card consumer-cancel-popup"
              role="dialog"
              aria-modal="true"
              aria-labelledby="consumer-simple-cancel-title"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="dash-eyebrow">Cancel request</p>
              <h3 id="consumer-simple-cancel-title">Cancel this request?</h3>
              <p className="consumer-cancel-popup-copy">
                “{simpleCancelTarget.title}” has no quotes yet. You can cancel it now.
              </p>
              <div className="consumer-cancel-popup-actions">
                <button
                  className="btn secondary"
                  type="button"
                  disabled={closingRequestId === simpleCancelTarget.id}
                  onClick={() => setSimpleCancelTarget(null)}
                >
                  Keep request
                </button>
                <button
                  className="btn consumer-request-close"
                  type="button"
                  disabled={closingRequestId === simpleCancelTarget.id}
                  onClick={() => void confirmSimpleCancel()}
                >
                  {closingRequestId === simpleCancelTarget.id ? "Cancelling…" : "Cancel request"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {cancelTarget &&
        createPortal(
          <div
            className="modal-backdrop consumer-cancel-popup-backdrop"
            onClick={() => {
              if (closingRequestId) return;
              setCancelTarget(null);
              setCancelReason("");
            }}
            role="presentation"
          >
            <div
              className="modal-dialog card consumer-cancel-popup"
              role="dialog"
              aria-modal="true"
              aria-labelledby="consumer-cancel-popup-title"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="dash-eyebrow">Cancel request</p>
              <h3 id="consumer-cancel-popup-title">There are active quotes</h3>
              <p className="consumer-cancel-popup-copy">
                “{cancelTarget.title}” has {cancelTarget.quoteCount} active quote
                {cancelTarget.quoteCount === 1 ? "" : "s"}. Add a reason and we’ll notify those
                providers.
              </p>
              <div className="field">
                <label htmlFor="cancel-reason">Reason for providers</label>
                <textarea
                  id="cancel-reason"
                  rows={4}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Explain why you’re cancelling…"
                  disabled={closingRequestId === cancelTarget.id}
                  maxLength={1000}
                />
              </div>
              <div className="consumer-cancel-popup-actions">
                <button
                  className="btn secondary"
                  type="button"
                  disabled={closingRequestId === cancelTarget.id}
                  onClick={() => {
                    setCancelTarget(null);
                    setCancelReason("");
                  }}
                >
                  Keep request
                </button>
                <button
                  className="btn consumer-request-close"
                  type="button"
                  disabled={closingRequestId === cancelTarget.id || !cancelReason.trim()}
                  onClick={() => void confirmCancelWithReason()}
                >
                  {closingRequestId === cancelTarget.id ? "Cancelling…" : "Cancel request"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {cancelNotice &&
        createPortal(
          <div
            className="modal-backdrop consumer-cancel-popup-backdrop"
            onClick={() => setCancelNotice(null)}
            role="presentation"
          >
            <div
              className="modal-dialog card consumer-cancel-popup consumer-cancel-popup-success"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="consumer-cancel-notice-title"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="dash-eyebrow">Action complete</p>
              <h3 id="consumer-cancel-notice-title">Request cancelled</h3>
              <p className="consumer-cancel-popup-copy">{cancelNotice}</p>
              <div className="consumer-cancel-popup-actions">
                <button className="btn" type="button" onClick={() => setCancelNotice(null)}>
                  OK
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {deleteChatTarget &&
        createPortal(
          <div
            className="modal-backdrop consumer-cancel-popup-backdrop"
            onClick={() => {
              if (deletingChatId) return;
              setDeleteChatTarget(null);
            }}
            role="presentation"
          >
            <div
              className="modal-dialog card consumer-cancel-popup"
              role="dialog"
              aria-modal="true"
              aria-labelledby="consumer-delete-chat-title"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="dash-eyebrow">Delete chat</p>
              <h3 id="consumer-delete-chat-title">Delete this chat?</h3>
              <p className="consumer-cancel-popup-copy">
                “{deleteChatTarget.title}” will be removed from Recent inquiries. This cannot be
                undone.
              </p>
              <div className="consumer-cancel-popup-actions">
                <button
                  className="btn secondary"
                  type="button"
                  disabled={deletingChatId === deleteChatTarget.id}
                  onClick={() => setDeleteChatTarget(null)}
                >
                  Keep chat
                </button>
                <button
                  className="btn consumer-request-close"
                  type="button"
                  disabled={deletingChatId === deleteChatTarget.id}
                  onClick={() => void deleteConversation(deleteChatTarget.id)}
                >
                  {deletingChatId === deleteChatTarget.id ? "Deleting…" : "Delete chat"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {tab === "details" && <ProfileCard title="My Account" />}

      {tab === "inquiries" && (
        <div className="consumer-inquiries">
          <section className="page-hero consumer-inquiries-hero">
            <div className="consumer-inquiries-hero-top">
              <div>
                <p className="dash-eyebrow">Messages</p>
                <h2>Recent inquiries</h2>
                <p className="page-lead">
                  Chats with providers from the last 30 days.
                </p>
              </div>
              {!activeChatId && (
                <span className="consumer-inquiries-total">
                  <strong>{conversations.length}</strong>
                  chat{conversations.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
          </section>

          {activeChatId ? (
            <section className="consumer-inquiries-chat-shell">
              <div className="consumer-inquiries-chat-bar">
                <button
                  type="button"
                  className="btn secondary btn-with-icon consumer-inquiries-back"
                  onClick={() => {
                    setActiveChatId(null);
                    setActiveChatTitle("");
                    void loadConversations();
                    void refreshQuotesChatUnread();
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.25"
                    aria-hidden="true"
                  >
                    <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  All chats
                </button>
              </div>
              <InquiryChatPanel
                conversationId={activeChatId}
                mode="inline"
                title={activeChatTitle}
                subtitle="Inquiry chat"
                avatarLabel={activeChatTitle}
                statusLabel={
                  conversations.find((c) => c.id === activeChatId)?.provider_is_online
                    ? "Online"
                    : "Offline"
                }
                statusTone={
                  conversations.find((c) => c.id === activeChatId)?.provider_is_online
                    ? "online"
                    : "offline"
                }
                autoFocus
                emptyHint="Continue the conversation with this provider."
                placeholder="Write a message…"
                onClose={() => {
                  setActiveChatId(null);
                  setActiveChatTitle("");
                  void loadConversations();
                  void refreshQuotesChatUnread();
                }}
                onMessagesLoaded={() => {
                  void loadConversations();
                  void refreshQuotesChatUnread();
                }}
              />
            </section>
          ) : conversations.length === 0 ? (
            <div className="dash-surface consumer-requests-empty">
              <h3>No recent inquiries</h3>
              <p className="muted">
                Start a chat from Home search results or from a received quote.
              </p>
              <Link className="btn" to="/">
                Browse providers
              </Link>
            </div>
          ) : (
            <div className="consumer-inquiries-list">
              {conversations.map((c) => {
                const title = c.provider_business_name || c.provider_name || "Provider";
                const initial = title.trim().slice(0, 1).toUpperCase() || "P";
                const unread = c.unread_count || 0;
                const online = Boolean(c.provider_is_online);
                return (
                  <article
                    key={c.id}
                    className={`consumer-inquiry-card${unread > 0 ? " has-unread" : ""}`}
                  >
                    <div className="consumer-inquiry-card-accent" aria-hidden="true" />
                    <div className="consumer-inquiry-card-body">
                      <button
                        type="button"
                        className="consumer-inquiry-main"
                        onClick={() => {
                          setActiveChatId(c.id);
                          setActiveChatTitle(title);
                        }}
                      >
                        <span className="consumer-inquiry-mark" aria-hidden="true">
                          {initial}
                          {unread > 0 && <span className="consumer-inquiry-mark-dot" />}
                        </span>
                        <span className="consumer-inquiry-copy">
                          <span className="consumer-inquiry-topline">
                            <strong className="consumer-inquiry-name">{title}</strong>
                            <span className={`pill ${online ? "online" : "offline"}`}>
                              {online ? "Online" : "Offline"}
                            </span>
                            {unread > 0 && (
                              <span className="nav-badge" aria-label={`${unread} unread`}>
                                {unread > 99 ? "99+" : unread}
                              </span>
                            )}
                          </span>
                          {c.provider_name &&
                            c.provider_business_name &&
                            c.provider_name !== c.provider_business_name && (
                              <span className="muted consumer-inquiry-owner">
                                {c.provider_name}
                              </span>
                            )}
                          <span
                            className={`consumer-inquiry-preview${unread > 0 ? " is-unread" : ""}`}
                          >
                            {c.last_message || "No messages yet"}
                          </span>
                          <time className="muted consumer-inquiry-time" dateTime={c.updated_at}>
                            {new Date(c.updated_at).toLocaleString()}
                          </time>
                        </span>
                      </button>
                      <div className="consumer-inquiry-actions">
                        <button
                          className="btn"
                          type="button"
                          onClick={() => {
                            setActiveChatId(c.id);
                            setActiveChatTitle(title);
                          }}
                        >
                          {unread > 0 ? "Read" : "Open"}
                        </button>
                        <button
                          className="btn secondary consumer-request-close"
                          type="button"
                          onClick={() =>
                            setDeleteChatTarget({
                              id: c.id,
                              title: title === "Provider" ? "this chat" : title,
                            })
                          }
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "post" && (
        <div className="page-stack narrow post-request">
          <header className="page-hero">
            <p className="dash-eyebrow">Requests</p>
            <h2>Broadcast request</h2>
            <p className="page-lead">
              Choose a category, describe what you need, and notify nearby verified providers in that
              category.
            </p>
          </header>
          <form className="page-panel page-form post-request-form" onSubmit={onSubmit}>
            <section className="post-request-step">
              <h3>1. Category</h3>
              <p className="muted post-request-hint">
                Search and pick the category your request is about. Nearby providers in this category
                will see it when you broadcast.
              </p>
              <div className="field">
                <label>Find a category</label>
                <CategorySearchBox
                  options={categoryOptions}
                  value={form.category_id}
                  onChange={(id) => setForm({ ...form, category_id: id, target_mode: "broadcast" })}
                  placeholder="e.g. Plumbing, Cleaning, Electrician…"
                  required
                />
              </div>
              {form.category_id && (
                <p className="post-request-category-pill">
                  Broadcasting in{" "}
                  <strong>
                    {categoryOptions.find((c) => String(c.id) === form.category_id)?.label ||
                      "selected category"}
                  </strong>
                </p>
              )}
            </section>

            <section className="post-request-step">
              <h3>2. Your request</h3>
              <div className="field">
                <label>Title</label>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Leaking kitchen sink"
                />
              </div>
              <div className="field">
                <label>Details</label>
                <textarea
                  required
                  rows={4}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Describe the work, timing, and anything providers should know…"
                />
              </div>
              <FilePicker files={files} onChange={setFiles} disabled={busy} />
            </section>

            <section className="post-request-step post-request-location">
              <h3>3. Location</h3>
              <div className="field">
                <label htmlFor="broadcast-search-city">Search City</label>
                <CitySearchBox
                  id="broadcast-search-city"
                  value={broadcastCity}
                  onChange={onBroadcastCityChange}
                  placeholder="Search city…"
                />
                <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
                  Defaults to the city from Home. Click to search or pick from the list.
                </p>
              </div>
              {selectedBroadcastCity ? (
                <div className="post-request-location-card">
                  <p>
                    Broadcasting near <strong>{selectedBroadcastCity.name}</strong>
                    {selectedBroadcastCity.pincode
                      ? ` · pincode ${selectedBroadcastCity.pincode}`
                      : ""}
                    .
                  </p>
                  <p className="muted">
                    Nearby verified providers in {selectedBroadcastCity.name} will be notified.
                  </p>
                  <MapsLink
                    latitude={selectedBroadcastCity.latitude}
                    longitude={selectedBroadcastCity.longitude}
                    label={selectedBroadcastCity.name}
                  />
                </div>
              ) : (
                <p className="muted">Select a city to match nearby providers.</p>
              )}
            </section>

            <div className="page-actions post-request-actions">
              <button
                className="btn"
                type="submit"
                disabled={busy || !form.category_id || !selectedBroadcastCity}
              >
                {busy ? "Sending…" : "Broadcast request"}
              </button>
            </div>
          </form>
        </div>
      )}

      {tab === "requests" && (
        <div className="consumer-requests">
          <header className="page-hero consumer-requests-hero">
            <div className="consumer-requests-hero-top">
              <div>
                <p className="dash-eyebrow">Consumer</p>
                <h2>My requests</h2>
                <p className="page-lead">
                  Track your open jobs and review quotes from providers.
                </p>
              </div>
              <Link className="btn btn-with-icon" to="/consumer/post">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.25"
                  aria-hidden="true"
                >
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
                Broadcast request
              </Link>
            </div>

            <div className="consumer-requests-tools">
              <div className="consumer-requests-search-row">
                <div className="field consumer-requests-search">
                  <label htmlFor="request-search">Search</label>
                  <input
                    id="request-search"
                    type="search"
                    value={requestSearch}
                    placeholder="Search by title, description, category…"
                    onChange={(e) => setRequestSearch(e.target.value)}
                    autoComplete="off"
                  />
                </div>
              </div>
            </div>
          </header>

          {activeRequests.length === 0 ? (
            <div className="dash-surface consumer-requests-empty">
              <h3>No active requests</h3>
              <p className="muted">
                Post what you need and nearby verified providers can send quotes.
              </p>
              <Link className="btn btn-with-icon" to="/consumer/post">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.25"
                  aria-hidden="true"
                >
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
                Broadcast request
              </Link>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="dash-surface consumer-requests-empty">
              <h3>No matches</h3>
              <p className="muted">Try another search.</p>
            </div>
          ) : (
            <div className="consumer-requests-grid">
              {filteredRequests.map((r) => {
                const category = categoryNameById.get(r.category_id) || "Category";
                const quotesForRequest = receivedQuotes.filter((q) => q.request_id === r.id);
                const pendingQuotes = quotesForRequest.filter((q) => q.status === "PENDING").length;
                const statusKey = r.status.toLowerCase();
                return (
                  <article
                    key={r.id}
                    className={`consumer-request-card status-${statusKey}`}
                  >
                    <div className="consumer-request-card-accent" aria-hidden="true" />
                    <header className="consumer-request-card-head">
                      <div className="consumer-request-mark" aria-hidden="true">
                        {r.title.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="consumer-request-card-title">
                        <div className="consumer-request-card-topline">
                          <span className="consumer-request-category">{category}</span>
                          <span className={`pill request-status ${statusKey}`}>
                            {r.status}
                          </span>
                        </div>
                        <h3>{r.title}</h3>
                      </div>
                    </header>

                    {r.description && (
                      <p className="consumer-request-desc">
                        {r.description.length > 120
                          ? `${r.description.slice(0, 120).trim()}…`
                          : r.description}
                      </p>
                    )}

                    <div className="consumer-request-chips">
                      <span className="consumer-request-chip">
                        <strong>{r.search_radius_km} km</strong>
                        radius
                      </span>
                      <span className="consumer-request-chip">
                        <strong>{r.target_mode === "TARGETED" ? "Targeted" : "Broadcast"}</strong>
                        mode
                      </span>
                      <span className="consumer-request-chip">
                        <strong>{quotesForRequest.length}</strong>
                        quotes
                      </span>
                      <span className="consumer-request-chip">
                        <strong>{new Date(r.created_at).toLocaleDateString()}</strong>
                        posted
                      </span>
                      {r.request_pincode && (
                        <span className="consumer-request-chip">
                          <strong>{r.request_pincode}</strong>
                          pincode
                        </span>
                      )}
                      {r.matched_provider_count != null && (
                        <span className="consumer-request-chip">
                          <strong>{r.matched_provider_count}</strong>
                          matched
                        </span>
                      )}
                    </div>

                    {(r.latitude != null || (r.attachments && r.attachments.length > 0)) && (
                      <div className="consumer-request-links">
                        <MapsLink latitude={r.latitude} longitude={r.longitude} />
                        {r.attachments && r.attachments.length > 0 && (
                          <span className="consumer-request-attach-count">
                            {r.attachments.length} file
                            {r.attachments.length === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                    )}

                    {r.attachments && r.attachments.length > 0 && (
                      <div className="consumer-request-attachments">
                        <AttachmentGallery attachments={r.attachments} />
                      </div>
                    )}

                    <footer className="consumer-request-card-actions">
                      <div className="consumer-request-card-actions-main">
                        <Link className="btn" to={`/consumer/requests/${r.id}`}>
                          View quotes
                        </Link>
                        {r.status === "ACTIVE" && (
                          <button
                            className="btn secondary consumer-request-close"
                            type="button"
                            disabled={closingRequestId === r.id}
                            onClick={() => beginCancelRequest(r.id, r.title, pendingQuotes)}
                          >
                            {closingRequestId === r.id ? "Cancelling…" : "Cancel"}
                          </button>
                        )}
                      </div>
                      {pendingQuotes > 0 ? (
                        <span className="consumer-request-quote-badge">
                          {pendingQuotes} waiting
                        </span>
                      ) : (
                        <span className="muted consumer-request-quiet">No quotes yet</span>
                      )}
                    </footer>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "quotes" && (
        <div className="consumer-quotes">
          <section className="page-hero consumer-quotes-hero">
            <div className="consumer-quotes-hero-top">
              <div>
                <p className="dash-eyebrow">Quotes</p>
                <h2>Received Quotes</h2>
                <p className="page-lead">
                  Compare offers from nearby providers across your requests.
                </p>
              </div>
              <span className="consumer-quotes-total">
                <strong>{receivedQuotes.length}</strong>
                quote{receivedQuotes.length === 1 ? "" : "s"}
              </span>
            </div>
          </section>

          {receivedQuotes.length === 0 ? (
            <div className="dash-surface consumer-requests-empty">
              <h3>No quotes yet</h3>
              <p className="muted">When providers reply to your requests, their offers show up here.</p>
              <Link className="btn" to="/consumer/post">
                Broadcast request
              </Link>
            </div>
          ) : (
            <div className="consumer-quotes-grid">
              {receivedQuotes.map((q) => {
                const statusKey = q.status.toLowerCase();
                const providerLabel =
                  q.provider_trust?.business_name || q.provider_name || "Provider";
                const initial = providerLabel.trim().slice(0, 1).toUpperCase() || "Q";
                const unread =
                  conversations.find((c) => c.provider_id === q.provider_id)?.unread_count || 0;
                return (
                  <article key={q.id} className={`consumer-quote-card status-${statusKey}`}>
                    <div className="consumer-quote-card-accent" aria-hidden="true" />
                    <div className="consumer-quote-card-body">
                      <header className="consumer-quote-card-head">
                        <span className="consumer-quote-mark" aria-hidden="true">
                          {initial}
                        </span>
                        <div className="consumer-quote-card-title">
                          <div className="consumer-quote-card-topline">
                            <span className="consumer-quote-request">
                              {q.request_title || "Request"}
                            </span>
                            <span className={`pill quote-status ${statusKey}`}>{q.status}</span>
                            {q.unseen && q.status === "PENDING" && (
                              <span className="nav-badge" aria-label="New quote">
                                New
                              </span>
                            )}
                          </div>
                          <h3>
                            {providerLabel}
                            {unread > 0 && (
                              <span
                                className="nav-badge"
                                style={{ marginLeft: "0.45rem", verticalAlign: "middle" }}
                                aria-label={`${unread} unread messages`}
                              >
                                {unread > 99 ? "99+" : unread}
                              </span>
                            )}
                          </h3>
                          <p className="muted consumer-quote-meta">
                            ★ {(q.provider_rating ?? 0).toFixed(1)}
                            {q.provider_trust?.full_name
                              ? ` · ${q.provider_trust.full_name}`
                              : q.provider_name
                                ? ` · ${q.provider_name}`
                                : ""}
                          </p>
                        </div>
                        <div className="consumer-quote-price">
                          <span className="consumer-quote-price-label">Quote</span>
                          <strong>₹{Number(q.price_quote).toLocaleString("en-IN")}</strong>
                          <span className="muted">
                            ETA {q.estimated_days} day{q.estimated_days === 1 ? "" : "s"}
                          </span>
                        </div>
                      </header>

                      {q.message && <p className="consumer-quote-message">{q.message}</p>}

                      {(q.attachments?.length || 0) > 0 && (
                        <div className="consumer-quote-attachments">
                          <AttachmentGallery attachments={q.attachments} />
                        </div>
                      )}

                      <footer className="consumer-quote-card-footer">
                        <time className="muted" dateTime={q.created_at}>
                          {new Date(q.created_at).toLocaleString()}
                        </time>
                        <div className="consumer-quote-card-actions">
                          {q.provider_id && (
                            <Link className="btn secondary" to={`/p/${q.provider_id}`}>
                              Provider
                            </Link>
                          )}
                          <Link
                            className="btn provider-quote-chat-btn"
                            to={`/consumer/requests/${q.request_id}`}
                          >
                            Open request
                            {unread > 0 && (
                              <span className="nav-badge provider-quote-chat-badge">
                                {unread > 99 ? "99+" : unread}
                              </span>
                            )}
                          </Link>
                        </div>
                      </footer>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "orders" && (
        <div className="consumer-orders">
          <section className="page-hero consumer-orders-hero">
            <div className="consumer-orders-hero-top">
              <div>
                <p className="dash-eyebrow">Orders</p>
                <h2>Orders</h2>
                <p className="page-lead">
                  Finished jobs and cancelled requests in one place.
                </p>
              </div>
              <span className="consumer-orders-total">
                <strong>{filteredOrdersFeed.length}</strong>
                item{filteredOrdersFeed.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="consumer-orders-filter-row">
              <StatusFilterSelect
                label="Filter by status"
                value={orderStatusFilter}
                options={CONSUMER_ORDER_FILTERS.map((opt) => ({
                  ...opt,
                  count: consumerOrderFilterCounts[opt.id],
                }))}
                onChange={setOrderStatusFilter}
              />
            </div>
          </section>

          {completeOrdersFeed.length === 0 ? (
            <div className="dash-surface consumer-requests-empty">
              <h3>No orders yet</h3>
              <p className="muted">Accepted deals, cancelled requests, and expired requests will show up here.</p>
              <Link className="btn" to="/consumer/post">
                Broadcast request
              </Link>
            </div>
          ) : filteredOrdersFeed.length === 0 ? (
            <div className="dash-surface consumer-requests-empty">
              <h3>No matches</h3>
              <p className="muted">No orders in this status.</p>
            </div>
          ) : (
            <div className="consumer-orders-grid">
              {filteredOrdersFeed.map((item) => {
                if (item.kind === "cancelled_request" || item.kind === "expired_request") {
                  const r = item.request;
                  const category = categoryNameById.get(r.category_id) || "Category";
                  const expired = item.kind === "expired_request";
                  return (
                    <article
                      key={`${expired ? "expired" : "cancelled"}-${r.id}`}
                      className={`consumer-order-card ${expired ? "expired" : "cancelled"}`}
                    >
                      <div className="consumer-order-card-accent" aria-hidden="true" />
                      <div className="consumer-order-card-body">
                        <header className="consumer-order-card-head">
                          <div>
                            <div className="consumer-order-card-topline">
                              <span className={`pill ${expired ? "request-status expired" : "offline"}`}>
                                {expired ? "Expired" : "Cancelled Order"}
                              </span>
                              <span className="consumer-order-category">{category}</span>
                            </div>
                            <h3>{r.title}</h3>
                            <p className="muted consumer-order-meta">
                              {expired ? "Request expired with no locked provider" : "Request cancelled"}
                              {item.quoteCount > 0
                                ? ` · ${item.quoteCount} quote${item.quoteCount === 1 ? "" : "s"} withdrawn`
                                : ""}
                            </p>
                          </div>
                        </header>
                        <footer className="consumer-order-card-footer">
                          <time className="muted" dateTime={r.expires_at || r.created_at}>
                            {new Date(r.expires_at || r.created_at).toLocaleString()}
                          </time>
                          <Link className="btn secondary" to={`/consumer/requests/${r.id}`}>
                            View request
                          </Link>
                        </footer>
                      </div>
                    </article>
                  );
                }

                const o = item.order;
                const statusKey = o.status.toLowerCase();
                return (
                  <article key={`order-${o.id}`} className={`consumer-order-card status-${statusKey}`}>
                    <div className="consumer-order-card-accent" aria-hidden="true" />
                    <div className="consumer-order-card-body">
                      <header className="consumer-order-card-head">
                        <div>
                          <div className="consumer-order-card-topline">
                            <span className={`pill order-status ${statusKey}`}>
                              {o.status.replaceAll("_", " ")}
                            </span>
                          </div>
                          <h3>₹{Number(o.agreed_price).toLocaleString("en-IN")}</h3>
                          <p className="muted consumer-order-meta">
                            {o.fulfillment_type.replaceAll("_", " ").toLowerCase()}
                            {o.payment_mode ? ` · ${o.payment_mode.replaceAll("_", " ")}` : ""}
                          </p>
                        </div>
                      </header>
                      <footer className="consumer-order-card-footer">
                        <time className="muted" dateTime={o.created_at}>
                          {new Date(o.created_at).toLocaleString()}
                        </time>
                        <Link className="btn" to={`/orders/${o.id}`}>
                          Open order
                        </Link>
                      </footer>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
