import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { AttachmentGallery } from "../components/Attachments";
import { startOrOpenChat, InquiryChatPanel } from "../components/InquiryChat";
import { ProviderTrustBlock } from "../components/ProviderTrust";
import { useWebSocket } from "../hooks/useWebSocket";
import { api } from "../services/api";
import { playQuoteBell } from "../services/sounds";
import type { Order, Quote, ServiceRequest } from "../types";

export function RequestDetailPage() {
  const { id } = useParams();
  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [fulfillment, setFulfillment] = useState("PROVIDER_DELIVERY");
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [message, setMessage] = useState("");
  const [chatId, setChatId] = useState<string | null>(null);
  const [chatTitle, setChatTitle] = useState("");
  const knownIds = useRef<Set<string>>(new Set());
  const primed = useRef(false);

  async function load(opts?: { silent?: boolean }) {
    if (!id) return;
    const [req, qs] = await Promise.all([
      api.get<ServiceRequest>(`/requests/${id}`),
      api.get<Quote[]>(`/requests/${id}/quotes`),
    ]);
    setRequest(req.data);

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
  }

  const { connected } = useWebSocket((msg) => {
    const m = msg as { type?: string; payload?: Quote };
    if (m.type === "new_quote" && m.payload?.request_id === id) {
      void playQuoteBell();
      void load({ silent: true });
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
    const { data } = await api.post<Order>("/orders/accept", {
      quote_id: quoteId,
      fulfillment_type: fulfillment,
      payment_mode: paymentMode,
    });
    setMessage(`Deal locked. OTP: ${data.completion_otp}`);
    await load({ silent: true });
  }

  async function chatWithProvider(providerId: string, name: string) {
    try {
      const conv = await startOrOpenChat(
        providerId,
        request?.category_id,
        `Hi, following up on my request "${request?.title || ""}".`,
      );
      setChatId(conv.id);
      setChatTitle(name);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Cannot start chat";
      setMessage(String(msg));
    }
  }

  return (
    <AppShell title="Request quotes" connected={connected}>
      <div className="card">
        <Link to="/consumer/requests">← Back</Link>
        {request && (
          <>
            <h2>{request.title}</h2>
            <p>{request.description}</p>
            <p className="muted">
              Status: {request.status}
              {request.target_mode === "TARGETED"
                ? ` · Targeted (${request.target_provider_ids?.length || 0} providers)`
                : ` · Broadcast · Radius: ${request.search_radius_km} km`}
            </p>
            <h3>Your attachments</h3>
            <AttachmentGallery attachments={request.attachments} emptyText="No files attached." />
          </>
        )}
        <div className="grid grid-2">
          <div className="field">
            <label>Delivery / fulfillment when accepting</label>
            <select value={fulfillment} onChange={(e) => setFulfillment(e.target.value)}>
              <option value="PROVIDER_DELIVERY">Provider delivery</option>
              <option value="CONSUMER_PICKUP">Consumer pickup</option>
              <option value="HOME_SERVICE">Home service</option>
            </select>
          </div>
          <div className="field">
            <label>Payment mode when accepting</label>
            <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="CARD">Card</option>
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
        </div>
        <div className="list">
          {quotes.length === 0 && <p className="muted">Waiting for quotes…</p>}
          {quotes.map((q) => (
            <div key={q.id} className="list-item">
              <strong>
                ₹{q.price_quote} · ETA {q.estimated_days} day{q.estimated_days === 1 ? "" : "s"}
              </strong>
              <div className="muted">
                {q.provider_name} · rating {q.provider_rating ?? 0} · {q.status}
              </div>
              <ProviderTrustBlock trust={q.provider_trust} />
              {q.message && <p>{q.message}</p>}
              <AttachmentGallery attachments={q.attachments} />
              <div className="nav-actions" style={{ marginTop: "0.5rem" }}>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() =>
                    void chatWithProvider(
                      q.provider_id,
                      q.provider_trust?.business_name || q.provider_name || "Provider",
                    )
                  }
                >
                  Chat
                </button>
                {q.status === "PENDING" && request?.status === "ACTIVE" && (
                  <button className="btn" type="button" onClick={() => void accept(q.id)}>
                    Accept quote
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {chatId && (
          <div style={{ marginTop: "1rem" }}>
            <InquiryChatPanel
              conversationId={chatId}
              title={chatTitle}
              onClose={() => setChatId(null)}
            />
          </div>
        )}
        {message && <p className="pill online">{message}</p>}
      </div>
    </AppShell>
  );
}
