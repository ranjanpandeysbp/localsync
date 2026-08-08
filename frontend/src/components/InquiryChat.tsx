import { FormEvent, useEffect, useState } from "react";
import { api } from "../services/api";
import { useAuth } from "../store/auth";
import type { AdminSupportConversation, Conversation, InquiryMessage } from "../types";

export function InquiryChatPanel({
  conversationId,
  title,
  onClose,
  messagesPath,
  emptyHint = "Ask anything before placing a request.",
  placeholder = "Type a question…",
}: {
  conversationId: string;
  title: string;
  onClose?: () => void;
  messagesPath?: string;
  emptyHint?: string;
  placeholder?: string;
}) {
  const user = useAuth((s) => s.user);
  const [messages, setMessages] = useState<InquiryMessage[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const path = messagesPath || `/conversations/${conversationId}/messages`;

  async function load() {
    const { data } = await api.get<InquiryMessage[]>(path);
    setMessages(data);
  }

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(t);
  }, [conversationId, path]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    try {
      const { data } = await api.post<InquiryMessage>(path, {
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
        {messages.length === 0 && <p className="muted">{emptyHint}</p>}
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
          placeholder={placeholder}
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

export async function startOrOpenAdminSupport(
  providerId: string,
  initialMessage?: string,
): Promise<AdminSupportConversation> {
  const { data } = await api.post<AdminSupportConversation>("/support-conversations", {
    provider_id: providerId,
    initial_message: initialMessage || null,
  });
  return data;
}
