import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { AdminOrdersDashboard } from "../components/AdminOrdersDashboard";
import { AppShell } from "../components/AppShell";
import { mediaSrc } from "../components/Attachments";
import { InquiryChatPanel } from "../components/InquiryChat";
import { MapsLink } from "../components/MapsLink";
import { offerKindClass, offerKindLabel } from "../components/ProviderTrust";
import { api } from "../services/api";
import { useAdminNav } from "../store/adminNav";
import type {
  AdminOrder,
  AdminProvider,
  AdminSupportConversation,
  Category,
  OfferKind,
  SmtpConfig,
  User,
} from "../types";

type AdminTab = "providers" | "consumers" | "orders" | "categories" | "messages" | "config";

const TITLES: Record<AdminTab, string> = {
  providers: "Providers",
  consumers: "Consumers",
  orders: "Order dashboard",
  categories: "Categories",
  messages: "Provider messages",
  config: "Config",
};

export function AdminPage() {
  const { section } = useParams<{ section?: string }>();
  const tab = (
    section &&
    ["providers", "consumers", "orders", "categories", "messages", "config"].includes(section)
      ? section
      : "providers"
  ) as AdminTab;
  const refreshCounts = useAdminNav((s) => s.refreshCounts);

  const [providerFilter, setProviderFilter] = useState<
    "ALL" | "PENDING" | "APPROVED" | "REJECTED" | "MESSAGES"
  >("ALL");
  const [categories, setCategories] = useState<Category[]>([]);
  const [providers, setProviders] = useState<AdminProvider[]>([]);
  const [consumers, setConsumers] = useState<User[]>([]);
  const [supportThreads, setSupportThreads] = useState<AdminSupportConversation[]>([]);
  const [activeSupportId, setActiveSupportId] = useState<string | null>(null);
  const [activeSupportTitle, setActiveSupportTitle] = useState("");
  const [ordersProvider, setOrdersProvider] = useState<AdminProvider | null>(null);
  const [providerOrders, setProviderOrders] = useState<AdminOrder[]>([]);
  const [ordersBusy, setOrdersBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    parent_id: "",
    kind: "BOTH" as OfferKind,
  });
  const [smtp, setSmtp] = useState({
    host: "",
    port: "587",
    username: "",
    password: "",
    from_email: "",
    from_name: "LocalSync",
    use_tls: true,
    use_ssl: false,
    is_enabled: false,
    password_set: false,
  });
  const [testEmail, setTestEmail] = useState("");
  const [smtpBusy, setSmtpBusy] = useState(false);
  const [categoryView, setCategoryView] = useState<"manage" | "create">("manage");
  const [categorySearch, setCategorySearch] = useState("");

  const invalidSection =
    !!section &&
    !["providers", "consumers", "orders", "categories", "messages", "config"].includes(section);

  async function load() {
    setError("");
    try {
      if (tab === "config") {
        const { data } = await api.get<SmtpConfig>("/admin/config/smtp");
        setSmtp({
          host: data.host || "",
          port: String(data.port || 587),
          username: data.username || "",
          password: "",
          from_email: data.from_email || "",
          from_name: data.from_name || "LocalSync",
          use_tls: data.use_tls,
          use_ssl: data.use_ssl,
          is_enabled: data.is_enabled,
          password_set: data.password_set,
        });
        return;
      }
      if (tab === "messages") {
        const { data } = await api.get<AdminSupportConversation[]>("/support-conversations");
        setSupportThreads(data);
        return;
      }
      if (tab === "orders") {
        await refreshCounts();
        return;
      }
      const [cats, provs, cons, support] = await Promise.all([
        api.get<Category[]>("/categories/admin/all"),
        api.get<AdminProvider[]>("/admin/providers"),
        api.get<User[]>("/admin/consumers"),
        api.get<AdminSupportConversation[]>("/support-conversations"),
      ]);
      setCategories(cats.data);
      setProviders(provs.data);
      setConsumers(cons.data);
      setSupportThreads(support.data);
      await refreshCounts();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed to load admin data";
      setError(String(msg));
    }
  }

  useEffect(() => {
    if (!invalidSection) void load();
  }, [tab, invalidSection]);

  useEffect(() => {
    if (tab !== "categories") {
      setCategoryView("manage");
      setCategorySearch("");
    }
  }, [tab]);

  const supportByProvider = useMemo(() => {
    const map = new Map<string, AdminSupportConversation>();
    for (const t of supportThreads) {
      map.set(t.provider_id, t);
    }
    return map;
  }, [supportThreads]);

  const providerFilterCounts = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    let messages = 0;
    for (const p of providers) {
      if (p.verification_status === "PENDING") pending += 1;
      else if (p.verification_status === "APPROVED") approved += 1;
      else if (p.verification_status === "REJECTED") rejected += 1;
      if ((supportByProvider.get(p.user_id)?.unread_count || 0) > 0) messages += 1;
    }
    return {
      ALL: providers.length,
      PENDING: pending,
      APPROVED: approved,
      REJECTED: rejected,
      MESSAGES: messages,
    };
  }, [providers, supportByProvider]);

  const filteredProviders = useMemo(() => {
    if (providerFilter === "MESSAGES") {
      return providers.filter((p) => (supportByProvider.get(p.user_id)?.unread_count || 0) > 0);
    }
    if (providerFilter === "ALL") return providers;
    return providers.filter((p) => p.verification_status === providerFilter);
  }, [providers, providerFilter, supportByProvider]);

  const parents = categories;

  const filteredParents = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    if (!q) return parents;

    const matches = (cat: Category) => {
      const haystack = [cat.name, cat.slug, cat.description || ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    };

    return parents
      .map((p) => {
        const parentMatch = matches(p);
        const matchingChildren = (p.children || []).filter(matches);
        if (parentMatch) return p;
        if (matchingChildren.length > 0) return { ...p, children: matchingChildren };
        return null;
      })
      .filter((p): p is Category => p !== null);
  }, [parents, categorySearch]);

  if (invalidSection) {
    return <Navigate to="/admin/providers" replace />;
  }

  function slugify(name: string) {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  async function createCategory(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post("/categories", {
        name: form.name,
        slug: form.slug || slugify(form.name),
        description: form.description || null,
        parent_id: form.parent_id ? Number(form.parent_id) : null,
        kind: form.kind,
      });
      setForm({ name: "", slug: "", description: "", parent_id: "", kind: "BOTH" });
      setNote(form.parent_id ? "Subcategory created" : "Category created");
      setCategoryView("manage");
      await load();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed to create category";
      setError(String(msg));
    }
  }

  function openCreateCategory(parentId = "") {
    setForm({
      name: "",
      slug: "",
      description: "",
      parent_id: parentId,
      kind: "BOTH",
    });
    setCategoryView("create");
    setError("");
  }

  function openAddSubcategory(p: Category) {
    setForm({
      name: "",
      slug: "",
      description: "",
      parent_id: String(p.id),
      kind: p.kind,
    });
    setCategoryView("create");
    setError("");
  }

  async function deactivate(id: number) {
    try {
      await api.post(`/categories/${id}/deactivate`);
      setNote("Category deactivated");
      await load();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed to deactivate";
      setError(String(msg));
    }
  }

  async function activate(id: number) {
    try {
      await api.post(`/categories/${id}/activate`);
      setNote("Category activated");
      await load();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed to activate";
      setError(String(msg));
    }
  }

  async function saveSmtp(e: FormEvent) {
    e.preventDefault();
    setSmtpBusy(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        host: smtp.host,
        port: Number(smtp.port),
        username: smtp.username || null,
        from_email: smtp.from_email,
        from_name: smtp.from_name,
        use_tls: smtp.use_tls,
        use_ssl: smtp.use_ssl,
        is_enabled: smtp.is_enabled,
      };
      if (smtp.password) payload.password = smtp.password;
      const { data } = await api.put<SmtpConfig>("/admin/config/smtp", payload);
      setSmtp({
        host: data.host || "",
        port: String(data.port || 587),
        username: data.username || "",
        password: "",
        from_email: data.from_email || "",
        from_name: data.from_name || "LocalSync",
        use_tls: data.use_tls,
        use_ssl: data.use_ssl,
        is_enabled: data.is_enabled,
        password_set: data.password_set,
      });
      setNote("SMTP settings saved");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed to save SMTP settings";
      setError(String(msg));
    } finally {
      setSmtpBusy(false);
    }
  }

  async function sendTestEmail(e: FormEvent) {
    e.preventDefault();
    setSmtpBusy(true);
    setError("");
    try {
      await api.post("/admin/config/smtp/test", { to_email: testEmail });
      setNote(`Test email sent to ${testEmail}`);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Test email failed";
      setError(String(msg));
    } finally {
      setSmtpBusy(false);
    }
  }

  async function verify(userId: string, status: "APPROVED" | "REJECTED") {
    try {
      await api.post(`/providers/${userId}/verify`, { verification_status: status });
      setNote(`Provider ${status.toLowerCase()}`);
      await load();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Verification failed";
      setError(String(msg));
    }
  }

  async function deleteUser(userId: string, label: string) {
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    setBusyId(userId);
    setError("");
    try {
      await api.delete(`/admin/users/${userId}`);
      setNote(`Deleted ${label}`);
      await load();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed to delete user";
      setError(String(msg));
    } finally {
      setBusyId(null);
    }
  }

  async function openProviderOrders(p: AdminProvider) {
    setOrdersProvider(p);
    setProviderOrders([]);
    setOrdersBusy(true);
    setError("");
    try {
      const { data } = await api.get<AdminOrder[]>("/admin/orders", {
        params: { provider_id: p.user_id },
      });
      setProviderOrders(data);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Could not load orders";
      setError(String(msg));
      setOrdersProvider(null);
    } finally {
      setOrdersBusy(false);
    }
  }

  return (
    <AppShell title={TITLES[tab] || "Admin"} onRefresh={load}>
      {note && <p className="pill online" style={{ marginBottom: "1rem" }}>{note}</p>}
      {error && <p className="error" style={{ marginBottom: "1rem" }}>{error}</p>}

      {tab === "providers" && (
        <div className="card">
          <h2>All providers</h2>
          <p className="muted">Review providers, open chat, and filter by status or new messages.</p>

          <div className="admin-filter-bar" role="tablist" aria-label="Provider filters">
            {(
              [
                { id: "ALL", label: "All" },
                { id: "PENDING", label: "Pending" },
                { id: "APPROVED", label: "Approved" },
                { id: "REJECTED", label: "Rejected" },
                { id: "MESSAGES", label: "New messages" },
              ] as const
            ).map((f) => {
              const count = providerFilterCounts[f.id];
              const active = providerFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`admin-filter-chip ${active ? "active" : ""} ${
                    f.id === "MESSAGES" && count > 0 ? "has-alert" : ""
                  }`}
                  onClick={() => setProviderFilter(f.id)}
                >
                  <span>{f.label}</span>
                  <span
                    className={`admin-filter-count ${
                      f.id === "MESSAGES" && count > 0 ? "alert" : ""
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="list admin-provider-list">
            {filteredProviders.length === 0 && (
              <p className="muted">
                {providerFilter === "MESSAGES"
                  ? "No providers with new messages."
                  : "No providers in this filter."}
              </p>
            )}
            {filteredProviders.map((p) => {
              const categories =
                (p.categories && p.categories.length > 0
                  ? p.categories.join(", ")
                  : p.category_name) || "No category";
              const statusLabel =
                p.verification_status === "PENDING"
                  ? "Pending review"
                  : p.verification_status === "APPROVED"
                    ? "Approved"
                    : "Rejected";
              const support = supportByProvider.get(p.user_id);
              const unreadFromProvider = support?.unread_count || 0;
              return (
                <article key={p.user_id} className="list-item admin-provider-card">
                  <header className="admin-provider-card-head">
                    <div className="admin-provider-card-title">
                      <h3>
                        <Link to={`/admin/providers/${p.user_id}`}>{p.business_name}</Link>
                      </h3>
                      <p className="admin-provider-card-owner">{p.full_name}</p>
                    </div>
                    <div className="admin-provider-card-badges">
                      <Link
                        to={`/admin/providers/${p.user_id}#messaging`}
                        className="admin-msg-icon-btn"
                        title={
                          unreadFromProvider > 0
                            ? `${unreadFromProvider} unread · Open chat`
                            : "Open chat"
                        }
                        aria-label={
                          unreadFromProvider > 0
                            ? `Open chat, ${unreadFromProvider} unread`
                            : `Chat with ${p.business_name}`
                        }
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          aria-hidden="true"
                        >
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        {unreadFromProvider > 0 && (
                          <span className="nav-badge admin-msg-badge">
                            {unreadFromProvider > 99 ? "99+" : unreadFromProvider}
                          </span>
                        )}
                      </Link>
                      <span
                        className={`pill ${
                          p.verification_status === "APPROVED"
                            ? "online"
                            : p.verification_status === "PENDING"
                              ? "pending"
                              : "offline"
                        }`}
                      >
                        {statusLabel}
                      </span>
                      <span className={`pill ${p.is_online ? "online" : "offline"}`}>
                        {p.is_online ? "Online" : "Offline"}
                      </span>
                    </div>
                  </header>

                  <dl className="admin-provider-meta">
                    <div>
                      <dt>Contact</dt>
                      <dd>
                        {p.phone_number}
                        {p.email ? (
                          <>
                            <br />
                            {p.email}
                          </>
                        ) : null}
                      </dd>
                    </div>
                    <div>
                      <dt>Services</dt>
                      <dd>
                        {offerKindLabel(p.offer_kind)}
                        <br />
                        {categories}
                      </dd>
                    </div>
                    <div>
                      <dt>Rating</dt>
                      <dd>
                        {p.average_rating.toFixed(1)} / 5
                        <span className="muted">
                          {" "}
                          ({p.rating_count} review{p.rating_count === 1 ? "" : "s"})
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt>GST</dt>
                      <dd>{p.gst_number || "Not provided"}</dd>
                    </div>
                    <div className="admin-provider-meta-wide">
                      <dt>Location</dt>
                      <dd>
                        {p.location_label || "No location label"}
                        <div className="admin-provider-maps">
                          <MapsLink
                            latitude={p.latitude}
                            longitude={p.longitude}
                            maps_url={p.maps_url}
                            label={p.location_label || undefined}
                          />
                        </div>
                      </dd>
                    </div>
                    {p.aadhaar_doc_url && (
                      <div>
                        <dt>Documents</dt>
                        <dd>
                          <a href={mediaSrc(p.aadhaar_doc_url)} target="_blank" rel="noreferrer">
                            Aadhaar document
                          </a>
                        </dd>
                      </div>
                    )}
                  </dl>

                  <footer className="admin-provider-card-actions">
                    <div className="admin-provider-card-actions-main">
                      <Link className="btn" to={`/admin/providers/${p.user_id}`}>
                        Details
                      </Link>
                      <button
                        className="btn secondary"
                        type="button"
                        onClick={() => void openProviderOrders(p)}
                      >
                        Orders
                      </button>
                      {p.verification_status === "PENDING" && (
                        <>
                          <button
                            className="btn"
                            type="button"
                            onClick={() => void verify(p.user_id, "APPROVED")}
                          >
                            Approve
                          </button>
                          <button
                            className="btn secondary"
                            type="button"
                            onClick={() => void verify(p.user_id, "REJECTED")}
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {p.verification_status === "APPROVED" && (
                        <button
                          className="btn secondary"
                          type="button"
                          onClick={() => void verify(p.user_id, "REJECTED")}
                        >
                          Revoke
                        </button>
                      )}
                      {p.verification_status === "REJECTED" && (
                        <button
                          className="btn"
                          type="button"
                          onClick={() => void verify(p.user_id, "APPROVED")}
                        >
                          Re-approve
                        </button>
                      )}
                    </div>
                    <button
                      className="btn danger admin-provider-delete"
                      type="button"
                      disabled={busyId === p.user_id}
                      onClick={() => void deleteUser(p.user_id, p.business_name || p.full_name)}
                    >
                      {busyId === p.user_id ? "Deleting…" : "Delete"}
                    </button>
                  </footer>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {tab === "consumers" && (
        <div className="card">
          <h2>All consumers</h2>
          <p className="muted">Registered consumers on the platform.</p>
          <div className="list admin-consumer-list">
            {consumers.length === 0 && <p className="muted">No consumers yet.</p>}
            {consumers.map((c) => {
              const address = [c.address_line1, c.address_line2, c.city, c.state, c.pincode]
                .filter(Boolean)
                .join(", ");
              const locationText = c.location_label || address || null;
              return (
                <article key={c.id} className="list-item admin-provider-card admin-consumer-card">
                  <header className="admin-provider-card-head">
                    <div className="admin-provider-card-title">
                      <h3>{c.full_name}</h3>
                      <p className="admin-provider-card-owner">
                        Joined {new Date(c.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="admin-provider-card-badges">
                      <span className={`pill ${c.is_active ? "online" : "offline"}`}>
                        {c.is_active ? "Active" : "Inactive"}
                      </span>
                      <span className={`pill ${c.is_verified ? "online" : "pending"}`}>
                        {c.is_verified ? "Verified" : "Unverified"}
                      </span>
                    </div>
                  </header>

                  <dl className="admin-provider-meta">
                    <div>
                      <dt>Phone</dt>
                      <dd>
                        {c.phone_number}
                        {c.alternate_phone ? (
                          <>
                            <br />
                            <span className="muted">Alt {c.alternate_phone}</span>
                          </>
                        ) : null}
                      </dd>
                    </div>
                    <div>
                      <dt>Email</dt>
                      <dd>{c.email || "Not provided"}</dd>
                    </div>
                    <div>
                      <dt>Rating</dt>
                      <dd>
                        {c.average_rating.toFixed(1)} / 5
                        <span className="muted">
                          {" "}
                          ({c.rating_count} review{c.rating_count === 1 ? "" : "s"})
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt>Pincode</dt>
                      <dd>{c.pincode || "—"}</dd>
                    </div>
                    <div className="admin-provider-meta-wide">
                      <dt>Location</dt>
                      <dd>
                        {locationText || "No location set"}
                        {c.location_label && address && c.location_label !== address ? (
                          <div className="muted" style={{ marginTop: "0.2rem" }}>
                            {address}
                          </div>
                        ) : null}
                        <div className="admin-provider-maps">
                          <MapsLink
                            latitude={c.latitude}
                            longitude={c.longitude}
                            maps_url={c.maps_url}
                            label={c.location_label || undefined}
                          />
                        </div>
                      </dd>
                    </div>
                    <div className="admin-provider-meta-wide">
                      <dt>Username</dt>
                      <dd>
                        <code className="admin-provider-id">{c.username || c.phone_number}</code>
                      </dd>
                    </div>
                  </dl>

                  <footer className="admin-provider-card-actions">
                    <div className="admin-provider-card-actions-main" />
                    <button
                      className="btn danger admin-provider-delete"
                      type="button"
                      disabled={busyId === c.id}
                      onClick={() => void deleteUser(c.id, c.full_name)}
                    >
                      {busyId === c.id ? "Deleting…" : "Delete"}
                    </button>
                  </footer>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {tab === "orders" && <AdminOrdersDashboard />}

      {tab === "messages" && (
        <div className="card">
          <h2>Provider messages</h2>
          <p className="muted">
            Support threads with providers. Start a chat from a provider&apos;s detail page.
          </p>
          {activeSupportId ? (
            <InquiryChatPanel
              conversationId={activeSupportId}
              title={activeSupportTitle}
              messagesPath={`/support-conversations/${activeSupportId}/messages`}
              emptyHint="No messages yet."
              placeholder="Type a message…"
              onClose={() => setActiveSupportId(null)}
            />
          ) : (
            <div className="list">
              {supportThreads.length === 0 && (
                <p className="muted">No provider chats yet. Open a provider and use Messaging.</p>
              )}
              {supportThreads.map((t) => (
                <div key={t.id} className="list-item">
                  <div className="topbar" style={{ marginBottom: "0.35rem" }}>
                    <div>
                      <strong>{t.provider_business_name || t.provider_name || "Provider"}</strong>
                      <div className="muted">{t.provider_name}</div>
                    </div>
                    <button
                      className="btn"
                      type="button"
                      onClick={() => {
                        setActiveSupportId(t.id);
                        setActiveSupportTitle(
                          `Chat with ${t.provider_business_name || t.provider_name || "provider"}`,
                        );
                        window.setTimeout(() => void refreshCounts(), 400);
                      }}
                    >
                      Open chat
                      {(t.unread_count || 0) > 0 && (
                        <span className="nav-badge" style={{ marginLeft: "0.4rem" }}>
                          {t.unread_count}
                        </span>
                      )}
                    </button>
                  </div>
                  <p className="muted">{t.last_message || "No messages yet"}</p>
                  <p className="muted" style={{ fontSize: "0.85rem" }}>
                    Updated {new Date(t.updated_at).toLocaleString()}
                  </p>
                  <Link className="btn secondary" to={`/admin/providers/${t.provider_id}`}>
                    View provider
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "categories" && (
        <div className="admin-categories">
          {categoryView === "manage" ? (
            <section className="admin-categories-section" aria-labelledby="manage-category-heading">
              <div className="admin-categories-section-head admin-categories-manage-head">
                <div className="admin-categories-title-block">
                  <h2 id="manage-category-heading">Manage category</h2>
                  <p className="muted">
                    Activate, deactivate, or add subcategories to existing ones.
                  </p>
                </div>
                <button
                  className="btn admin-categories-create-btn btn-with-icon"
                  type="button"
                  onClick={() => openCreateCategory()}
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
                    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                  </svg>
                  Create category
                </button>
              </div>

              <div className="admin-categories-tools">
                <div className="admin-categories-search field">
                  <label htmlFor="category-search">Search</label>
                  <input
                    id="category-search"
                    type="search"
                    value={categorySearch}
                    placeholder="Search by name, slug, or description…"
                    onChange={(e) => setCategorySearch(e.target.value)}
                    autoComplete="off"
                  />
                </div>

                <div className="admin-categories-stats">
                  <div>
                    <span className="muted">Top-level</span>
                    <strong>{parents.length}</strong>
                  </div>
                  <div>
                    <span className="muted">Subcategories</span>
                    <strong>
                      {parents.reduce((n, p) => n + (p.children?.length || 0), 0)}
                    </strong>
                  </div>
                  <div>
                    <span className="muted">Active</span>
                    <strong>
                      {parents.filter((p) => p.is_active).length +
                        parents.reduce(
                          (n, p) => n + (p.children || []).filter((c) => c.is_active).length,
                          0,
                        )}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="admin-category-list-wrap">
                {parents.length === 0 && (
                  <div className="card admin-categories-empty">
                    <p className="muted" style={{ margin: "0 0 0.85rem" }}>
                      No categories yet. Create one to get started.
                    </p>
                    <button
                      className="btn btn-with-icon"
                      type="button"
                      onClick={() => openCreateCategory()}
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
                        <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                      </svg>
                      Create category
                    </button>
                  </div>
                )}

                {parents.length > 0 && filteredParents.length === 0 && (
                  <div className="card">
                    <p className="muted" style={{ margin: 0 }}>
                      No categories match “{categorySearch.trim()}”.
                    </p>
                  </div>
                )}

                {filteredParents.map((p) => {
                  const childCount = p.children?.length || 0;
                  const activeChildren = (p.children || []).filter((c) => c.is_active).length;
                  return (
                    <article
                      key={p.id}
                      className={`card admin-category-card ${p.is_active ? "" : "is-inactive"} ${offerKindClass(p.kind)}`}
                    >
                      <header className="admin-category-card-head">
                        <div className="admin-category-card-title">
                          <span
                            className={`admin-category-mark ${offerKindClass(p.kind)}`}
                            aria-hidden="true"
                          >
                            {p.name.slice(0, 1).toUpperCase()}
                          </span>
                          <div>
                            <h3>{p.name}</h3>
                            <p className="muted">
                              <code className="admin-provider-id">{p.slug}</code>
                              {p.description ? ` · ${p.description}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="admin-category-card-badges">
                          <span className={`pill ${offerKindClass(p.kind)}`}>
                            {offerKindLabel(p.kind)}
                          </span>
                          <span className={`pill ${p.is_active ? "online" : "offline"}`}>
                            {p.is_active ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </header>

                      <div className="admin-category-card-meta">
                        <span className="muted">
                          {childCount === 0
                            ? "No subcategories"
                            : `${childCount} subcategor${childCount === 1 ? "y" : "ies"} · ${activeChildren} active`}
                        </span>
                        <div className="admin-category-card-actions">
                          <button
                            className="btn secondary"
                            type="button"
                            onClick={() => openAddSubcategory(p)}
                          >
                            Add subcategory
                          </button>
                          {p.is_active ? (
                            <button
                              className="btn danger"
                              type="button"
                              onClick={() => void deactivate(p.id)}
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button
                              className="btn"
                              type="button"
                              onClick={() => void activate(p.id)}
                            >
                              Activate
                            </button>
                          )}
                        </div>
                      </div>

                      {childCount > 0 && (
                        <ul className="admin-subcategory-list">
                          {(p.children || []).map((c) => (
                            <li
                              key={c.id}
                              className={`admin-subcategory-item ${c.is_active ? "" : "is-inactive"} ${offerKindClass(c.kind)}`}
                            >
                              <div className="admin-subcategory-info">
                                <strong>{c.name}</strong>
                                <span className="muted">
                                  <code className="admin-provider-id">{c.slug}</code>
                                </span>
                              </div>
                              <div className="admin-subcategory-actions">
                                <span className={`pill ${offerKindClass(c.kind)}`}>
                                  {offerKindLabel(c.kind)}
                                </span>
                                <span className={`pill ${c.is_active ? "online" : "offline"}`}>
                                  {c.is_active ? "Active" : "Inactive"}
                                </span>
                                {c.is_active ? (
                                  <button
                                    className="btn secondary"
                                    type="button"
                                    onClick={() => void deactivate(c.id)}
                                  >
                                    Deactivate
                                  </button>
                                ) : (
                                  <button
                                    className="btn"
                                    type="button"
                                    onClick={() => void activate(c.id)}
                                  >
                                    Activate
                                  </button>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          ) : (
            <section className="admin-categories-section" aria-labelledby="create-category-heading">
              <div className="admin-categories-section-head admin-categories-create-head">
                <div>
                  <h2 id="create-category-heading">Create Category</h2>
                  <p className="muted">
                    Add a top-level category or nest a subcategory under an existing one.
                  </p>
                </div>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => {
                    setCategoryView("manage");
                    setForm({ name: "", slug: "", description: "", parent_id: "", kind: "BOTH" });
                  }}
                >
                  Back to manage
                </button>
              </div>

              <form className="card admin-category-form" onSubmit={createCategory}>
                <div className="admin-category-type-toggle" role="group" aria-label="Category type">
                  <button
                    type="button"
                    className={`admin-filter-chip ${!form.parent_id ? "active" : ""}`}
                    onClick={() => setForm({ ...form, parent_id: "" })}
                  >
                    Top-level
                  </button>
                  <button
                    type="button"
                    className={`admin-filter-chip ${form.parent_id ? "active" : ""}`}
                    onClick={() => {
                      if (!form.parent_id && parents[0]) {
                        setForm({ ...form, parent_id: String(parents[0].id) });
                      }
                    }}
                    disabled={parents.length === 0}
                  >
                    Subcategory
                  </button>
                </div>

                <div className="field">
                  <label>{form.parent_id ? "Parent category" : "Parent (optional)"}</label>
                  <select
                    value={form.parent_id}
                    onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
                  >
                    <option value="">— Top-level category —</option>
                    {parents.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label>Name</label>
                  <input
                    required
                    value={form.name}
                    placeholder="e.g. Home cleaning"
                    onChange={(e) =>
                      setForm({
                        ...form,
                        name: e.target.value,
                        slug: slugify(e.target.value),
                      })
                    }
                  />
                </div>

                <div className="admin-category-form-row">
                  <div className="field">
                    <label>Slug</label>
                    <input
                      required
                      value={form.slug}
                      placeholder="home-cleaning"
                      onChange={(e) => setForm({ ...form, slug: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Kind</label>
                    <select
                      value={form.kind}
                      onChange={(e) => setForm({ ...form, kind: e.target.value as OfferKind })}
                    >
                      <option value="BOTH">{offerKindLabel("BOTH")}</option>
                      <option value="SERVICE">{offerKindLabel("SERVICE")}</option>
                      <option value="PRODUCT">{offerKindLabel("PRODUCT")}</option>
                    </select>
                  </div>
                </div>

                <div className="field">
                  <label>Description</label>
                  <textarea
                    rows={3}
                    value={form.description}
                    placeholder="Short note for admins and providers (optional)"
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>

                <div className="admin-category-form-actions">
                  <button className="btn" type="submit">
                    {form.parent_id ? "Create subcategory" : "Create category"}
                  </button>
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => {
                      setCategoryView("manage");
                      setForm({ name: "", slug: "", description: "", parent_id: "", kind: "BOTH" });
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </section>
          )}
        </div>
      )}

      {tab === "config" && (
        <div className="grid" style={{ gap: "1rem", maxWidth: 720 }}>
          <form className="card" onSubmit={saveSmtp}>
            <h2>SMTP email settings</h2>
            <p className="muted">
              Used by the app to send emails (provider approval, future notifications, etc.).
            </p>
            <div className="field">
              <label>
                <input
                  type="checkbox"
                  checked={smtp.is_enabled}
                  onChange={(e) => setSmtp({ ...smtp, is_enabled: e.target.checked })}
                />{" "}
                Enable SMTP sending
              </label>
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label>SMTP host</label>
                <input
                  required
                  value={smtp.host}
                  onChange={(e) => setSmtp({ ...smtp, host: e.target.value })}
                  placeholder="smtp.gmail.com"
                />
              </div>
              <div className="field">
                <label>Port</label>
                <input
                  required
                  type="number"
                  min={1}
                  max={65535}
                  value={smtp.port}
                  onChange={(e) => setSmtp({ ...smtp, port: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label>Username</label>
                <input
                  value={smtp.username}
                  onChange={(e) => setSmtp({ ...smtp, username: e.target.value })}
                  placeholder="optional"
                />
              </div>
              <div className="field">
                <label>Password {smtp.password_set ? "(saved — leave blank to keep)" : ""}</label>
                <input
                  type="password"
                  value={smtp.password}
                  onChange={(e) => setSmtp({ ...smtp, password: e.target.value })}
                  placeholder={smtp.password_set ? "••••••••" : "SMTP password"}
                  autoComplete="new-password"
                />
              </div>
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label>From email</label>
                <input
                  required
                  type="email"
                  value={smtp.from_email}
                  onChange={(e) => setSmtp({ ...smtp, from_email: e.target.value })}
                  placeholder="noreply@localsync.app"
                />
              </div>
              <div className="field">
                <label>From name</label>
                <input
                  value={smtp.from_name}
                  onChange={(e) => setSmtp({ ...smtp, from_name: e.target.value })}
                />
              </div>
            </div>
            <div className="nav-actions">
              <label>
                <input
                  type="checkbox"
                  checked={smtp.use_tls}
                  onChange={(e) =>
                    setSmtp({
                      ...smtp,
                      use_tls: e.target.checked,
                      use_ssl: e.target.checked ? false : smtp.use_ssl,
                    })
                  }
                />{" "}
                STARTTLS (587)
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={smtp.use_ssl}
                  onChange={(e) =>
                    setSmtp({
                      ...smtp,
                      use_ssl: e.target.checked,
                      use_tls: e.target.checked ? false : smtp.use_tls,
                    })
                  }
                />{" "}
                SSL (465)
              </label>
            </div>
            <button className="btn" type="submit" disabled={smtpBusy} style={{ marginTop: "1rem" }}>
              {smtpBusy ? "Saving…" : "Save SMTP settings"}
            </button>
          </form>

          <form className="card" onSubmit={sendTestEmail}>
            <h2>Send test email</h2>
            <p className="muted">Verify the SMTP connection by sending a test message.</p>
            <div className="field">
              <label>To email</label>
              <input
                required
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <button className="btn secondary" type="submit" disabled={smtpBusy || !smtp.is_enabled}>
              {smtpBusy ? "Sending…" : "Send test"}
            </button>
          </form>
        </div>
      )}

      {ordersProvider && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => {
            setOrdersProvider(null);
            setProviderOrders([]);
          }}
        >
          <div
            className="modal-dialog card admin-provider-orders-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="provider-orders-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="topbar" style={{ marginBottom: "0.75rem" }}>
              <div>
                <h3 id="provider-orders-title" style={{ margin: 0 }}>
                  Orders · {ordersProvider.business_name}
                </h3>
                <p className="muted" style={{ margin: "0.25rem 0 0" }}>
                  Consumer deals with this provider
                </p>
              </div>
              <button
                className="btn secondary"
                type="button"
                onClick={() => {
                  setOrdersProvider(null);
                  setProviderOrders([]);
                }}
              >
                Close
              </button>
            </div>

            {ordersBusy && <p className="muted">Loading orders…</p>}
            {!ordersBusy && providerOrders.length === 0 && (
              <p className="muted">No orders yet for this provider.</p>
            )}
            {!ordersBusy && providerOrders.length > 0 && (
              <div className="list admin-provider-orders-list">
                {providerOrders.map((o) => (
                  <article key={o.id} className="list-item admin-order-card">
                    <header className="admin-provider-card-head">
                      <div className="admin-provider-card-title">
                        <h3>₹{o.agreed_price.toLocaleString("en-IN")}</h3>
                        <p className="admin-provider-card-owner">
                          Consumer: {o.consumer_name || "Unknown"}
                        </p>
                      </div>
                      <span className={`pill ${o.status === "COMPLETED" ? "online" : ""}`}>
                        {o.status}
                      </span>
                    </header>
                    <dl className="admin-provider-meta">
                      <div>
                        <dt>Fulfillment</dt>
                        <dd>{o.fulfillment_type.replaceAll("_", " ")}</dd>
                      </div>
                      <div>
                        <dt>Created</dt>
                        <dd>{new Date(o.created_at).toLocaleString()}</dd>
                      </div>
                      <div>
                        <dt>Completed</dt>
                        <dd>
                          {o.completed_at ? new Date(o.completed_at).toLocaleString() : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt>Order ID</dt>
                        <dd>
                          <code className="admin-provider-id">{o.id}</code>
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
