import { FormEvent, useEffect, useState } from "react";
import { api } from "../services/api";
import { useAuth } from "../store/auth";
import type { Conversation, InquiryMessage } from "../types";

export function InquiryChatPanel({
  conversationId,
  title,
  onClose,
}: {
  conversationId: string;
  title: string;
  onClose?: () => void;
}) {
  const user = useAuth((s) => s.user);
  const [messages, setMessages] = useState<InquiryMessage[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const { data } = await api.get<InquiryMessage[]>(`/conversations/${conversationId}/messages`);
    setMessages(data);
  }

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(t);
  }, [conversationId]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    try {
      const { data } = await api.post<InquiryMessage>(`/conversations/${conversationId}/messages`, {
        body,
      });
      setMessages((prev) => [...prev, data]);
      setBody("");
      setError("");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed to send";
      setError(String(msg));
    }
  }

  return (
    <div className="card inquiry-panel">
      <div className="topbar" style={{ marginBottom: "0.75rem" }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        {onClose && (
          <button className="btn secondary" type="button" onClick={onClose}>
            Close
          </button>
        )}
      </div>
      <div className="chat-box">
        {messages.length === 0 && <p className="muted">Ask anything before placing a request.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`bubble ${m.sender_id === user?.id ? "mine" : ""}`}>
            {m.body}
          </div>
        ))}
      </div>
      <form onSubmit={send} style={{ display: "flex", gap: "0.5rem" }}>
        <input
          style={{ flex: 1 }}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Type a question…"
        />
        <button className="btn" type="submit">
          Send
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export async function startOrOpenChat(
  providerId: string,
  categoryId?: number | null,
  initialMessage?: string,
): Promise<Conversation> {
  const { data } = await api.post<Conversation>("/conversations", {
    provider_id: providerId,
    category_id: categoryId || null,
    initial_message: initialMessage || null,
  });
  return data;
}

export async function startProviderChatWithConsumer(
  consumerId: string,
  categoryId?: number | null,
  initialMessage?: string,
): Promise<Conversation> {
  const { data } = await api.post<Conversation>("/conversations/with-consumer", {
    consumer_id: consumerId,
    category_id: categoryId || null,
    initial_message: initialMessage || null,
  });
  return data;
}
