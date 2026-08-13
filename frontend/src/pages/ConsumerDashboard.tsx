import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { AttachmentGallery, FilePicker } from "../components/Attachments";
import { CategorySearchBox } from "../components/CategorySearchBox";
import { InquiryChatPanel, startOrOpenChat } from "../components/InquiryChat";
import { MapsLink } from "../components/MapsLink";
import { PostRequestModal } from "../components/PostRequestModal";
import { ProfileCard } from "../components/ProfileCard";
import {
  flattenCategoryOptions,
  offerKindClass,
  offerKindLabel,
} from "../components/ProviderTrust";
import { useWebSocket } from "../hooks/useWebSocket";
import { api } from "../services/api";
import { useAuth } from "../store/auth";
import { playQuoteBell } from "../services/sounds";
import { uploadFiles } from "../services/uploads";
import {
  clearPostRequestDraft,
  providersShareTopLevelCategory,
  readPostRequestDraft,
  SAME_CATEGORY_REQUEST_MESSAGE,
  type PostRequestDraft,
} from "../utils/postRequestDraft";
import { providerPublicPath } from "../utils/providerUrl";
import { isProviderOnlineNow } from "../utils/businessHours";
import type {
  CategoryTree,
  Conversation,
  Order,
  ProviderCatalogItem,
  Quote,
  ServiceRequest,
} from "../types";

type ConsumerSection =
  | "details"
  | "requests"
  | "post"
  | "providers"
  | "inquiries"
  | "quotes"
  | "orders";

const SECTIONS: ConsumerSection[] = [
  "details",
  "requests",
  "post",
  "providers",
  "inquiries",
  "quotes",
  "orders",
];

const TITLES: Record<ConsumerSection, string> = {
  details: "My Account",
  requests: "My requests",
  post: "Broadcast request",
  providers: "Providers in category",
  inquiries: "Recent inquiries",
  quotes: "Received Quotes",
  orders: "Orders",
};

export function ConsumerDashboard() {
  const { section } = useParams<{ section?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const tab = (
    section && SECTIONS.includes(section as ConsumerSection) ? section : "details"
  ) as ConsumerSection;
  const invalidSection = !!section && !SECTIONS.includes(section as ConsumerSection);

  const user = useAuth((s) => s.user);
  const [tree, setTree] = useState<CategoryTree[]>([]);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [receivedQuotes, setReceivedQuotes] = useState<Quote[]>([]);
  const [providers, setProviders] = useState<ProviderCatalogItem[]>([]);
  const [providerTab, setProviderTab] = useState<"online" | "offline">("online");
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeChatTitle, setActiveChatTitle] = useState("");
  const [activeChatMeta, setActiveChatMeta] = useState<{
    businessName: string;
    ownerName: string;
    isOnline: boolean;
  } | null>(null);
  const [openingChatId, setOpeningChatId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [requestSearch, setRequestSearch] = useState("");
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
    search_radius_km: "5",
    target_mode: "broadcast" as "broadcast" | "selected",
  });
  const [postModalOpen, setPostModalOpen] = useState(false);
  const [postDraft, setPostDraft] = useState<PostRequestDraft | null>(null);
  const [categoryMismatchPopup, setCategoryMismatchPopup] = useState(false);
  const categoryOptions = useMemo(() => flattenCategoryOptions(tree), [tree]);

  const hasCoords = user?.latitude != null && user?.longitude != null;
  const matchHint = hasCoords
    ? user?.pincode
      ? `Suggestions prefer providers within 5 km of your GPS. If none are nearby, same pincode (${user.pincode}) is used.`
      : "Suggestions use providers within 5 km of your GPS location."
    : user?.pincode
      ? `Suggestions use your pincode (${user.pincode}) to connect nearby providers.`
      : "Add GPS or a pincode in My profile to get nearby provider suggestions.";

  const { connected } = useWebSocket((msg) => {
    const m = msg as {
      type?: string;
      payload?: Quote & { conversation_id?: string; request_id?: string };
    };
    if (m.type === "new_quote") {
      void playQuoteBell();
      setToast(`New quote: ₹${m.payload?.price_quote}`);
      void refresh();
    }
    if (m.type === "quote_updated") {
      setToast(`Quote updated: ₹${m.payload?.price_quote}`);
      void refresh();
    }
    if (m.type === "inquiry_message") {
      setToast("New reply from a provider");
      void loadConversations();
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
    if (m.type === "order_completed") {
      setToast("Order completed");
      void refresh();
    }
  });

  async function loadConversations() {
    const { data } = await api.get<Conversation[]>("/conversations");
    setConversations(data);
  }

  async function loadProviders(categoryId: string) {
    if (!categoryId) {
      setProviders([]);
      return;
    }
    const { data } = await api.get<ProviderCatalogItem[]>("/providers/catalog", {
      params: { category_id: categoryId },
    });
    setProviders(data);
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
    const opts = flattenCategoryOptions(cats.data);
    const catId = form.category_id || (opts[0] ? String(opts[0].id) : "");
    if (opts[0]) {
      setForm((f) => ({
        ...f,
        category_id: f.category_id || String(opts[0].id),
      }));
    }
    if (catId) await loadProviders(catId);
    await loadConversations();
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
    if (user?.latitude != null && user?.longitude != null) {
      setForm((f) => ({
        ...f,
        latitude: String(user.latitude),
        longitude: String(user.longitude),
      }));
    }
  }, [user?.latitude, user?.longitude]);

  useEffect(() => {
    if (form.category_id) void loadProviders(form.category_id);
  }, [form.category_id]);

  const onlineProviders = useMemo(
    () =>
      providers.filter((p) =>
        isProviderOnlineNow({
          opening_time: p.opening_time,
          closing_time: p.closing_time,
          verification_status: p.verification_status,
        }),
      ),
    [providers],
  );
  const offlineProviders = useMemo(
    () =>
      providers.filter(
        (p) =>
          !isProviderOnlineNow({
            opening_time: p.opening_time,
            closing_time: p.closing_time,
            verification_status: p.verification_status,
          }),
      ),
    [providers],
  );
  const tabProviders = providerTab === "online" ? onlineProviders : offlineProviders;

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
    return [...orderItems, ...cancelledItems].sort(
      (a, b) => new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime(),
    );
  }, [orders, requests, receivedQuotes]);

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
      if (!hasCoords && !user?.pincode && !(form.latitude && form.longitude)) {
        setToast("Add a location or pincode in My profile before broadcasting");
        setBusy(false);
        return;
      }
      const uploaded = await uploadFiles(files);
      const lat = form.latitude ? Number(form.latitude) : user?.latitude ?? null;
      const lon = form.longitude ? Number(form.longitude) : user?.longitude ?? null;
      const { data } = await api.post<ServiceRequest>("/requests", {
        category_id: Number(form.category_id),
        title: form.title,
        description: form.description,
        longitude: lon,
        latitude: lat,
        pincode: user?.pincode || null,
        search_radius_km: Number(form.search_radius_km),
        attachment_ids: uploaded.map((a) => a.id),
        target_provider_ids: [],
      });
      const mode =
        lat != null && lon != null
          ? "within 5 km"
          : user?.pincode
            ? `by pincode ${user.pincode}`
            : "";
      setToast(
        `Request broadcast to ${data.matched_provider_count ?? 0} nearby providers${mode ? ` (${mode})` : ""}` +
          (uploaded.length ? ` · ${uploaded.length} file(s)` : ""),
      );
      setForm((f) => ({ ...f, title: "", description: "" }));
      setFiles([]);
      setSelectedProviders([]);
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

  function toggleProvider(userId: string) {
    setSelectedProviders((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  function goPostToSelected() {
    if (selectedProviders.length === 0) {
      setToast("Select one or more providers first");
      return;
    }
    const selected = providers.filter((p) => selectedProviders.includes(p.user_id));
    if (!providersShareTopLevelCategory(tree, selected)) {
      setCategoryMismatchPopup(true);
      return;
    }
    setPostDraft({
      providerIds: selectedProviders,
      categoryId: form.category_id ? Number(form.category_id) : null,
      providers: selected.map((p) => ({
        id: p.user_id,
        name: p.business_name || p.full_name,
        categoryId: p.category_id,
      })),
    });
    setPostModalOpen(true);
  }

  async function chatWith(provider: ProviderCatalogItem) {
    if (openingChatId) return;
    setOpeningChatId(provider.user_id);
    try {
      const conv = await startOrOpenChat(
        provider.user_id,
        Number(form.category_id) || provider.category_id,
      );
      setActiveChatId(conv.id);
      setActiveChatTitle(provider.business_name || provider.full_name);
      setActiveChatMeta({
        businessName: provider.business_name || provider.full_name,
        ownerName: provider.full_name,
        isOnline: isProviderOnlineNow({
          opening_time: provider.opening_time,
          closing_time: provider.closing_time,
          verification_status: provider.verification_status,
        }),
      });
      await loadConversations();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Cannot start chat";
      setToast(String(msg));
    } finally {
      setOpeningChatId(null);
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
        setActiveChatMeta(null);
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
          setSelectedProviders([]);
          setPostDraft(null);
          void refresh();
        }}
      />

      {categoryMismatchPopup &&
        createPortal(
          <div
            className="modal-backdrop"
            onClick={() => setCategoryMismatchPopup(false)}
            role="presentation"
          >
            <div
              className="modal-dialog card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="consumer-category-mismatch-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="consumer-category-mismatch-title" style={{ margin: "0 0 0.5rem" }}>
                Same category required
              </h3>
              <p className="muted" style={{ margin: "0 0 1rem" }}>
                {SAME_CATEGORY_REQUEST_MESSAGE}
              </p>
              <button className="btn" type="button" onClick={() => setCategoryMismatchPopup(false)}>
                OK
              </button>
            </div>
          </div>,
          document.body,
        )}

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

      {tab === "providers" && (
        <div className="consumer-providers">
          <section className="page-hero consumer-providers-hero">
            <div className="consumer-providers-hero-top">
              <div>
                <p className="dash-eyebrow">Browse</p>
                <h2>Providers in category</h2>
                <p className="page-lead">
                  Chat before requesting, or select providers for a targeted send.
                </p>
                <p className="muted consumer-providers-hint">{matchHint}</p>
              </div>
              <span className="consumer-providers-total">
                <strong>{tabProviders.length}</strong>
                {providerTab}
              </span>
            </div>

            {selectedProviders.length > 0 && (
              <div className="consumer-providers-selection">
                <span className="pill online">
                  {selectedProviders.length} selected
                </span>
                <div className="consumer-providers-selection-actions">
                  <button className="btn" type="button" onClick={goPostToSelected}>
                    Send request to selected
                  </button>
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => setSelectedProviders([])}
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="dash-surface consumer-providers-tools">
            <div className="field consumer-providers-category">
              <label>Category / subcategory</label>
              <CategorySearchBox
                options={categoryOptions}
                value={form.category_id}
                onChange={(id) => {
                  setForm({ ...form, category_id: id });
                  setProviderTab("online");
                  setSelectedProviders([]);
                }}
                placeholder="Search categories…"
              />
            </div>
            <div className="dash-segment" role="tablist" aria-label="Provider availability">
              <button
                type="button"
                className={`dash-segment-btn ${providerTab === "online" ? "active" : ""}`}
                onClick={() => setProviderTab("online")}
              >
                Online
                <span className="consumer-requests-count">{onlineProviders.length}</span>
              </button>
              <button
                type="button"
                className={`dash-segment-btn ${providerTab === "offline" ? "active" : ""}`}
                onClick={() => setProviderTab("offline")}
              >
                Offline
                <span className="consumer-requests-count">{offlineProviders.length}</span>
              </button>
            </div>
          </section>

          {tabProviders.length === 0 ? (
            <div className="dash-surface consumer-requests-empty">
              <h3>No {providerTab} providers</h3>
              <p className="muted">
                Try another category, or check the {providerTab === "online" ? "offline" : "online"}{" "}
                list.
              </p>
            </div>
          ) : (
            <div className="consumer-providers-grid">
              {tabProviders.map((p) => {
                const kindClass = offerKindClass(p.offer_kind);
                const initial = (p.business_name || "P").trim().slice(0, 1).toUpperCase();
                const blurb = p.offerings_detail || p.description || "";
                const selected = selectedProviders.includes(p.user_id);
                const online = isProviderOnlineNow({
                  opening_time: p.opening_time,
                  closing_time: p.closing_time,
                  verification_status: p.verification_status,
                });
                return (
                  <article
                    key={p.user_id}
                    className={`consumer-provider-card ${kindClass} ${selected ? "selected" : ""}`}
                  >
                    <div className="consumer-provider-card-accent" aria-hidden="true" />
                    <div className="consumer-provider-card-body">
                      <header className="consumer-provider-card-head">
                        <span className={`consumer-provider-mark ${kindClass}`} aria-hidden="true">
                          {initial}
                        </span>
                        <div className="consumer-provider-identity">
                          <div className="consumer-provider-topline">
                            <span className={`pill ${online ? "online" : "offline"}`}>
                              {online ? "Online" : "Offline"}
                            </span>
                            {p.verification_status === "APPROVED" && (
                              <span className="pill online">Verified</span>
                            )}
                          </div>
                          <h3>
                            <Link to={providerPublicPath(p)}>{p.business_name}</Link>
                          </h3>
                          <p className="muted consumer-provider-owner">
                            {p.full_name}
                            {p.average_rating != null
                              ? ` · ★ ${Number(p.average_rating).toFixed(1)} (${p.rating_count ?? 0})`
                              : ""}
                          </p>
                        </div>
                        <label className="consumer-provider-select">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleProvider(p.user_id)}
                            aria-label={`Select ${p.business_name}`}
                          />
                          <span>Select</span>
                        </label>
                      </header>

                      {blurb && (
                        <p className="consumer-provider-blurb">
                          {blurb.length > 140 ? `${blurb.slice(0, 140).trim()}…` : blurb}
                        </p>
                      )}

                      <div className="consumer-provider-chips">
                        <span className="consumer-provider-chip">
                          <strong>{offerKindLabel(p.offer_kind)}</strong>
                          offers
                        </span>
                        <span className="consumer-provider-chip">
                          <strong>{p.max_radius_km} km</strong>
                          radius
                        </span>
                        {p.opening_time && p.closing_time && (
                          <span className="consumer-provider-chip">
                            <strong>
                              {p.opening_time}–{p.closing_time}
                            </strong>
                            hours
                          </span>
                        )}
                        {(p.categories || []).slice(0, 2).map((cat) => (
                          <span key={cat} className="consumer-provider-chip">
                            <strong>{cat}</strong>
                            category
                          </span>
                        ))}
                      </div>

                      <div className="consumer-provider-links">
                        <MapsLink
                          latitude={p.latitude}
                          longitude={p.longitude}
                          maps_url={p.maps_url}
                          label={p.location_label || undefined}
                        />
                      </div>

                      <footer className="consumer-provider-card-footer">
                        <Link className="btn secondary" to={providerPublicPath(p)}>
                          View profile
                        </Link>
                        <button
                          className="btn"
                          type="button"
                          disabled={openingChatId === p.user_id}
                          onClick={() => void chatWith(p)}
                        >
                          {openingChatId === p.user_id ? "Opening…" : "Chat & ask"}
                        </button>
                      </footer>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {tab === "providers" && activeChatId && (
            <InquiryChatPanel
              conversationId={activeChatId}
              mode="overlay"
              title={activeChatMeta?.businessName || activeChatTitle}
              subtitle={
                activeChatMeta?.ownerName &&
                activeChatMeta.ownerName !== activeChatMeta.businessName
                  ? activeChatMeta.ownerName
                  : "Inquiry chat"
              }
              avatarLabel={activeChatMeta?.businessName || activeChatTitle}
              statusLabel={
                activeChatMeta ? (activeChatMeta.isOnline ? "Online" : "Offline") : undefined
              }
              statusTone={
                activeChatMeta ? (activeChatMeta.isOnline ? "online" : "offline") : "neutral"
              }
              autoFocus
              emptyHint="Say hello and ask about availability, pricing, or timing. They’ll see your message when they’re next available."
              placeholder="Write a message…"
              onClose={() => {
                setActiveChatId(null);
                setActiveChatMeta(null);
              }}
            />
          )}
        </div>
      )}

      {tab === "inquiries" && (
        <div className="page-stack">
          <header className="page-hero">
            <p className="dash-eyebrow">Messages</p>
            <h2>Recent inquiries</h2>
            <p className="page-lead">Chats from the last 30 days.</p>
          </header>
          <section className="page-panel">
            {activeChatId ? (
              <InquiryChatPanel
                conversationId={activeChatId}
                mode="inline"
                title={activeChatTitle}
                subtitle="Inquiry chat"
                avatarLabel={activeChatTitle}
                autoFocus
                emptyHint="Continue the conversation with this provider."
                placeholder="Write a message…"
                onClose={() => setActiveChatId(null)}
              />
            ) : (
              <div className="page-list list">
                {conversations.length === 0 && (
                  <p className="page-empty">No recent inquiries.</p>
                )}
                {conversations.map((c) => (
                  <div key={c.id} className="list-item">
                    <strong>{c.provider_business_name || c.provider_name}</strong>
                    <div className="muted">{c.last_message || "No messages yet"}</div>
                    <div className="page-actions">
                      <button
                        className="btn secondary"
                        type="button"
                        onClick={() => {
                          setActiveChatId(c.id);
                          setActiveChatTitle(
                            c.provider_business_name || c.provider_name || "Chat",
                          );
                        }}
                      >
                        Open chat
                      </button>
                      <button
                        className="btn secondary consumer-request-close"
                        type="button"
                        onClick={() =>
                          setDeleteChatTarget({
                            id: c.id,
                            title: c.provider_business_name || c.provider_name || "this chat",
                          })
                        }
                      >
                        Delete chat
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
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
              <div className="post-request-location-card">
                {hasCoords ? (
                  <>
                    <p>
                      Using your profile location
                      {user?.location_label ? `: ${user.location_label}` : ""}.
                    </p>
                    <p className="muted">
                      Broadcast matches providers within about 5 km
                      {user?.pincode ? ` (pincode ${user.pincode} as fallback)` : ""}.
                    </p>
                    <MapsLink
                      latitude={Number(form.latitude || user?.latitude)}
                      longitude={Number(form.longitude || user?.longitude)}
                    />
                  </>
                ) : user?.pincode ? (
                  <p>
                    Matching by pincode <strong>{user.pincode}</strong> — providers in the same
                    pincode for this category will be notified.
                  </p>
                ) : (
                  <p className="muted">
                    Add GPS or a pincode in <Link to="/profile">My profile</Link> so we can match
                    nearby providers.
                  </p>
                )}
              </div>
              {!hasCoords && (
                <div className="grid grid-2 post-request-coords">
                  <div className="field">
                    <label>Longitude (optional)</label>
                    <input
                      value={form.longitude}
                      onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                      placeholder="From profile or map"
                    />
                  </div>
                  <div className="field">
                    <label>Latitude (optional)</label>
                    <input
                      value={form.latitude}
                      onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                      placeholder="From profile or map"
                    />
                  </div>
                </div>
              )}
              {hasCoords && (
                <div className="field">
                  <label>Search radius (km)</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={form.search_radius_km}
                    onChange={(e) => setForm({ ...form, search_radius_km: e.target.value })}
                    disabled
                  />
                  <p className="muted" style={{ fontSize: "0.85rem" }}>
                    Nearby matching uses a fixed 5 km radius when coordinates are available.
                  </p>
                </div>
              )}
            </section>

            <div className="page-actions post-request-actions">
              <button className="btn" type="submit" disabled={busy || !form.category_id}>
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
                          </div>
                          <h3>{providerLabel}</h3>
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
                          <Link className="btn" to={`/consumer/requests/${q.request_id}`}>
                            Open request
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
                <strong>{completeOrdersFeed.length}</strong>
                item{completeOrdersFeed.length === 1 ? "" : "s"}
              </span>
            </div>
          </section>

          {completeOrdersFeed.length === 0 ? (
            <div className="dash-surface consumer-requests-empty">
              <h3>No orders yet</h3>
              <p className="muted">Accepted deals and cancelled requests will show up here.</p>
              <Link className="btn" to="/consumer/post">
                Broadcast request
              </Link>
            </div>
          ) : (
            <div className="consumer-orders-grid">
              {completeOrdersFeed.map((item) => {
                if (item.kind === "cancelled_request") {
                  const r = item.request;
                  const category = categoryNameById.get(r.category_id) || "Category";
                  return (
                    <article key={`cancelled-${r.id}`} className="consumer-order-card cancelled">
                      <div className="consumer-order-card-accent" aria-hidden="true" />
                      <div className="consumer-order-card-body">
                        <header className="consumer-order-card-head">
                          <div>
                            <div className="consumer-order-card-topline">
                              <span className="pill offline">Cancelled Order</span>
                              <span className="consumer-order-category">{category}</span>
                            </div>
                            <h3>{r.title}</h3>
                            <p className="muted consumer-order-meta">
                              Request cancelled
                              {item.quoteCount > 0
                                ? ` · ${item.quoteCount} quote${item.quoteCount === 1 ? "" : "s"} withdrawn`
                                : ""}
                            </p>
                          </div>
                        </header>
                        <footer className="consumer-order-card-footer">
                          <time className="muted" dateTime={r.created_at}>
                            {new Date(r.created_at).toLocaleString()}
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
