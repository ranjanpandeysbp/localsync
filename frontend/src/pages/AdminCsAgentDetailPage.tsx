import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { api, apiErrorMessage } from "../services/api";
import { useAuth } from "../store/auth";
import type { AdminCustomerServiceAgent } from "../types";

type EditForm = {
  full_name: string;
  phone_number: string;
  email: string;
  password: string;
};

function emptyForm(): EditForm {
  return { full_name: "", phone_number: "", email: "", password: "" };
}

function formFromAgent(a: AdminCustomerServiceAgent): EditForm {
  return {
    full_name: a.full_name || "",
    phone_number: a.phone_number || "",
    email: a.email || "",
    password: "",
  };
}

export function AdminCsAgentDetailPage() {
  const { user } = useAuth();
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const isAdmin = user?.role === "ADMIN";
  const [agent, setAgent] = useState<AdminCustomerServiceAgent | null>(null);
  const [form, setForm] = useState<EditForm>(emptyForm);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get<AdminCustomerServiceAgent>(
        `/admin/customer-service-agents/${userId}`,
      );
      setAgent(data);
      setForm(formFromAgent(data));
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "Could not load agent"));
      setAgent(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin) void load();
  }, [userId, isAdmin]);

  function setField<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function saveDetails(e: FormEvent) {
    e.preventDefault();
    if (!userId) return;
    if (!form.full_name.trim()) {
      setError("Full name is required");
      return;
    }
    if (!form.phone_number.trim()) {
      setError("Phone is required");
      return;
    }
    if (!form.email.trim()) {
      setError("Email is required");
      return;
    }
    setSaving(true);
    setError("");
    setNote("");
    try {
      const payload: Record<string, string> = {
        full_name: form.full_name.trim(),
        phone_number: form.phone_number.trim(),
        email: form.email.trim(),
      };
      if (form.password.trim()) payload.password = form.password.trim();
      const { data } = await api.patch<AdminCustomerServiceAgent>(
        `/admin/customer-service-agents/${userId}`,
        payload,
      );
      setAgent(data);
      setForm(formFromAgent(data));
      setNote("Agent details saved");
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "Failed to save agent details"));
    } finally {
      setSaving(false);
    }
  }

  async function runAction(action: "approve" | "reapprove" | "revoke") {
    if (!userId || !agent) return;
    setBusy(true);
    setError("");
    setNote("");
    try {
      const { data } = await api.post<AdminCustomerServiceAgent>(
        `/admin/customer-service-agents/${userId}/${action}`,
      );
      setAgent(data);
      setNote(
        action === "approve"
          ? `${data.full_name} approved`
          : action === "reapprove"
            ? `${data.full_name} re-approved`
            : `${data.full_name} access revoked`,
      );
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "Action failed"));
    } finally {
      setBusy(false);
    }
  }

  async function deleteAgent() {
    if (!userId || !agent) return;
    if (!window.confirm(`Delete customer service agent ${agent.full_name}? This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.delete(`/admin/users/${userId}`);
      navigate("/admin/customer-service", { replace: true });
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "Failed to delete agent"));
      setBusy(false);
    }
  }

  const statusLabel =
    agent?.status === "APPROVED" ? "Approved" : agent?.status === "REVOKED" ? "Revoked" : "Pending";
  const statusClass =
    agent?.status === "APPROVED" ? "online" : agent?.status === "PENDING" ? "pending" : "offline";

  if (!isAdmin) {
    return <Navigate to="/admin/overview" replace />;
  }

  return (
    <AppShell title={agent?.full_name || "Customer service agent"} onRefresh={load}>
      <div className="admin-provider-detail">
        <div className="admin-provider-detail-nav">
          <Link className="btn secondary" to="/admin/customer-service">
            ← Back to agents
          </Link>
        </div>

        {note && <p className="pill online">{note}</p>}
        {error && <p className="error">{error}</p>}
        {loading && <p className="muted">Loading agent…</p>}

        {agent && !loading && (
          <>
            <section className="page-panel admin-provider-detail-hero">
              <header className="admin-provider-card-head">
                <div className="admin-provider-card-title">
                  <h2>{form.full_name || agent.full_name}</h2>
                  <p className="admin-provider-card-owner">
                    Customer service · {form.phone_number || agent.phone_number}
                  </p>
                </div>
                <div className="admin-provider-card-badges">
                  <span className={`pill ${statusClass}`}>{statusLabel}</span>
                  <span className={`pill ${agent.is_active ? "online" : "offline"}`}>
                    {agent.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
              </header>

              <footer className="admin-provider-card-actions">
                <div className="admin-provider-card-actions-main">
                  {agent.status === "PENDING" && (
                    <button
                      className="btn"
                      type="button"
                      disabled={busy || saving}
                      onClick={() => void runAction("approve")}
                    >
                      Approve
                    </button>
                  )}
                  {agent.status === "APPROVED" && (
                    <button
                      className="btn secondary"
                      type="button"
                      disabled={busy || saving}
                      onClick={() => void runAction("revoke")}
                    >
                      Revoke
                    </button>
                  )}
                  {agent.status === "REVOKED" && (
                    <button
                      className="btn"
                      type="button"
                      disabled={busy || saving}
                      onClick={() => void runAction("reapprove")}
                    >
                      Re-approve
                    </button>
                  )}
                </div>
                <button
                  className="btn danger admin-provider-delete"
                  type="button"
                  disabled={busy || saving}
                  onClick={() => void deleteAgent()}
                >
                  {busy ? "Working…" : "Delete"}
                </button>
              </footer>
            </section>

            <form className="admin-provider-edit-form" onSubmit={saveDetails}>
              <section className="page-panel admin-provider-detail-section">
                <h3>Account</h3>
                <p className="muted admin-provider-edit-hint">
                  Phone is the sign-in username. Leave password blank to keep the current one.
                </p>
                <dl className="admin-provider-meta">
                  <div>
                    <dt>Joined</dt>
                    <dd>{new Date(agent.created_at).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Verified</dt>
                    <dd>{agent.is_verified ? "Yes" : "No"}</dd>
                  </div>
                </dl>
                <div className="page-form admin-provider-edit-grid">
                  <label className="field">
                    <span>Full name</span>
                    <input
                      required
                      value={form.full_name}
                      onChange={(e) => setField("full_name", e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Phone</span>
                    <input
                      required
                      autoComplete="tel"
                      value={form.phone_number}
                      onChange={(e) => setField("phone_number", e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Email</span>
                    <input
                      required
                      type="email"
                      autoComplete="email"
                      value={form.email}
                      onChange={(e) => setField("email", e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>New password</span>
                    <input
                      type="password"
                      minLength={6}
                      autoComplete="new-password"
                      value={form.password}
                      placeholder="Leave blank to keep"
                      onChange={(e) => setField("password", e.target.value)}
                    />
                  </label>
                </div>
                <div className="page-actions">
                  <button className="btn" type="submit" disabled={saving || busy}>
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </section>
            </form>
          </>
        )}
      </div>
    </AppShell>
  );
}
