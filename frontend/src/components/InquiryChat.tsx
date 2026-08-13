import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../services/api";
import { useAuth } from "../store/auth";
import type { AdminSupportConversation, Conversation } from "../types";

type ChatRow = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

function formatChatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function InquiryChatPanel({
  conversationId,
  title,
  subtitle,
  avatarLabel,
  statusLabel,
  statusTone,
  onClose,
  messagesPath,
  emptyHint = "Ask anything before placing a request.",
  placeholder = "Type a message…",
  className,
  autoFocus = false,
  mode = "inline",
  composeDisabled = false,
  onMessagesLoaded,
}: {
  conversationId: string;
  title: string;
  subtitle?: string;
  avatarLabel?: string;
  statusLabel?: string;
  statusTone?: "online" | "offline" | "neutral";
  onClose?: () => void;
  messagesPath?: string;
  emptyHint?: string;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  /** overlay = modal portal; inline = embedded panel */
  mode?: "overlay" | "inline";
  composeDisabled?: boolean;
  onMessagesLoaded?: () => void;
}) {
  const user = useAuth((s) => s.user);
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatBoxRef = useRef<HTMLDivElement>(null);
  const onMessagesLoadedRef = useRef(onMessagesLoaded);
  const notifiedReadRef = useRef(false);
  const path = messagesPath || `/conversations/${conversationId}/messages`;
  const initial = (avatarLabel || title).trim().slice(0, 1).toUpperCase() || "C";

  onMessagesLoadedRef.current = onMessagesLoaded;

  async function load(opts?: { notify?: boolean }) {
    const { data } = await api.get<ChatRow[]>(path);
    setMessages(data);
    if (opts?.notify && !notifiedReadRef.current) {
      notifiedReadRef.current = true;
      onMessagesLoadedRef.current?.();
    }
  }

  useEffect(() => {
    notifiedReadRef.current = false;
    void load({ notify: true });
    const t = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(t);
  }, [conversationId, path]);

  useEffect(() => {
    if (autoFocus && !composeDisabled) {
      inputRef.current?.focus();
    }
  }, [autoFocus, conversationId, composeDisabled]);

  useEffect(() => {
    const box = chatBoxRef.current;
    if (box) {
      box.scrollTop = box.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (mode !== "overlay") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [mode, onClose]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!body.trim() || sending || composeDisabled) return;
    setSending(true);
    try {
      const { data } = await api.post<ChatRow>(path, {
        body: body.trim(),
      });
      setMessages((prev) => [...prev, data]);
      setBody("");
      setError("");
      inputRef.current?.focus();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed to send";
      setError(String(msg));
    } finally {
      setSending(false);
    }
  }

  const panel = (
    <div
      className={`inquiry-sleek${mode === "inline" ? " inquiry-sleek-inline" : ""}${
        className ? ` ${className}` : ""
      }`}
    >
      <header className="inquiry-sleek-header">
        <div className="inquiry-sleek-identity">
          <span className="inquiry-sleek-avatar" aria-hidden="true">
            {initial}
          </span>
          <div className="inquiry-sleek-titles">
            <h3>{title}</h3>
            <div className="inquiry-sleek-meta">
              {subtitle && <span className="inquiry-sleek-subtitle">{subtitle}</span>}
              {statusLabel && (
                <span
                  className={`inquiry-sleek-status inquiry-sleek-status-${statusTone || "neutral"}`}
                >
                  {statusLabel}
                </span>
              )}
            </div>
          </div>
        </div>
        {onClose && (
          <button
            className="inquiry-sleek-close"
            type="button"
            onClick={onClose}
            aria-label="Close chat"
          >
            ×
          </button>
        )}
      </header>

      <div className="inquiry-sleek-thread" ref={chatBoxRef}>
        {messages.length === 0 ? (
          <div className="inquiry-sleek-empty">
            <p>{emptyHint}</p>
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === user?.id;
            return (
              <div key={m.id} className={`inquiry-sleek-row${mine ? " is-mine" : ""}`}>
                <div className={`inquiry-sleek-bubble${mine ? " is-mine" : ""}`}>
                  <p>{m.body}</p>
                  {m.created_at && (
                    <time dateTime={m.created_at}>{formatChatTime(m.created_at)}</time>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {!composeDisabled ? (
        <form className="inquiry-sleek-compose" onSubmit={send}>
          <input
            ref={inputRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            disabled={sending}
            aria-label="Message"
          />
          <button
            className="inquiry-sleek-send"
            type="submit"
            disabled={sending || !body.trim()}
            aria-label={sending ? "Sending" : "Send message"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M5 12h12M13 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </form>
      ) : (
        <p className="inquiry-sleek-locked">Messaging is closed for this conversation.</p>
      )}
      {error && <p className="inquiry-sleek-error">{error}</p>}
    </div>
  );

  if (mode === "overlay") {
    return createPortal(
      <div
        className="inquiry-sleek-backdrop"
        onClick={() => onClose?.()}
        role="presentation"
      >
        <div
          className="inquiry-sleek-shell"
          role="dialog"
          aria-modal="true"
          aria-label={`Chat with ${title}`}
          onClick={(e) => e.stopPropagation()}
        >
          {panel}
        </div>
      </div>,
      document.body,
    );
  }

  return panel;
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
