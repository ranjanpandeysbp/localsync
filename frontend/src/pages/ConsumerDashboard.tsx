import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { AttachmentGallery, FilePicker } from "../components/Attachments";
import { InquiryChatPanel, startOrOpenChat } from "../components/InquiryChat";
import { MapsLink } from "../components/MapsLink";
import { ProfileCard } from "../components/ProfileCard";
import {
  flattenCategoryOptions,
  offerKindLabel,
  ProviderTrustBlock,
} from "../components/ProviderTrust";
import { useWebSocket } from "../hooks/useWebSocket";
import { api } from "../services/api";
import { useAuth } from "../store/auth";
import { playQuoteBell } from "../services/sounds";
import { uploadFiles } from "../services/uploads";
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
  details: "My details",
  requests: "My requests",
  post: "Post a request",
  providers: "Providers in category",
  inquiries: "Recent inquiries",
  quotes: "All quotes received",
  orders: "Complete Orders",
};

export function ConsumerDashboard() {
  const { section } = useParams<{ section?: string }>();
  const navigate = useNavigate();
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
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [form, setForm] = useState({
    category_id: "",
    title: "",
    description: "",
    longitude: "",
    latitude: "",
    search_radius_km: "5",
    target_mode: "broadcast" as "broadcast" | "selected",
  });
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
    const m = msg as { type?: string; payload?: Quote & { conversation_id?: string } };
    if (m.type === "new_quote") {
      void playQuoteBell();
      setToast(`New quote: ₹${m.payload?.price_quote}`);
      void refresh();
    }
    if (m.type === "inquiry_message") {
      setToast("New reply from a provider");
      void loadConversations();
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
    if (!form.category_id && opts[0]) {
      setForm((f) => ({ ...f, category_id: String(opts[0].id) }));
    }
    if (catId) await loadProviders(catId);
    await loadConversations();
  }

  useEffect(() => {
    if (!invalidSection) void refresh();
  }, [tab, invalidSection]);

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

  const onlineProviders = useMemo(() => providers.filter((p) => p.is_online), [providers]);
  const offlineProviders = useMemo(() => providers.filter((p) => !p.is_online), [providers]);
  const tabProviders = providerTab === "online" ? onlineProviders : offlineProviders;

  if (invalidSection) {
    return <Navigate to="/consumer/details" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (form.target_mode === "selected" && selectedProviders.length === 0) {
        setToast("Select at least one provider, or switch to broadcast");
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
        target_provider_ids: form.target_mode === "selected" ? selectedProviders : [],
      });
      const targeted = data.target_mode === "TARGETED";
      const mode = targeted
        ? `to ${data.matched_provider_count ?? selectedProviders.length} selected provider(s)`
        : lat != null && lon != null
          ? "within 5 km"
          : user?.pincode
            ? `by pincode ${user.pincode}`
            : "";
      setToast(
        targeted
          ? `Request sent ${mode}` + (uploaded.length ? ` · ${uploaded.length} file(s)` : "")
          : `Request broadcast to ${data.matched_provider_count ?? 0} nearby providers${mode ? ` (${mode})` : ""}` +
              (uploaded.length ? ` · ${uploaded.length} file(s)` : ""),
      );
      setForm((f) => ({ ...f, title: "", description: "" }));
      setFiles([]);
      setSelectedProviders([]);
      await refresh();
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
    setForm((f) => ({ ...f, target_mode: "selected" }));
    navigate("/consumer/post");
  }

  async function chatWith(provider: ProviderCatalogItem) {
    try {
      const conv = await startOrOpenChat(
        provider.user_id,
        Number(form.category_id) || provider.category_id,
        `Hi ${provider.business_name}, I have a quick question about ${provider.category_name || "your services"}.`,
      );
      setActiveChatId(conv.id);
      setActiveChatTitle(`${provider.business_name} · ${provider.full_name}`);
      await loadConversations();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Cannot start chat";
      setToast(String(msg));
    }
  }

  return (
    <AppShell title={TITLES[tab]} connected={connected} onRefresh={refresh}>
      {toast && (
        <div className="toast" onClick={() => setToast("")}>
          {toast}
        </div>
      )}

      {tab === "details" && <ProfileCard title="My details" />}

      {tab === "providers" && (
        <div className="card">
          <h2>Providers in category</h2>
          <p className="muted">
            Select a category to browse providers. Chat before requesting, or tick one/more providers
            for a targeted request.
          </p>
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            {matchHint}
          </p>
          {selectedProviders.length > 0 && (
            <div className="nav-actions" style={{ marginBottom: "0.75rem" }}>
              <span className="pill online">{selectedProviders.length} selected</span>
              <button className="btn" type="button" onClick={goPostToSelected}>
                Send request to selected
              </button>
              <button className="btn secondary" type="button" onClick={() => setSelectedProviders([])}>
                Clear selection
              </button>
            </div>
          )}
          <div className="field" style={{ maxWidth: 420 }}>
            <label>Category / subcategory</label>
            <select
              value={form.category_id}
              onChange={(e) => {
                setForm({ ...form, category_id: e.target.value });
                setProviderTab("online");
                setSelectedProviders([]);
              }}
            >
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="tabs">
            <button
              type="button"
              className={`tab ${providerTab === "online" ? "active" : ""}`}
              onClick={() => setProviderTab("online")}
            >
              Online ({onlineProviders.length})
            </button>
            <button
              type="button"
              className={`tab ${providerTab === "offline" ? "active" : ""}`}
              onClick={() => setProviderTab("offline")}
            >
              Offline ({offlineProviders.length})
            </button>
          </div>

          <div className="list" style={{ marginTop: "0.75rem" }}>
            {tabProviders.length === 0 && (
              <p className="muted">No {providerTab} providers in this category yet.</p>
            )}
            {tabProviders.map((p) => (
              <div key={p.user_id} className="list-item">
                <div className="topbar" style={{ marginBottom: "0.35rem" }}>
                  <label style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                    <input
                      type="checkbox"
                      checked={selectedProviders.includes(p.user_id)}
                      onChange={() => toggleProvider(p.user_id)}
                      style={{ marginTop: "0.25rem" }}
                    />
                    <div>
                      <strong>
                        <Link to={`/p/${p.user_id}`}>{p.business_name}</Link>
                      </strong>
                      <div className="muted">{p.full_name}</div>
                    </div>
                  </label>
                  <span className={`pill ${p.is_online ? "online" : "offline"}`}>
                    {p.is_online ? "Online" : "Offline"}
                  </span>
                </div>
                <p className="muted">
                  {offerKindLabel(p.offer_kind)}
                  {p.categories?.length ? ` · ${p.categories.join(", ")}` : ""}
                </p>
                {(p.offerings_detail || p.description) && (
                  <p className="muted">{p.offerings_detail || p.description}</p>
                )}
                <p className="muted">
                  Rating {p.average_rating.toFixed(1)} ({p.rating_count}) · radius {p.max_radius_km}{" "}
                  km
                  {p.opening_time && p.closing_time
                    ? ` · ${p.opening_time}–${p.closing_time}`
                    : ""}
                  {p.gst_number ? ` · GST ${p.gst_number}` : ""}
                </p>
                <MapsLink
                  latitude={p.latitude}
                  longitude={p.longitude}
                  maps_url={p.maps_url}
                  label={p.location_label || undefined}
                />
                <div className="nav-actions" style={{ marginTop: "0.6rem" }}>
                  <Link className="btn secondary" to={`/p/${p.user_id}`}>
                    View profile
                  </Link>
                  {p.is_online ? (
                    <button className="btn" type="button" onClick={() => void chatWith(p)}>
                      Chat & ask
                    </button>
                  ) : (
                    <span className="muted">Come online later to chat</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {activeChatId && (
            <div style={{ marginTop: "1rem" }}>
              <InquiryChatPanel
                conversationId={activeChatId}
                title={activeChatTitle}
                onClose={() => setActiveChatId(null)}
              />
            </div>
          )}
        </div>
      )}

      {tab === "inquiries" && (
        <div className="card">
          <h2>Recent inquiries</h2>
          {activeChatId ? (
            <InquiryChatPanel
              conversationId={activeChatId}
              title={activeChatTitle}
              onClose={() => setActiveChatId(null)}
            />
          ) : (
            <div className="list">
              {conversations.length === 0 && <p className="muted">No inquiries yet.</p>}
              {conversations.map((c) => (
                <div key={c.id} className="list-item">
                  <strong>{c.provider_business_name || c.provider_name}</strong>
                  <div className="muted">{c.last_message || "No messages yet"}</div>
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => {
                      setActiveChatId(c.id);
                      setActiveChatTitle(c.provider_business_name || c.provider_name || "Chat");
                    }}
                  >
                    Open chat
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "post" && (
        <form className="card" onSubmit={onSubmit} style={{ maxWidth: 640 }}>
          <h2>Post a request</h2>
          <p className="muted">
            Chat with providers first if you want. Then send to selected providers or broadcast
            nearby.
          </p>
          <div className="field">
            <label>Send to</label>
            <select
              value={form.target_mode}
              onChange={(e) =>
                setForm({
                  ...form,
                  target_mode: e.target.value as "broadcast" | "selected",
                })
              }
            >
              <option value="broadcast">Broadcast to nearby providers</option>
              <option value="selected">
                Selected providers only ({selectedProviders.length})
              </option>
            </select>
          </div>
          {form.target_mode === "selected" && (
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              {selectedProviders.length === 0
                ? "Pick providers under Providers in category, then return here."
                : `${selectedProviders.length} provider(s) will receive this request.`}{" "}
              <Link to="/consumer/providers">Browse providers</Link>
            </p>
          )}
          <div className="field">
            <label>Category / subcategory</label>
            <select
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              required
            >
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Title</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Leaking kitchen sink"
            />
          </div>
          <div className="field">
            <label>Details</label>
            <textarea
              required
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <FilePicker files={files} onChange={setFiles} disabled={busy} />
          <div className="grid grid-2">
            <div className="field">
              <label>Longitude{hasCoords ? "" : " (optional if pincode set)"}</label>
              <input
                value={form.longitude}
                onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                required={hasCoords || !user?.pincode}
              />
            </div>
            <div className="field">
              <label>Latitude{hasCoords ? "" : " (optional if pincode set)"}</label>
              <input
                value={form.latitude}
                onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                required={hasCoords || !user?.pincode}
              />
            </div>
          </div>
          {form.latitude && form.longitude ? (
            <MapsLink latitude={Number(form.latitude)} longitude={Number(form.longitude)} />
          ) : user?.pincode ? (
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              Matching by pincode {user.pincode} — providers in the same pincode will be notified.
            </p>
          ) : (
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              Add GPS or a pincode in My profile for nearby matching.
            </p>
          )}
          <div className="field">
            <label>Search radius (km)</label>
            <input
              type="number"
              min={1}
              max={50}
              value={form.search_radius_km}
              onChange={(e) => setForm({ ...form, search_radius_km: e.target.value })}
              disabled={hasCoords}
            />
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              {hasCoords
                ? "Coordinates found: nearby matching uses a fixed 5 km radius."
                : "No coordinates found: providers are matched by pincode."}
            </p>
          </div>
          <button className="btn" type="submit" disabled={busy}>
            {busy
              ? "Sending…"
              : form.target_mode === "selected"
                ? "Send to selected providers"
                : "Broadcast request"}
          </button>
        </form>
      )}

      {tab === "requests" && (
        <div className="card">
          <h2>My requests</h2>
          <div className="list">
            {requests.length === 0 && <p className="muted">No requests yet.</p>}
            {requests.map((r) => (
              <div key={r.id} className="list-item">
                <strong>{r.title}</strong>
                <div className="muted">
                  {r.status} · {r.search_radius_km} km
                  {r.attachments?.length ? ` · ${r.attachments.length} attachment(s)` : ""}
                </div>
                <MapsLink latitude={r.latitude} longitude={r.longitude} />
                <AttachmentGallery attachments={r.attachments} />
                <Link to={`/consumer/requests/${r.id}`}>View quotes →</Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "quotes" && (
        <div className="card">
          <h2>All quotes received</h2>
          <div className="list">
            {receivedQuotes.length === 0 && <p className="muted">No quotes yet.</p>}
            {receivedQuotes.map((q) => (
              <div key={q.id} className="list-item">
                <strong>
                  ₹{q.price_quote} · ETA {q.estimated_days} day{q.estimated_days === 1 ? "" : "s"}
                </strong>
                <div className="muted">
                  {q.request_title || "Request"} · {q.provider_name} · rating {q.provider_rating ?? 0}{" "}
                  · {q.status}
                </div>
                <ProviderTrustBlock trust={q.provider_trust} compact />
                {q.message && <p>{q.message}</p>}
                <AttachmentGallery attachments={q.attachments} />
                <div className="nav-actions">
                  <Link to={`/consumer/requests/${q.request_id}`}>Open request →</Link>
                </div>
                <div className="muted" style={{ fontSize: "0.8rem" }}>
                  {new Date(q.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "orders" && (
        <div className="card">
          <h2>Complete Orders</h2>
          <div className="list">
            {orders.length === 0 && <p className="muted">No orders yet.</p>}
            {orders.map((o) => (
              <div key={o.id} className="list-item">
                <strong>₹{o.agreed_price}</strong> · {o.status}
                <div>
                  <Link to={`/orders/${o.id}`}>Open order →</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}
