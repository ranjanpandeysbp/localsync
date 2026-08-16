import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { InquiryChatPanel } from "../components/InquiryChat";
import { useWebSocket } from "../hooks/useWebSocket";
import { api } from "../services/api";
import { useAuth } from "../store/auth";
import type { Order } from "../types";

export function OrderPage() {
  const { id } = useParams();
  const user = useAuth((s) => s.user);
  const [order, setOrder] = useState<Order | null>(null);
  const [otp, setOtp] = useState("");
  const [score, setScore] = useState("5");
  const [comment, setComment] = useState("");
  const [note, setNote] = useState("");

  async function load() {
    if (!id) return;
    const { data } = await api.get<Order>(`/orders/${id}`);
    setOrder(data);
  }

  useWebSocket((msg) => {
    const m = msg as { type?: string };
    if (m.type === "order_completed" || m.type === "order_status") void load();
  });

  useEffect(() => {
    void load();
  }, [id]);

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
    !!order &&
    order.status !== "COMPLETED" &&
    order.status !== "CANCELLED" &&
    order.status !== "REJECTED";
  const chatPeer = isProvider ? "Consumer" : "Provider";

  return (
    <AppShell title="Order">
      <div className="page-stack narrow">
        <header className="page-hero">
          <Link
            className="page-back"
            to={isProvider ? "/provider/orders" : "/consumer/orders"}
          >
            ← Back to orders
          </Link>
          {order ? (
            <>
              <div className="page-hero-row">
                <div>
                  <p className="dash-eyebrow">Order</p>
                  <h2>₹{order.agreed_price}</h2>
                  <p className="muted page-meta">
                    {order.request_title && (
                      <>
                        <span>{order.request_title}</span>
                        <span aria-hidden="true">·</span>
                      </>
                    )}
                    <span>{order.fulfillment_type.replaceAll("_", " ")}</span>
                    <span aria-hidden="true">·</span>
                    <span>{(order.payment_mode || "CASH").replaceAll("_", " ")}</span>
                    <span aria-hidden="true">·</span>
                    <span>{order.status === "REJECTED" ? "Rejected" : order.status}</span>
                  </p>
                </div>
                <span className={`pill ${open ? "online" : "offline"}`}>
                  {order.status === "REJECTED" ? "Rejected" : order.status}
                </span>
              </div>
              {order.status === "REJECTED" && (
                <p className="page-note">
                  This quote was not selected — the consumer accepted another provider’s quote for
                  the same request.
                </p>
              )}
              {isConsumer && order.completion_otp && open && (
                <p className="page-note">Share OTP only at handover: {order.completion_otp}</p>
              )}
              {note && <p className="page-note">{note}</p>}
            </>
          ) : (
            <h2>Order</h2>
          )}
        </header>

        {order && open && (
          <section className="page-panel">
            <div className="page-actions">
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
          </section>
        )}

        {id && open && (
          <InquiryChatPanel
            conversationId={id}
            mode="inline"
            title={chatPeer}
            subtitle="Order chat"
            avatarLabel={chatPeer}
            statusLabel="Open"
            statusTone="online"
            messagesPath={`/orders/${id}/messages`}
            emptyHint="Coordinate delivery, payment, and timing here."
            placeholder="Write a message…"
            autoFocus
          />
        )}

        {isProvider && open && (
          <form className="page-panel page-form" onSubmit={complete}>
            <h2>Complete with OTP</h2>
            <p className="page-lead">Ask the consumer for their OTP at handover / delivery.</p>
            <div className="field">
              <label>Consumer OTP</label>
              <input value={otp} onChange={(e) => setOtp(e.target.value)} required maxLength={6} />
            </div>
            <div className="page-actions">
              <button className="btn" type="submit">
                Mark completed
              </button>
            </div>
          </form>
        )}

        {order?.status === "COMPLETED" && (
          <form className="page-panel page-form" onSubmit={rate}>
            <h2>{isConsumer ? "Rate this provider" : isProvider ? "Rate this consumer" : "Rate"}</h2>
            <p className="page-lead">
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
            <div className="page-actions">
              <button className="btn" type="submit">
                Submit rating &amp; comment
              </button>
            </div>
          </form>
        )}
      </div>
    </AppShell>
  );
}
