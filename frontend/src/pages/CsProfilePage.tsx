import { FormEvent, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { api, apiErrorMessage } from "../services/api";
import { useAuth } from "../store/auth";
import { roleHome, type User } from "../types";

type AccountForm = {
  full_name: string;
  email: string;
  alternate_phone: string;
};

function formFromUser(user: User): AccountForm {
  return {
    full_name: user.full_name || "",
    email: user.email || "",
    alternate_phone: user.alternate_phone || "",
  };
}

export function CsProfilePage() {
  const user = useAuth((s) => s.user);
  const token = useAuth((s) => s.token);
  const setSession = useAuth((s) => s.setSession);
  const [form, setForm] = useState<AccountForm>({
    full_name: "",
    email: "",
    alternate_phone: "",
  });
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (user) setForm(formFromUser(user));
  }, [user]);

  if (user && user.role !== "CUSTOMER_SERVICE") {
    return <Navigate to={roleHome(user.role)} replace />;
  }

  function setField<K extends keyof AccountForm>(key: K, value: AccountForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function saveAccount(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!form.full_name.trim()) {
      setError("Full name is required");
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
      const { data } = await api.patch<User>("/auth/me", {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        alternate_phone: form.alternate_phone.trim() || null,
      });
      setSession(token, data);
      setForm(formFromUser(data));
      setNote("Profile saved");
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "Failed to save profile"));
    } finally {
      setSaving(false);
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    if (!currentPassword) {
      setError("Enter your current password");
      return;
    }
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    setSavingPassword(true);
    setError("");
    setNote("");
    try {
      const { data } = await api.patch<{ detail: string }>("/auth/me/password", {
        current_password: currentPassword,
        password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNote(data.detail || "Password updated");
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "Failed to update password"));
    } finally {
      setSavingPassword(false);
    }
  }

  if (!user) return null;

  const joined = user.created_at ? new Date(user.created_at).toLocaleString() : "—";

  return (
    <AppShell title="My profile">
      <div className="page-stack narrow">
        <header className="page-hero">
          <p className="dash-eyebrow">Account</p>
          <div className="page-hero-row">
            <div>
              <h2>My profile</h2>
              <p className="muted page-meta">
                <span>Customer service</span>
                <span aria-hidden="true">·</span>
                <span>{user.phone_number}</span>
              </p>
            </div>
            <div className="admin-provider-card-badges">
              <span className={`pill ${user.is_active ? "online" : "offline"}`}>
                {user.is_active ? "Active" : "Inactive"}
              </span>
              <span className={`pill ${user.is_verified ? "online" : ""}`}>
                {user.is_verified ? "Verified" : "Pending"}
              </span>
            </div>
          </div>
          {note && <p className="pill online">{note}</p>}
          {error && <p className="error">{error}</p>}
        </header>

        <form className="page-panel" onSubmit={saveAccount}>
          <h3>Contact</h3>
          <p className="muted page-lead">
            Phone is your sign-in username. Ask an admin if you need it changed.
          </p>
          <div className="page-form admin-provider-edit-grid">
            <label className="field">
              <span>Full name</span>
              <input
                required
                autoComplete="name"
                value={form.full_name}
                onChange={(e) => setField("full_name", e.target.value)}
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
              <span>Phone</span>
              <input readOnly value={user.phone_number} autoComplete="username" />
            </label>
            <label className="field">
              <span>Alternate mobile</span>
              <input
                autoComplete="tel"
                value={form.alternate_phone}
                onChange={(e) => setField("alternate_phone", e.target.value)}
              />
            </label>
          </div>
          <dl className="admin-provider-meta">
            <div>
              <dt>Joined</dt>
              <dd>{joined}</dd>
            </div>
          </dl>
          <div className="page-actions">
            <button className="btn" type="submit" disabled={saving || savingPassword}>
              {saving ? "Saving…" : "Save profile"}
            </button>
          </div>
        </form>

        <form className="page-panel" onSubmit={savePassword}>
          <h3>Password</h3>
          <p className="muted page-lead">Use a new password of at least 6 characters.</p>
          <div className="page-form admin-provider-edit-grid">
            <label className="field">
              <span>Current password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </label>
            <label className="field">
              <span>New password</span>
              <input
                type="password"
                minLength={6}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Confirm new password</span>
              <input
                type="password"
                minLength={6}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </label>
          </div>
          <div className="page-actions">
            <button className="btn" type="submit" disabled={savingPassword || saving}>
              {savingPassword ? "Updating…" : "Update password"}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
