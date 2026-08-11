import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { AdminOrdersDashboard } from "../components/AdminOrdersDashboard";
import { AppShell } from "../components/AppShell";
import { mediaSrc } from "../components/Attachments";
import { CategoryMultiSelect } from "../components/CategoryMultiSelect";
import { InquiryChatPanel } from "../components/InquiryChat";
import { MapsLink } from "../components/MapsLink";
import { offerKindClass, offerKindLabel } from "../components/ProviderTrust";
import { api } from "../services/api";
import { useAdminNav } from "../store/adminNav";
import { useAuth } from "../store/auth";
import type {
  AdminCustomerServiceAgent,
  AdminOrder,
  AdminProvider,
  AdminProviderDetail,
  AdminSupportConversation,
  Category,
  CategoryTree,
  OfferKind,
  SmtpConfig,
  User,
} from "../types";

type AdminTab =
  | "providers"
  | "consumers"
  | "orders"
  | "categories"
  | "messages"
  | "customer-service"
  | "config";

const TITLES: Record<AdminTab, string> = {
  providers: "Providers",
  consumers: "Consumers",
  orders: "Order dashboard",
  categories: "Categories",
  messages: "Provider messages",
  "customer-service": "Customer service agents",
  config: "Config",
};

const STAFF_SECTIONS = ["providers", "consumers", "orders", "categories", "messages"] as const;
const ADMIN_ONLY_SECTIONS = ["customer-service", "config"] as const;

export function AdminPage() {
  const { user } = useAuth();
  const { section } = useParams<{ section?: string }>();
  const isAdmin = user?.role === "ADMIN";
  const allowedSections = isAdmin
    ? [...STAFF_SECTIONS, ...ADMIN_ONLY_SECTIONS]
    : [...STAFF_SECTIONS];
  const tab = (
    section && allowedSections.includes(section as (typeof allowedSections)[number])
      ? section
      : "providers"
  ) as AdminTab;
  const refreshCounts = useAdminNav((s) => s.refreshCounts);
  const navigate = useNavigate();

  const [providerFilter, setProviderFilter] = useState<
    "ALL" | "PENDING" | "APPROVED" | "REJECTED" | "REVOKED" | "MESSAGES"
  >("ALL");
  const [providerSearch, setProviderSearch] = useState("");
  const [providerView, setProviderView] = useState<"list" | "create">("list");
  const [providerCreateBusy, setProviderCreateBusy] = useState(false);
  const [providerCategoryIds, setProviderCategoryIds] = useState<number[]>([]);
  const [providerCreate, setProviderCreate] = useState({
    phone_number: "",
    full_name: "",
    email: "",
    password: "",
    business_name: "",
    offer_kind: "BOTH" as OfferKind,
    description: "",
    offerings_detail: "",
    gst_number: "",
    city: "",
    state: "",
    pincode: "",
    location_label: "",
    address_line1: "",
    opening_time: "09:00",
    closing_time: "18:00",
    max_radius_km: "10",
    approve: true,
  });
  const [consumerSearch, setConsumerSearch] = useState("");
  const [messagesSearch, setMessagesSearch] = useState("");
  const [csAgents, setCsAgents] = useState<AdminCustomerServiceAgent[]>([]);
  const [csSearch, setCsSearch] = useState("");
  const [csView, setCsView] = useState<"list" | "create">("list");
  const [csBusyId, setCsBusyId] = useState<string | null>(null);
  const [csCreateBusy, setCsCreateBusy] = useState(false);
  const [csCreate, setCsCreate] = useState({
    phone_number: "",
    full_name: "",
    email: "",
    password: "",
    approve: false,
  });
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
    from_name: "Gharq",
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
    !!section && !allowedSections.includes(section as (typeof allowedSections)[number]);

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
          from_name: data.from_name || "Gharq",
          use_tls: data.use_tls,
          use_ssl: data.use_ssl,
          is_enabled: data.is_enabled,
          password_set: data.password_set,
        });
        return;
      }
      if (tab === "customer-service") {
        const { data } = await api.get<AdminCustomerServiceAgent[]>(
          "/admin/customer-service-agents",
        );
        setCsAgents(data);
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
    if (tab !== "providers") {
      setProviderSearch("");
      setProviderView("list");
    }
    if (tab !== "consumers") setConsumerSearch("");
    if (tab !== "messages") setMessagesSearch("");
    if (tab !== "customer-service") {
      setCsSearch("");
      setCsView("list");
    }
  }, [tab]);

  const supportByProvider = useMemo(() => {
    const map = new Map<string, AdminSupportConversation>();
    for (const t of supportThreads) {
      map.set(t.provider_id, t);
    }
    return map;
  }, [supportThreads]);

  const categoryTree = useMemo<CategoryTree[]>(
    () =>
      categories.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        kind: (p.kind || "BOTH") as OfferKind,
        is_active: p.is_active,
        subcategories: p.children || [],
      })),
    [categories],
  );

  const providerFilterCounts = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    let revoked = 0;
    let messages = 0;
    for (const p of providers) {
      if (p.verification_status === "PENDING") pending += 1;
      else if (p.verification_status === "APPROVED") approved += 1;
      else if (p.verification_status === "REJECTED") rejected += 1;
      else if (p.verification_status === "REVOKED") revoked += 1;
      if ((supportByProvider.get(p.user_id)?.unread_count || 0) > 0) messages += 1;
    }
    return {
      ALL: providers.length,
      PENDING: pending,
      APPROVED: approved,
      REJECTED: rejected,
      REVOKED: revoked,
      MESSAGES: messages,
    };
  }, [providers, supportByProvider]);

  function matchesAdminUserSearch(
    q: string,
    fields: Array<string | null | undefined>,
  ): boolean {
    if (!q) return true;
    const haystack = fields
      .filter((v): v is string => Boolean(v && String(v).trim()))
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  }

  const filteredProviders = useMemo(() => {
    let list = providers;
    if (providerFilter === "MESSAGES") {
      list = list.filter((p) => (supportByProvider.get(p.user_id)?.unread_count || 0) > 0);
    } else if (providerFilter !== "ALL") {
      list = list.filter((p) => p.verification_status === providerFilter);
    }
    const q = providerSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) =>
      matchesAdminUserSearch(q, [
        p.full_name,
        p.business_name,
        p.phone_number,
        p.email,
        p.pincode,
        p.username,
      ]),
    );
  }, [providers, providerFilter, providerSearch, supportByProvider]);

  const filteredConsumers = useMemo(() => {
    const q = consumerSearch.trim().toLowerCase();
    if (!q) return consumers;
    return consumers.filter((c) =>
      matchesAdminUserSearch(q, [
        c.full_name,
        c.phone_number,
        c.alternate_phone,
        c.email,
        c.pincode,
      ]),
    );
  }, [consumers, consumerSearch]);

  const filteredSupportThreads = useMemo(() => {
    const q = messagesSearch.trim().toLowerCase();
    if (!q) return supportThreads;
    return supportThreads.filter((t) =>
      matchesAdminUserSearch(q, [
        t.provider_business_name,
        t.provider_name,
        t.admin_name,
        t.last_message,
        t.provider_id,
      ]),
    );
  }, [supportThreads, messagesSearch]);

  const filteredCsAgents = useMemo(() => {
    const q = csSearch.trim().toLowerCase();
    if (!q) return csAgents;
    return csAgents.filter((a) =>
      matchesAdminUserSearch(q, [a.full_name, a.phone_number, a.email, a.status]),
    );
  }, [csAgents, csSearch]);

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

  if (invalidSection || ((section === "config" || section === "customer-service") && !isAdmin)) {
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
        from_name: data.from_name || "Gharq",
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

  function resetProviderCreate() {
    setProviderCreate({
      phone_number: "",
      full_name: "",
      email: "",
      password: "",
      business_name: "",
      offer_kind: "BOTH",
      description: "",
      offerings_detail: "",
      gst_number: "",
      city: "",
      state: "",
      pincode: "",
      location_label: "",
      address_line1: "",
      opening_time: "09:00",
      closing_time: "18:00",
      max_radius_km: "10",
      approve: true,
    });
    setProviderCategoryIds([]);
  }

  async function createProvider(e: FormEvent) {
    e.preventDefault();
    if (providerCategoryIds.length === 0) {
      setError("Select at least one category");
      return;
    }
    setProviderCreateBusy(true);
    setError("");
    setNote("");
    try {
      const { data } = await api.post<AdminProviderDetail>("/admin/providers", {
        phone_number: providerCreate.phone_number.trim(),
        full_name: providerCreate.full_name.trim(),
        email: providerCreate.email.trim(),
        password: providerCreate.password,
        business_name: providerCreate.business_name.trim(),
        category_ids: providerCategoryIds,
        offer_kind: providerCreate.offer_kind,
        description: providerCreate.description.trim() || null,
        offerings_detail: providerCreate.offerings_detail.trim() || null,
        gst_number: providerCreate.gst_number.trim() || null,
        city: providerCreate.city.trim() || null,
        state: providerCreate.state.trim() || null,
        pincode: providerCreate.pincode.trim() || null,
        location_label: providerCreate.location_label.trim() || null,
        address_line1: providerCreate.address_line1.trim() || null,
        opening_time: providerCreate.opening_time.trim() || null,
        closing_time: providerCreate.closing_time.trim() || null,
        max_radius_km: Number(providerCreate.max_radius_km) || 10,
        approve: providerCreate.approve,
      });
      resetProviderCreate();
      setProviderView("list");
      setNote(`Provider “${data.business_name}” created`);
      await load();
      navigate(`/admin/providers/${data.user_id}`);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed to create provider";
      setError(String(msg));
    } finally {
      setProviderCreateBusy(false);
    }
  }

  async function verify(userId: string, status: "APPROVED" | "REJECTED" | "REVOKED") {
    try {
      await api.post(`/providers/${userId}/verify`, { verification_status: status });
      setNote(
        status === "REVOKED"
          ? "Provider revoked — notification sent"
          : `Provider ${status.toLowerCase()}`,
      );
      await load();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Verification failed";
      setError(String(msg));
    }
  }

  function resetCsCreate() {
    setCsCreate({
      phone_number: "",
      full_name: "",
      email: "",
      password: "",
      approve: false,
    });
  }

  async function createCsAgent(e: FormEvent) {
    e.preventDefault();
    setCsCreateBusy(true);
    setError("");
    setNote("");
    try {
      await api.post<AdminCustomerServiceAgent>("/admin/customer-service-agents", {
        phone_number: csCreate.phone_number.trim(),
        full_name: csCreate.full_name.trim(),
        email: csCreate.email.trim(),
        password: csCreate.password,
        approve: csCreate.approve,
      });
      resetCsCreate();
      setCsView("list");
      setNote("Customer service agent created");
      await load();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed to create customer service agent";
      setError(String(msg));
    } finally {
      setCsCreateBusy(false);
    }
  }

  async function csAgentAction(
    userId: string,
    action: "approve" | "reapprove" | "revoke",
    label: string,
  ) {
    setCsBusyId(userId);
    setError("");
    try {
      await api.post(`/admin/customer-service-agents/${userId}/${action}`);
      setNote(
        action === "approve"
          ? `${label} approved`
          : action === "reapprove"
            ? `${label} re-approved`
            : `${label} access revoked`,
      );
      await load();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Action failed";
      setError(String(msg));
    } finally {
      setCsBusyId(null);
    }
  }

  async function deleteCsAgent(userId: string, label: string) {
    if (!window.confirm(`Delete customer service agent ${label}? This cannot be undone.`)) {
      return;
    }
    setCsBusyId(userId);
    setError("");
    try {
      await api.delete(`/admin/users/${userId}`);
      setNote(`${label} deleted`);
      await load();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed to delete agent";
      setError(String(msg));
    } finally {
      setCsBusyId(null);
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
        <div className="page-stack">
          {providerView === "create" ? (
            <>
              <header className="page-hero admin-provider-create-head">
                <div>
                  <p className="dash-eyebrow">Admin</p>
                  <h2>Add provider</h2>
                  <p className="page-lead">
                    Create a provider account. Approved accounts can sign in immediately.
                  </p>
                </div>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => {
                    setProviderView("list");
                    resetProviderCreate();
                  }}
                >
                  ← Back to list
                </button>
              </header>
              <section className="page-panel">
                <form className="page-form admin-provider-create-form" onSubmit={createProvider}>
                  <div className="admin-provider-edit-grid">
                    <label className="field">
                      <span>Full name</span>
                      <input
                        required
                        value={providerCreate.full_name}
                        onChange={(e) =>
                          setProviderCreate({ ...providerCreate, full_name: e.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Business / shop name</span>
                      <input
                        required
                        value={providerCreate.business_name}
                        onChange={(e) =>
                          setProviderCreate({ ...providerCreate, business_name: e.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Phone</span>
                      <input
                        required
                        autoComplete="tel"
                        value={providerCreate.phone_number}
                        onChange={(e) =>
                          setProviderCreate({ ...providerCreate, phone_number: e.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Email</span>
                      <input
                        required
                        type="email"
                        autoComplete="email"
                        value={providerCreate.email}
                        onChange={(e) =>
                          setProviderCreate({ ...providerCreate, email: e.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Temporary password</span>
                      <input
                        required
                        type="password"
                        minLength={6}
                        autoComplete="new-password"
                        value={providerCreate.password}
                        onChange={(e) =>
                          setProviderCreate({ ...providerCreate, password: e.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Offer kind</span>
                      <select
                        value={providerCreate.offer_kind}
                        onChange={(e) =>
                          setProviderCreate({
                            ...providerCreate,
                            offer_kind: e.target.value as OfferKind,
                          })
                        }
                      >
                        <option value="PRODUCT">Product</option>
                        <option value="SERVICE">Service</option>
                        <option value="BOTH">Both</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Opens</span>
                      <input
                        value={providerCreate.opening_time}
                        onChange={(e) =>
                          setProviderCreate({ ...providerCreate, opening_time: e.target.value })
                        }
                        placeholder="09:00"
                      />
                    </label>
                    <label className="field">
                      <span>Closes</span>
                      <input
                        value={providerCreate.closing_time}
                        onChange={(e) =>
                          setProviderCreate({ ...providerCreate, closing_time: e.target.value })
                        }
                        placeholder="18:00"
                      />
                    </label>
                    <label className="field">
                      <span>Max radius (km)</span>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={providerCreate.max_radius_km}
                        onChange={(e) =>
                          setProviderCreate({ ...providerCreate, max_radius_km: e.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>GST number</span>
                      <input
                        value={providerCreate.gst_number}
                        onChange={(e) =>
                          setProviderCreate({ ...providerCreate, gst_number: e.target.value })
                        }
                      />
                    </label>
                    <label className="field admin-provider-edit-wide">
                      <span>About</span>
                      <textarea
                        rows={3}
                        value={providerCreate.description}
                        onChange={(e) =>
                          setProviderCreate({ ...providerCreate, description: e.target.value })
                        }
                      />
                    </label>
                    <label className="field admin-provider-edit-wide">
                      <span>What they offer</span>
                      <textarea
                        rows={3}
                        value={providerCreate.offerings_detail}
                        onChange={(e) =>
                          setProviderCreate({
                            ...providerCreate,
                            offerings_detail: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Address line 1</span>
                      <input
                        value={providerCreate.address_line1}
                        onChange={(e) =>
                          setProviderCreate({ ...providerCreate, address_line1: e.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Location label</span>
                      <input
                        value={providerCreate.location_label}
                        onChange={(e) =>
                          setProviderCreate({ ...providerCreate, location_label: e.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>City</span>
                      <input
                        value={providerCreate.city}
                        onChange={(e) =>
                          setProviderCreate({ ...providerCreate, city: e.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>State</span>
                      <input
                        value={providerCreate.state}
                        onChange={(e) =>
                          setProviderCreate({ ...providerCreate, state: e.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Pincode</span>
                      <input
                        value={providerCreate.pincode}
                        onChange={(e) =>
                          setProviderCreate({ ...providerCreate, pincode: e.target.value })
                        }
                      />
                    </label>
                    <div className="field admin-provider-edit-wide">
                      <span>Categories</span>
                      <CategoryMultiSelect
                        tree={categoryTree}
                        selected={providerCategoryIds}
                        onChange={setProviderCategoryIds}
                      />
                    </div>
                    <label className="check-row admin-provider-edit-wide">
                      <input
                        type="checkbox"
                        checked={providerCreate.approve}
                        onChange={(e) =>
                          setProviderCreate({ ...providerCreate, approve: e.target.checked })
                        }
                      />
                      <span>Approve immediately (provider can sign in)</span>
                    </label>
                  </div>
                  <div className="admin-provider-create-actions">
                    <button
                      className="btn secondary"
                      type="button"
                      disabled={providerCreateBusy}
                      onClick={() => {
                        setProviderView("list");
                        resetProviderCreate();
                      }}
                    >
                      Cancel
                    </button>
                    <button className="btn" type="submit" disabled={providerCreateBusy}>
                      {providerCreateBusy ? "Creating…" : "Create provider"}
                    </button>
                  </div>
                </form>
              </section>
            </>
          ) : (
            <>
          <header className="page-hero admin-provider-list-head">
            <div>
              <p className="dash-eyebrow">Admin</p>
              <h2>All providers</h2>
              <p className="page-lead">
                Review providers, open chat, and filter by status or new messages.
              </p>
            </div>
            <button
              className="btn btn-with-icon"
              type="button"
              onClick={() => {
                resetProviderCreate();
                setProviderView("create");
              }}
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
              Add provider
            </button>
          </header>
          <section className="page-panel">
          <div className="admin-list-toolbar">
            <label className="admin-list-search field">
              <span>Search</span>
              <input
                type="search"
                value={providerSearch}
                onChange={(e) => setProviderSearch(e.target.value)}
                placeholder="Phone, email, name, or pincode"
                aria-label="Search providers"
              />
            </label>
          </div>
          <div className="admin-filter-bar" role="tablist" aria-label="Provider filters">
            {(
              [
                { id: "ALL", label: "All" },
                { id: "PENDING", label: "Pending" },
                { id: "APPROVED", label: "Approved" },
                { id: "REVOKED", label: "Revoked" },
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
                {providerSearch.trim()
                  ? `No providers match “${providerSearch.trim()}”.`
                  : providerFilter === "MESSAGES"
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
                    : p.verification_status === "REVOKED"
                      ? "Revoked"
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
                          onClick={() => void verify(p.user_id, "REVOKED")}
                        >
                          Revoke
                        </button>
                      )}
                      {(p.verification_status === "REJECTED" ||
                        p.verification_status === "REVOKED") && (
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
          </section>
            </>
          )}
        </div>
      )}

      {tab === "consumers" && (
        <div className="page-stack">
          <header className="page-hero">
            <p className="dash-eyebrow">Admin</p>
            <h2>All consumers</h2>
            <p className="page-lead">Registered consumers on the platform.</p>
          </header>
          <section className="page-panel">
          <div className="admin-list-toolbar">
            <label className="admin-list-search field">
              <span>Search</span>
              <input
                type="search"
                value={consumerSearch}
                onChange={(e) => setConsumerSearch(e.target.value)}
                placeholder="Phone, email, name, or pincode"
                aria-label="Search consumers"
              />
            </label>
          </div>
          <div className="page-list list admin-consumer-list">
            {filteredConsumers.length === 0 && (
              <p className="muted">
                {consumerSearch.trim()
                  ? `No consumers match “${consumerSearch.trim()}”.`
                  : "No consumers yet."}
              </p>
            )}
            {filteredConsumers.map((c) => {
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
          </section>
        </div>
      )}

      {tab === "orders" && <AdminOrdersDashboard />}

      {tab === "messages" && (
        <div className="page-stack">
          <header className="page-hero">
            <p className="dash-eyebrow">Admin</p>
            <h2>Provider messages</h2>
            <p className="page-lead">
              Support threads with providers. Start a chat from a provider&apos;s detail page.
            </p>
          </header>
          <section className="page-panel">
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
            <>
            <div className="admin-list-toolbar">
              <label className="admin-list-search field">
                <span>Search</span>
                <input
                  type="search"
                  value={messagesSearch}
                  onChange={(e) => setMessagesSearch(e.target.value)}
                  placeholder="Provider name, business, or message"
                  aria-label="Search provider messages"
                />
              </label>
            </div>
            <div className="page-list list">
              {filteredSupportThreads.length === 0 && (
                <p className="page-empty">
                  {messagesSearch.trim()
                    ? `No chats match “${messagesSearch.trim()}”.`
                    : "No provider chats yet. Open a provider and use Messaging."}
                </p>
              )}
              {filteredSupportThreads.map((t) => (
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
            </>
          )}
          </section>
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

      {tab === "customer-service" && isAdmin && (
        <div className="page-stack">
          {csView === "create" ? (
            <>
              <header className="page-hero admin-provider-create-head">
                <div>
                  <p className="dash-eyebrow">Admin</p>
                  <h2>Add customer service agent</h2>
                  <p className="page-lead">
                    Create a customer service account. Approve to allow sign-in.
                  </p>
                </div>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => {
                    setCsView("list");
                    resetCsCreate();
                  }}
                >
                  ← Back to list
                </button>
              </header>
              <section className="page-panel">
                <form className="page-form admin-provider-create-form" onSubmit={createCsAgent}>
                  <div className="admin-provider-edit-grid">
                    <label className="field">
                      <span>Full name</span>
                      <input
                        required
                        value={csCreate.full_name}
                        onChange={(e) => setCsCreate({ ...csCreate, full_name: e.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>Phone</span>
                      <input
                        required
                        autoComplete="tel"
                        value={csCreate.phone_number}
                        onChange={(e) =>
                          setCsCreate({ ...csCreate, phone_number: e.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Email</span>
                      <input
                        required
                        type="email"
                        autoComplete="email"
                        value={csCreate.email}
                        onChange={(e) => setCsCreate({ ...csCreate, email: e.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>Temporary password</span>
                      <input
                        required
                        type="password"
                        minLength={6}
                        autoComplete="new-password"
                        value={csCreate.password}
                        onChange={(e) => setCsCreate({ ...csCreate, password: e.target.value })}
                      />
                    </label>
                    <label className="check-row admin-provider-edit-wide">
                      <input
                        type="checkbox"
                        checked={csCreate.approve}
                        onChange={(e) => setCsCreate({ ...csCreate, approve: e.target.checked })}
                      />
                      <span>Approve immediately (agent can sign in)</span>
                    </label>
                  </div>
                  <div className="admin-provider-create-actions">
                    <button
                      className="btn secondary"
                      type="button"
                      disabled={csCreateBusy}
                      onClick={() => {
                        setCsView("list");
                        resetCsCreate();
                      }}
                    >
                      Cancel
                    </button>
                    <button className="btn" type="submit" disabled={csCreateBusy}>
                      {csCreateBusy ? "Creating…" : "Create agent"}
                    </button>
                  </div>
                </form>
              </section>
            </>
          ) : (
            <>
              <header className="page-hero admin-provider-list-head">
                <div>
                  <p className="dash-eyebrow">Admin</p>
                  <h2>Customer service agents</h2>
                  <p className="page-lead">
                    Manage customer service accounts. They have admin ops access except Config.
                  </p>
                </div>
                <button
                  className="btn btn-with-icon"
                  type="button"
                  onClick={() => {
                    resetCsCreate();
                    setCsView("create");
                  }}
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
                  Create agent
                </button>
              </header>
              <section className="page-panel">
                <div className="admin-list-toolbar">
                  <label className="admin-list-search field">
                    <span>Search</span>
                    <input
                      type="search"
                      value={csSearch}
                      onChange={(e) => setCsSearch(e.target.value)}
                      placeholder="Name, phone, email, or status"
                      aria-label="Search customer service agents"
                    />
                  </label>
                </div>
                <div className="page-list list admin-consumer-list">
                  {filteredCsAgents.length === 0 && (
                    <p className="muted">
                      {csSearch.trim()
                        ? `No agents match “${csSearch.trim()}”.`
                        : "No customer service agents yet."}
                    </p>
                  )}
                  {filteredCsAgents.map((a) => {
                    const statusLabel =
                      a.status === "APPROVED"
                        ? "Approved"
                        : a.status === "REVOKED"
                          ? "Revoked"
                          : "Pending";
                    const statusClass =
                      a.status === "APPROVED"
                        ? "online"
                        : a.status === "PENDING"
                          ? "pending"
                          : "offline";
                    return (
                      <article
                        key={a.id}
                        className="list-item admin-provider-card admin-consumer-card"
                      >
                        <header className="admin-provider-card-head">
                          <div className="admin-provider-card-title">
                            <h3>{a.full_name}</h3>
                            <p className="admin-provider-card-owner">
                              Joined {new Date(a.created_at).toLocaleString()}
                            </p>
                          </div>
                          <div className="admin-provider-card-badges">
                            <span className={`pill ${statusClass}`}>{statusLabel}</span>
                          </div>
                        </header>
                        <dl className="admin-provider-meta">
                          <div>
                            <dt>Phone</dt>
                            <dd>{a.phone_number}</dd>
                          </div>
                          <div>
                            <dt>Email</dt>
                            <dd>{a.email || "Not provided"}</dd>
                          </div>
                        </dl>
                        <footer className="admin-provider-card-actions">
                          <div className="admin-provider-card-actions-main">
                            {a.status === "PENDING" && (
                              <button
                                className="btn"
                                type="button"
                                disabled={csBusyId === a.id}
                                onClick={() => void csAgentAction(a.id, "approve", a.full_name)}
                              >
                                Approve
                              </button>
                            )}
                            {a.status === "APPROVED" && (
                              <button
                                className="btn secondary"
                                type="button"
                                disabled={csBusyId === a.id}
                                onClick={() => void csAgentAction(a.id, "revoke", a.full_name)}
                              >
                                Revoke
                              </button>
                            )}
                            {a.status === "REVOKED" && (
                              <button
                                className="btn"
                                type="button"
                                disabled={csBusyId === a.id}
                                onClick={() => void csAgentAction(a.id, "reapprove", a.full_name)}
                              >
                                Re-approve
                              </button>
                            )}
                          </div>
                          <button
                            className="btn danger admin-provider-delete"
                            type="button"
                            disabled={csBusyId === a.id}
                            onClick={() => void deleteCsAgent(a.id, a.full_name)}
                          >
                            {csBusyId === a.id ? "Working…" : "Delete"}
                          </button>
                        </footer>
                      </article>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </div>
      )}

      {tab === "config" && (
        <div className="page-stack narrow">
          <header className="page-hero">
            <p className="dash-eyebrow">Admin</p>
            <h2>Email config</h2>
            <p className="page-lead">SMTP settings for transactional mail.</p>
          </header>
          <form className="page-panel page-form" onSubmit={saveSmtp}>
            <h2>SMTP email settings</h2>
            <p className="page-lead">
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
            <div className="field">
              <label>From email</label>
              <input
                required
                type="email"
                value={smtp.from_email}
                onChange={(e) => setSmtp({ ...smtp, from_email: e.target.value })}
                placeholder="noreply@gharq.app"
              />
            </div>
            <div className="field">
              <label>From name</label>
              <input
                value={smtp.from_name}
                onChange={(e) => setSmtp({ ...smtp, from_name: e.target.value })}
              />
            </div>
            <div className="page-actions">
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
            <div className="page-actions">
              <button className="btn" type="submit" disabled={smtpBusy}>
                {smtpBusy ? "Saving…" : "Save SMTP settings"}
              </button>
            </div>
          </form>

          <form className="page-panel page-form" onSubmit={sendTestEmail}>
            <h2>Send test email</h2>
            <p className="page-lead">Verify the SMTP connection by sending a test message.</p>
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
            <div className="page-actions">
              <button
                className="btn secondary"
                type="submit"
                disabled={smtpBusy || !smtp.is_enabled}
              >
                {smtpBusy ? "Sending…" : "Send test"}
              </button>
            </div>
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
