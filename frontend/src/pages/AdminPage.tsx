import { FormEvent, useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { mediaSrc } from "../components/Attachments";
import { MapsLink } from "../components/MapsLink";
import { offerKindLabel } from "../components/ProviderTrust";
import { api } from "../services/api";
import { useAdminNav } from "../store/adminNav";
import type {
  AdminOrder,
  AdminProvider,
  Category,
  OfferKind,
  SmtpConfig,
  User,
} from "../types";

type AdminTab = "providers" | "consumers" | "orders" | "categories" | "config";

const TITLES: Record<AdminTab, string> = {
  providers: "Providers",
  consumers: "Consumers",
  orders: "Orders",
  categories: "Categories",
  config: "Config",
};

export function AdminPage() {
  const { section } = useParams<{ section?: string }>();
  const tab = (
    section && ["providers", "consumers", "orders", "categories", "config"].includes(section)
      ? section
      : "providers"
  ) as AdminTab;
  const refreshCounts = useAdminNav((s) => s.refreshCounts);

  const [providerFilter, setProviderFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">(
    "ALL",
  );
  const [categories, setCategories] = useState<Category[]>([]);
  const [providers, setProviders] = useState<AdminProvider[]>([]);
  const [consumers, setConsumers] = useState<User[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
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

  const invalidSection =
    !!section && !["providers", "consumers", "orders", "categories", "config"].includes(section);

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
      const [cats, provs, cons, ords] = await Promise.all([
        api.get<Category[]>("/categories/admin/all"),
        api.get<AdminProvider[]>("/admin/providers"),
        api.get<User[]>("/admin/consumers"),
        api.get<AdminOrder[]>("/admin/orders"),
      ]);
      setCategories(cats.data);
      setProviders(provs.data);
      setConsumers(cons.data);
      setOrders(ords.data);
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

  const filteredProviders = useMemo(() => {
    if (providerFilter === "ALL") return providers;
    return providers.filter((p) => p.verification_status === providerFilter);
  }, [providers, providerFilter]);

  const parents = categories;

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
      await load();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed to create category";
      setError(String(msg));
    }
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

  return (
    <AppShell title={TITLES[tab] || "Admin"} onRefresh={load}>
      {note && <p className="pill online" style={{ marginBottom: "1rem" }}>{note}</p>}
      {error && <p className="error" style={{ marginBottom: "1rem" }}>{error}</p>}

      {tab === "providers" && (
        <div className="card">
          <h2>All providers</h2>
          <p className="muted">New (pending) and existing providers. Approve, reject, or delete.</p>
          <div className="tabs" style={{ marginBottom: "0.75rem" }}>
            {(["ALL", "PENDING", "APPROVED", "REJECTED"] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={`tab ${providerFilter === f ? "active" : ""}`}
                onClick={() => setProviderFilter(f)}
              >
                {f === "PENDING" ? "New / Pending" : f.charAt(0) + f.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          <div className="list">
            {filteredProviders.length === 0 && <p className="muted">No providers in this filter.</p>}
            {filteredProviders.map((p) => (
              <div key={p.user_id} className="list-item">
                <div className="topbar" style={{ marginBottom: "0.35rem" }}>
                  <div>
                    <strong>{p.business_name}</strong>
                    <div className="muted">
                      {p.full_name} · {p.phone_number}
                      {p.email ? ` · ${p.email}` : ""}
                    </div>
                  </div>
                  <span
                    className={`pill ${
                      p.verification_status === "APPROVED"
                        ? "online"
                        : p.verification_status === "PENDING"
                          ? ""
                          : "offline"
                    }`}
                  >
                    {p.verification_status}
                  </span>
                </div>
                <p className="muted">
                  {offerKindLabel(p.offer_kind)} ·{" "}
                  {(p.categories && p.categories.length > 0
                    ? p.categories.join(", ")
                    : p.category_name) || "No category"}
                  {p.gst_number ? ` · GST ${p.gst_number}` : " · No GST"} ·{" "}
                  {p.is_online ? "Online" : "Offline"} · rating {p.average_rating.toFixed(1)} (
                  {p.rating_count})
                </p>
                {p.aadhaar_doc_url && (
                  <p style={{ margin: "0.35rem 0" }}>
                    <a href={mediaSrc(p.aadhaar_doc_url)} target="_blank" rel="noreferrer">
                      View Aadhaar document
                    </a>
                  </p>
                )}
                <p className="muted" style={{ fontSize: "0.8rem", wordBreak: "break-all" }}>
                  User ID: {p.user_id}
                </p>
                <MapsLink
                  latitude={p.latitude}
                  longitude={p.longitude}
                  maps_url={p.maps_url}
                  label={p.location_label || undefined}
                />
                <div className="nav-actions" style={{ marginTop: "0.6rem" }}>
                  {p.verification_status === "PENDING" && (
                    <>
                      <button className="btn" type="button" onClick={() => void verify(p.user_id, "APPROVED")}>
                        Approve
                      </button>
                      <button
                        className="btn danger"
                        type="button"
                        onClick={() => void verify(p.user_id, "REJECTED")}
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {p.verification_status === "APPROVED" && (
                    <button
                      className="btn danger"
                      type="button"
                      onClick={() => void verify(p.user_id, "REJECTED")}
                    >
                      Revoke / Reject
                    </button>
                  )}
                  {p.verification_status === "REJECTED" && (
                    <button className="btn" type="button" onClick={() => void verify(p.user_id, "APPROVED")}>
                      Re-approve
                    </button>
                  )}
                  <button
                    className="btn danger"
                    type="button"
                    disabled={busyId === p.user_id}
                    onClick={() => void deleteUser(p.user_id, p.business_name || p.full_name)}
                  >
                    {busyId === p.user_id ? "Deleting…" : "Delete user"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "consumers" && (
        <div className="card">
          <h2>All consumers</h2>
          <div className="list">
            {consumers.length === 0 && <p className="muted">No consumers yet.</p>}
            {consumers.map((c) => (
              <div key={c.id} className="list-item">
                <strong>{c.full_name}</strong>
                <div className="muted">
                  {c.phone_number}
                  {c.email ? ` · ${c.email}` : ""} · rating {c.average_rating.toFixed(1)} (
                  {c.rating_count})
                </div>
                <div className="muted" style={{ fontSize: "0.8rem", wordBreak: "break-all" }}>
                  User ID: {c.id}
                </div>
                <MapsLink
                  latitude={c.latitude}
                  longitude={c.longitude}
                  maps_url={c.maps_url}
                  label={c.location_label || undefined}
                />
                <div className="muted" style={{ fontSize: "0.8rem" }}>
                  Joined {new Date(c.created_at).toLocaleString()}
                </div>
                <div className="nav-actions" style={{ marginTop: "0.6rem" }}>
                  <button
                    className="btn danger"
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => void deleteUser(c.id, c.full_name)}
                  >
                    {busyId === c.id ? "Deleting…" : "Delete user"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "orders" && (
        <div className="card">
          <h2>Orders (consumer ↔ provider)</h2>
          <p className="muted">Every deal finalized on the platform.</p>
          <div className="list">
            {orders.length === 0 && <p className="muted">No orders yet.</p>}
            {orders.map((o) => (
              <div key={o.id} className="list-item">
                <div className="topbar" style={{ marginBottom: "0.35rem" }}>
                  <strong>₹{o.agreed_price}</strong>
                  <span className={`pill ${o.status === "COMPLETED" ? "online" : ""}`}>{o.status}</span>
                </div>
                <p>
                  <strong>{o.consumer_name || "Consumer"}</strong>
                  <span className="muted"> → </span>
                  <strong>{o.provider_business_name || o.provider_name || "Provider"}</strong>
                </p>
                <p className="muted">
                  {o.fulfillment_type} · created {new Date(o.created_at).toLocaleString()}
                  {o.completed_at ? ` · completed ${new Date(o.completed_at).toLocaleString()}` : ""}
                </p>
                <p className="muted" style={{ fontSize: "0.8rem", wordBreak: "break-all" }}>
                  Order: {o.id}
                  <br />
                  Consumer: {o.consumer_id}
                  <br />
                  Provider: {o.provider_id}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "categories" && (
        <div className="grid grid-2">
          <form className="card" onSubmit={createCategory}>
            <h2>Add category or subcategory</h2>
            <div className="field">
              <label>Parent (leave empty for top-level)</label>
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
                onChange={(e) =>
                  setForm({
                    ...form,
                    name: e.target.value,
                    slug: form.slug || slugify(e.target.value),
                  })
                }
              />
            </div>
            <div className="field">
              <label>Slug</label>
              <input
                required
                value={form.slug}
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
            <div className="field">
              <label>Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <button className="btn" type="submit">
              {form.parent_id ? "Create subcategory" : "Create category"}
            </button>
          </form>
          <div className="card">
            <h2>Configured taxonomy</h2>
            <p className="muted">Providers pick from these during onboarding.</p>
            <div className="list">
              {parents.length === 0 && <p className="muted">No categories yet.</p>}
              {parents.map((p) => (
                <div key={p.id} className="list-item">
                  <div className="topbar" style={{ marginBottom: "0.35rem" }}>
                    <div>
                      <strong>{p.name}</strong>
                      <span className="muted"> ({p.slug})</span>
                      <div className="muted">
                        {offerKindLabel(p.kind)} · {p.is_active ? "Active" : "Inactive"}
                      </div>
                    </div>
                    {p.is_active ? (
                      <button className="btn danger" type="button" onClick={() => void deactivate(p.id)}>
                        Deactivate
                      </button>
                    ) : (
                      <button className="btn" type="button" onClick={() => void activate(p.id)}>
                        Activate
                      </button>
                    )}
                  </div>
                  {(p.children || []).length === 0 && <p className="muted">No subcategories</p>}
                  {(p.children || []).map((c) => (
                    <div key={c.id} className="check-row sub" style={{ justifyContent: "space-between" }}>
                      <span>
                        › {c.name}{" "}
                        <span className="muted">
                          ({c.slug}) · {offerKindLabel(c.kind)} · {c.is_active ? "Active" : "Inactive"}
                        </span>
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
                        <button className="btn" type="button" onClick={() => void activate(c.id)}>
                          Activate
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
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
    </AppShell>
  );
}
