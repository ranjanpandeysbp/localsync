import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { useWebSocket } from "../hooks/useWebSocket";
import { api } from "../services/api";
import { useAuth } from "../store/auth";
import type { ChatMessage, Order } from "../types";

export function OrderPage() {
  const { id } = useParams();
  const user = useAuth((s) => s.user);
  const [order, setOrder] = useState<Order | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [body, setBody] = useState("");
  const [otp, setOtp] = useState("");
  const [score, setScore] = useState("5");
  const [comment, setComment] = useState("");
  const [note, setNote] = useState("");

  async function load() {
    if (!id) return;
    const [o, m] = await Promise.all([
      api.get<Order>(`/orders/${id}`),
      api.get<ChatMessage[]>(`/orders/${id}/messages`),
    ]);
    setOrder(o.data);
    setMessages(m.data);
  }

  useWebSocket((msg) => {
    const m = msg as { type?: string; payload?: ChatMessage & { order_id?: string; status?: string } };
    if (m.type === "chat_message" && m.payload?.order_id === id) {
      setMessages((prev) => [...prev, m.payload as ChatMessage]);
    }
    if (m.type === "order_completed" || m.type === "order_status") void load();
  });

  useEffect(() => {
    void load();
  }, [id]);

  async function sendChat(e: FormEvent) {
    e.preventDefault();
    if (!id || !body.trim()) return;
    const { data } = await api.post<ChatMessage>(`/orders/${id}/messages`, { body });
    setMessages((prev) => [...prev, data]);
    setBody("");
  }

  async function setStatus(status: Order["status"]) {
    if (!id) return;
    try {
      await api.patch(`/orders/${id}/status`, { status });
      setNote(`Order marked ${status.replaceAll("_", " ").toLowerCase()}`);
      await load();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Could not update status";
      setNote(String(msg));
    }
  }

  async function complete(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    await api.post(`/orders/${id}/complete`, { otp });
    setNote("Order completed");
    await load();
  }

  async function rate(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    try {
      await api.post(`/orders/${id}/ratings`, { score: Number(score), comment: comment || null });
      setNote("Thanks for the rating — it helps others trust this marketplace");
      setComment("");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Could not submit rating";
      setNote(String(msg));
    }
  }

  const isConsumer = user?.id === order?.consumer_id;
  const isProvider = user?.id === order?.provider_id;
  const open =
    order &&
    order.status !== "COMPLETED" &&
    order.status !== "CANCELLED";

  return (
    <AppShell title="Order">
      <div className="card">
        <Link to={isProvider ? "/provider/orders" : "/consumer/orders"}>← Back</Link>
        {order && (
          <>
            <h2>Order · ₹{order.agreed_price}</h2>
            <p className="muted">
              {order.fulfillment_type.replaceAll("_", " ")} ·{" "}
              {(order.payment_mode || "CASH").replaceAll("_", " ")} · {order.status}
            </p>
            {isConsumer && order.completion_otp && open && (
              <p className="pill online">Share OTP only at handover: {order.completion_otp}</p>
            )}
            {open && (
              <div className="nav-actions" style={{ margin: "0.75rem 0" }}>
                {order.status === "CONFIRMED" && (
                  <button className="btn" type="button" onClick={() => void setStatus("IN_PROGRESS")}>
                    Mark in progress
                  </button>
                )}
                {(order.status === "CONFIRMED" || order.status === "IN_PROGRESS") && (
                  <>
                    <button
                      className="btn secondary"
                      type="button"
                      onClick={() => void setStatus("DISPUTED")}
                    >
                      Mark disputed
                    </button>
                    <button
                      className="btn secondary"
                      type="button"
                      onClick={() => void setStatus("CANCELLED")}
                    >
                      Cancel order
                    </button>
                  </>
                )}
                {order.status === "DISPUTED" && (
                  <button className="btn" type="button" onClick={() => void setStatus("IN_PROGRESS")}>
                    Resume in progress
                  </button>
                )}
              </div>
            )}
          </>
        )}

        <h3>Chat</h3>
        <div className="chat-box">
          {messages.map((m) => (
            <div key={m.id} className={`bubble ${m.sender_id === user?.id ? "mine" : ""}`}>
              {m.body}
            </div>
          ))}
        </div>
        {open && (
          <form onSubmit={sendChat} style={{ display: "flex", gap: "0.5rem" }}>
            <input
              style={{ flex: 1 }}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Message…"
            />
            <button className="btn" type="submit">
              Send
            </button>
          </form>
        )}

        {isProvider && open && (
          <form onSubmit={complete} style={{ marginTop: "1.25rem" }}>
            <h3>Complete with OTP</h3>
            <p className="muted">Ask the consumer for their OTP at handover / delivery.</p>
            <div className="field">
              <label>Consumer OTP</label>
              <input value={otp} onChange={(e) => setOtp(e.target.value)} required maxLength={6} />
            </div>
            <button className="btn" type="submit">
              Mark completed
            </button>
          </form>
        )}

        {order?.status === "COMPLETED" && (
          <form onSubmit={rate} style={{ marginTop: "1.25rem" }}>
            <h3>{isConsumer ? "Rate this provider" : isProvider ? "Rate this consumer" : "Rate"}</h3>
            <p className="muted">
              Scores and comments are visible on profiles and help build mutual trust.
            </p>
            <div className="field">
              <label>Score (1–5)</label>
              <input
                type="number"
                min={1}
                max={5}
                value={score}
                onChange={(e) => setScore(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>Comment</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder={
                  isConsumer
                    ? "Was the work timely and professional?"
                    : "Was the consumer cooperative and clear?"
                }
              />
            </div>
            <button className="btn" type="submit">
              Submit rating &amp; comment
            </button>
          </form>
        )}
        {note && <p className="pill online">{note}</p>}
      </div>
    </AppShell>
  );
}
