import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { AttachmentGallery } from "../components/Attachments";
import { startOrOpenChat, InquiryChatPanel } from "../components/InquiryChat";
import { MapsLink } from "../components/MapsLink";
import { useWebSocket } from "../hooks/useWebSocket";
import { api } from "../services/api";
import { playQuoteBell } from "../services/sounds";
import { useConsumerNav } from "../store/consumerNav";
import type { Conversation, Order, Quote, ServiceRequest } from "../types";

export function RequestDetailPage() {
  const { id } = useParams();
  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [lockedOrder, setLockedOrder] = useState<Order | null>(null);
  const [fulfillment, setFulfillment] = useState("PROVIDER_DELIVERY");
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [chatId, setChatId] = useState<string | null>(null);
  const [chatTitle, setChatTitle] = useState("");
  const knownIds = useRef<Set<string>>(new Set());
  const primed = useRef(false);
  const refreshQuotesChatUnread = useConsumerNav((s) => s.refreshQuotesChatUnread);

  function showMessage(text: string, tone: "success" | "error" = "success") {
    setMessageTone(tone);
    setMessage(text);
  }

  useEffect(() => {
    if (!message) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [message]);

  async function load(opts?: { silent?: boolean }) {
    if (!id) return;
    const [req, qs, orders, convs] = await Promise.all([
      api.get<ServiceRequest>(`/requests/${id}`),
      api.get<Quote[]>(`/requests/${id}/quotes`),
      api.get<Order[]>("/orders/mine"),
      api.get<Conversation[]>("/conversations"),
    ]);
    setRequest(req.data);
    setConversations(convs.data);

    const next = qs.data;
    if (primed.current) {
      const fresh = next.filter((q) => !knownIds.current.has(q.id));
      if (fresh.length > 0 && !opts?.silent) {
        void playQuoteBell();
      }
    }
    knownIds.current = new Set(next.map((q) => q.id));
    primed.current = true;
    setQuotes(next);

    const orderForRequest =
      orders.data.find((o) => o.request_id === id) ||
      null;
    setLockedOrder(orderForRequest);
  }

  const unreadByProvider = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of conversations) {
      const n = c.unread_count || 0;
      if (n > 0 && c.provider_id) {
        map.set(c.provider_id, (map.get(c.provider_id) || 0) + n);
      }
    }
    return map;
  }, [conversations]);

  const requestUnreadTotal = useMemo(() => {
    const providerIds = new Set(quotes.map((q) => q.provider_id).filter(Boolean) as string[]);
    let total = 0;
    for (const pid of providerIds) {
      total += unreadByProvider.get(pid) || 0;
    }
    return total;
  }, [quotes, unreadByProvider]);

  const { connected } = useWebSocket((msg) => {
    const m = msg as {
      type?: string;
      payload?: Quote & {
        request_id?: string;
        conversation_id?: string;
        provider_id?: string;
      };
    };
    if (
      (m.type === "new_quote" || m.type === "quote_updated") &&
      m.payload?.request_id === id
    ) {
      if (m.type === "new_quote") void playQuoteBell();
      void load({ silent: true });
    }
    if (m.type === "order_confirmed" && m.payload?.request_id === id) {
      void load({ silent: true });
    }
    if (m.type === "order_completed" || m.type === "conversation_reset") {
      const closedId = m.payload?.conversation_id;
      const closedProviderId = m.payload?.provider_id;
      setConversations((prev) =>
        prev.filter((c) => {
          if (closedId && c.id === closedId) return false;
          if (closedProviderId && c.provider_id === closedProviderId) return false;
          return true;
        }),
      );
      setChatId((current) => {
        if (closedId && current === closedId) {
          setChatTitle("");
          return null;
        }
        return current;
      });
      if (m.type === "order_completed") {
        void load({ silent: true });
      }
    }
    if (m.type === "inquiry_message") {
      void load({ silent: true });
      void refreshQuotesChatUnread();
    }
  });

  useEffect(() => {
    primed.current = false;
    knownIds.current = new Set();
    void load();
    const t = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(t);
  }, [id]);

  async function accept(quoteId: string) {
    try {
      const { data } = await api.post<Order>("/orders/accept", {
        quote_id: quoteId,
        fulfillment_type: fulfillment,
        payment_mode: paymentMode,
      });
      setLockedOrder(data);
      showMessage(
        data.completion_otp
          ? `Deal locked. Your completion OTP is ${data.completion_otp}. Share it only at handover.`
          : "Deal locked.",
        "success",
      );
      await load({ silent: true });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Could not accept quote";
      showMessage(String(msg), "error");
    }
  }

  async function chatWithProvider(providerId: string, name: string) {
    try {
      const conv = await startOrOpenChat(
        providerId,
        request?.category_id,
        `Hi, following up on my request "${request?.title || ""}".`,
        request?.id,
      );
      setChatId(conv.id);
      setChatTitle(name);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Cannot start chat";
      showMessage(String(msg), "error");
    }
  }

  const statusKey = request?.status.toLowerCase() || "active";
  const canAccept = request?.status === "ACTIVE";
  const orderOpen =
    !!lockedOrder &&
    lockedOrder.status !== "COMPLETED" &&
    lockedOrder.status !== "CANCELLED";
  const showOtp = orderOpen && !!lockedOrder?.completion_otp;

  return (
    <AppShell title="Request quotes" connected={connected}>
      <div className="request-detail">
        <Link className="request-detail-back" to="/consumer/requests">
          ← Back to requests
        </Link>

        {message &&
          createPortal(
            <div
              className="modal-backdrop request-detail-popup-backdrop"
              onClick={() => setMessage("")}
              role="presentation"
            >
              <div
                className={`modal-dialog card request-detail-popup ${messageTone}`}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="request-detail-popup-title"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="dash-eyebrow">
                  {messageTone === "error" ? "Something went wrong" : "Action complete"}
                </p>
                <h3 id="request-detail-popup-title">
                  {messageTone === "error" ? "Couldn’t finish that" : "Success"}
                </h3>
                <p className="request-detail-popup-message">{message}</p>
                <button className="btn" type="button" onClick={() => setMessage("")}>
                  OK
                </button>
              </div>
            </div>,
            document.body,
          )}

        {request ? (
          <section className={`dash-surface request-detail-hero status-${statusKey}`}>
            <div className="request-detail-hero-top">
              <div className="request-detail-hero-main">
                <span className="request-detail-mark" aria-hidden="true">
                  {request.title.slice(0, 1).toUpperCase()}
                </span>
                <div className="request-detail-identity">
                  <p className="dash-eyebrow">Your request</p>
                  <div className="request-detail-title-row">
                    <h2>{request.title}</h2>
                    <span className={`pill request-status ${statusKey}`}>{request.status}</span>
                  </div>
                  {request.description && (
                    <p className="request-detail-desc">{request.description}</p>
                  )}
                </div>
              </div>
              <span className="request-detail-quote-total">
                <strong>{quotes.length}</strong>
                quote{quotes.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="request-detail-chips">
              <span className="request-detail-chip">
                <strong>{request.target_mode === "TARGETED" ? "Targeted" : "Broadcast"}</strong>
                mode
              </span>
              <span className="request-detail-chip">
                <strong>{request.search_radius_km} km</strong>
                radius
              </span>
              {request.target_mode === "TARGETED" && (
                <span className="request-detail-chip">
                  <strong>{request.target_provider_ids?.length || 0}</strong>
                  providers
                </span>
              )}
              {request.request_pincode && (
                <span className="request-detail-chip">
                  <strong>{request.request_pincode}</strong>
                  pincode
                </span>
              )}
              {request.matched_provider_count != null && (
                <span className="request-detail-chip">
                  <strong>{request.matched_provider_count}</strong>
                  matched
                </span>
              )}
              <span className="request-detail-chip">
                <strong>{new Date(request.created_at).toLocaleDateString()}</strong>
                posted
              </span>
            </div>

            {(request.latitude != null || (request.attachments?.length || 0) > 0) && (
              <div className="request-detail-links">
                <MapsLink latitude={request.latitude} longitude={request.longitude} />
                {(request.attachments?.length || 0) > 0 && (
                  <span className="request-detail-attach-count">
                    {request.attachments!.length} file
                    {request.attachments!.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            )}

            {(request.attachments?.length || 0) > 0 && (
              <div className="request-detail-attachments">
                <p className="dash-eyebrow">Your attachments</p>
                <AttachmentGallery attachments={request.attachments} emptyText="No files attached." />
              </div>
            )}
          </section>
        ) : (
          <div className="dash-surface request-detail-loading">
            <p className="muted">Loading request…</p>
          </div>
        )}

        {showOtp && lockedOrder && (
          <section className="dash-surface request-detail-otp" aria-live="polite">
            <div className="request-detail-otp-copy">
              <p className="dash-eyebrow">Deal locked</p>
              <h3>Completion OTP</h3>
              <p className="muted">
                Share this code with the provider only at handover or delivery.
              </p>
            </div>
            <div className="request-detail-otp-code" title="Completion OTP">
              {lockedOrder.completion_otp}
            </div>
            <Link className="btn secondary" to={`/orders/${lockedOrder.id}`}>
              Open order
            </Link>
          </section>
        )}

        {canAccept ? (
          <section className="dash-surface request-detail-deal">
            <div className="dash-section-head">
              <p className="dash-eyebrow">When you accept</p>
              <h3>Deal preferences</h3>
              <p className="muted">Applied to the quote you accept for this request.</p>
            </div>
            <div className="request-detail-deal-grid">
              <div className="field">
                <label htmlFor="fulfillment">Delivery / fulfillment</label>
                <select
                  id="fulfillment"
                  value={fulfillment}
                  onChange={(e) => setFulfillment(e.target.value)}
                >
                  <option value="PROVIDER_DELIVERY">Provider delivery</option>
                  <option value="CONSUMER_PICKUP">Consumer pickup</option>
                  <option value="HOME_SERVICE">Home service</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="paymentMode">Payment mode</label>
                <select
                  id="paymentMode"
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                >
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="CARD">Card</option>
                  <option value="BANK_TRANSFER">Bank transfer</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
            </div>
          </section>
        ) : null}

        <section className="request-detail-quotes">
          <div className="request-detail-quotes-head">
            <div>
              <p className="dash-eyebrow">Offers</p>
              <h3>
                Quotes received
                {requestUnreadTotal > 0 && (
                  <span
                    className="nav-badge"
                    style={{ marginLeft: "0.5rem", verticalAlign: "middle" }}
                    aria-label={`${requestUnreadTotal} unread chat messages`}
                  >
                    {requestUnreadTotal > 99 ? "99+" : requestUnreadTotal}
                  </span>
                )}
              </h3>
            </div>
          </div>

          {quotes.length === 0 ? (
            <div className="dash-surface request-detail-empty">
              <h3>Waiting for quotes</h3>
              <p className="muted">
                Providers nearby will reply here. This page refreshes automatically.
              </p>
            </div>
          ) : (
            <div className="request-detail-quotes-grid">
              {quotes.map((q) => {
                const qStatus = q.status.toLowerCase();
                const providerLabel =
                  q.provider_trust?.business_name || q.provider_name || "Provider";
                const initial = providerLabel.trim().slice(0, 1).toUpperCase() || "Q";
                return (
                  <article key={q.id} className={`consumer-quote-card status-${qStatus}`}>
                    <div className="consumer-quote-card-accent" aria-hidden="true" />
                    <div className="consumer-quote-card-body">
                      <header className="consumer-quote-card-head">
                        <span className="consumer-quote-mark" aria-hidden="true">
                          {initial}
                        </span>
                        <div className="consumer-quote-card-title">
                          <div className="consumer-quote-card-topline">
                            <span className={`pill quote-status ${qStatus}`}>{q.status}</span>
                          </div>
                          <div className="request-detail-provider-row">
                            <div className="request-detail-provider-identity">
                              {q.provider_id ? (
                                <Link
                                  className="request-detail-provider-name"
                                  to={`/p/${q.provider_id}`}
                                >
                                  {providerLabel}
                                </Link>
                              ) : (
                                <h3>{providerLabel}</h3>
                              )}
                              {q.provider_trust?.verification_status === "APPROVED" && (
                                <span className="pill online">Verified</span>
                              )}
                            </div>
                            <button
                              className="icon-btn request-detail-chat-icon provider-quote-chat-btn"
                              type="button"
                              title={
                                (unreadByProvider.get(q.provider_id) || 0) > 0
                                  ? `Chat with ${providerLabel}, ${unreadByProvider.get(q.provider_id)} unread`
                                  : "Chat"
                              }
                              aria-label={
                                (unreadByProvider.get(q.provider_id) || 0) > 0
                                  ? `Chat with ${providerLabel}, ${unreadByProvider.get(q.provider_id)} unread`
                                  : `Chat with ${providerLabel}`
                              }
                              onClick={() => void chatWithProvider(q.provider_id, providerLabel)}
                            >
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                              </svg>
                              {(unreadByProvider.get(q.provider_id) || 0) > 0 && (
                                <span className="nav-badge provider-quote-chat-badge">
                                  {(unreadByProvider.get(q.provider_id) || 0) > 99
                                    ? "99+"
                                    : unreadByProvider.get(q.provider_id)}
                                </span>
                              )}
                            </button>
                          </div>
                          <p className="muted consumer-quote-meta">
                            ★ {(q.provider_rating ?? 0).toFixed(1)}
                            {q.provider_trust?.full_name
                              ? ` · ${q.provider_trust.full_name}`
                              : q.provider_name
                                ? ` · ${q.provider_name}`
                                : ""}
                          </p>
                        </div>
                        <div className="request-detail-price-row">
                          <div className="consumer-quote-price">
                            <span className="consumer-quote-price-label">Quote</span>
                            <strong>₹{Number(q.price_quote).toLocaleString("en-IN")}</strong>
                            <span className="muted">
                              ETA {q.estimated_days} day{q.estimated_days === 1 ? "" : "s"}
                            </span>
                          </div>
                          {q.status === "PENDING" && canAccept && (
                            <button
                              className="btn request-detail-accept"
                              type="button"
                              onClick={() => void accept(q.id)}
                            >
                              Accept quote
                            </button>
                          )}
                          {q.status === "ACCEPTED" &&
                            lockedOrder?.quote_id === q.id &&
                            showOtp && (
                              <div className="request-detail-quote-otp">
                                <span className="request-detail-quote-otp-label">OTP</span>
                                <strong>{lockedOrder.completion_otp}</strong>
                              </div>
                            )}
                        </div>
                      </header>

                      {q.status === "ACCEPTED" &&
                        lockedOrder?.quote_id === q.id &&
                        showOtp && (
                          <p className="request-detail-quote-otp-hint muted">
                            Deal locked — share this OTP only at handover.
                            {lockedOrder.id && (
                              <>
                                {" "}
                                <Link to={`/orders/${lockedOrder.id}`}>View order</Link>
                              </>
                            )}
                          </p>
                        )}

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
                          <button
                            className="btn secondary request-detail-chat-btn provider-quote-chat-btn"
                            type="button"
                            onClick={() => void chatWithProvider(q.provider_id, providerLabel)}
                          >
                            Chat
                            {(unreadByProvider.get(q.provider_id) || 0) > 0 && (
                              <span className="nav-badge provider-quote-chat-badge">
                                {(unreadByProvider.get(q.provider_id) || 0) > 99
                                  ? "99+"
                                  : unreadByProvider.get(q.provider_id)}
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

        {chatId && (
          <InquiryChatPanel
            conversationId={chatId}
            mode="overlay"
            title={chatTitle}
            subtitle="Quote inquiry"
            avatarLabel={chatTitle}
            autoFocus
            emptyHint="Ask the provider about their quote or timing."
            placeholder="Write a message…"
            onClose={() => setChatId(null)}
            onMessagesLoaded={() => {
              void load({ silent: true });
              void refreshQuotesChatUnread();
            }}
          />
        )}
      </div>
    </AppShell>
  );
}
