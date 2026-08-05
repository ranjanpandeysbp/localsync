import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../store/auth";
import { useAdminNav } from "../store/adminNav";
import { unlockNotificationSound } from "../services/sounds";
import type { UserRole } from "../types";

type NavItem = { to: string; label: string; end?: boolean };

function navForRole(role: UserRole | undefined, adminLabels?: Record<string, string>): NavItem[] {
  if (role === "PROVIDER") {
    return [
      { to: "/provider/overview", label: "Overview" },
      { to: "/provider/inquiries", label: "Consumer inquiries" },
      { to: "/provider/requests", label: "Nearby requests" },
      { to: "/provider/quote", label: "Submit quote" },
      { to: "/provider/quotes", label: "My sent quotes" },
      { to: "/provider/orders", label: "Orders" },
      { to: "/profile", label: "My profile" },
    ];
  }
  if (role === "ADMIN") {
    return [
      { to: "/admin/providers", label: adminLabels?.providers || "Providers" },
      { to: "/admin/consumers", label: adminLabels?.consumers || "Consumers" },
      { to: "/admin/orders", label: adminLabels?.orders || "Orders" },
      { to: "/admin/categories", label: adminLabels?.categories || "Categories" },
      { to: "/admin/config", label: "Config" },
    ];
  }
  return [
    { to: "/consumer/details", label: "My details" },
    { to: "/consumer/requests", label: "My requests" },
    { to: "/consumer/post", label: "Post a request" },
    { to: "/consumer/providers", label: "Providers in category" },
    { to: "/consumer/inquiries", label: "Recent inquiries" },
    { to: "/consumer/quotes", label: "All quotes received" },
    { to: "/consumer/orders", label: "Complete Orders" },
  ];
}

export function AppShell({
  title,
  children,
  connected,
  onRefresh,
}: {
  title: string;
  children: React.ReactNode;
  connected?: boolean;
  onRefresh?: () => void | Promise<void>;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const counts = useAdminNav((s) => s.counts);
  const refreshCounts = useAdminNav((s) => s.refreshCounts);
  const countsLoading = useAdminNav((s) => s.loading);

  const adminLabels = useMemo(() => {
    if (user?.role !== "ADMIN") return undefined;
    const pending = counts.pendingProviders
      ? ` · ${counts.pendingProviders} new`
      : "";
    return {
      providers: `Providers (${counts.providers}${pending})`,
      consumers: `Consumers (${counts.consumers})`,
      orders: `Orders (${counts.orders})`,
      categories: `Categories (${counts.categories})`,
    };
  }, [user?.role, counts]);

  const items = useMemo(
    () => navForRole(user?.role, adminLabels),
    [user?.role, adminLabels],
  );

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (user?.role === "ADMIN") void refreshCounts();
  }, [user?.role, location.pathname, refreshCounts]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    const unlock = () => {
      void unlockNotificationSound();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  function isActive(item: NavItem) {
    if (item.end) return location.pathname === item.to;
    return location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
  }

  const home =
    user?.role === "PROVIDER"
      ? "/provider/overview"
      : user?.role === "ADMIN"
        ? "/admin/providers"
        : "/consumer/details";

  async function handleRefresh() {
    if (onRefresh) await onRefresh();
    if (user?.role === "ADMIN") await refreshCounts();
  }

  return (
    <div className={`app-layout ${open ? "nav-open" : ""}`}>
      <button
        type="button"
        className="sidebar-backdrop"
        aria-label="Close menu"
        onClick={() => setOpen(false)}
      />

      <aside className="sidebar" aria-label="Main navigation">
        <div className="sidebar-brand">
          <Link to={home} className="brand">
            LocalSync
          </Link>
          <p className="muted sidebar-tagline">Hyper-local marketplace</p>
        </div>

        <nav className="sidebar-nav">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={() => `sidebar-link ${isActive(item) ? "active" : ""}`}
            >
              {item.label}
            </NavLink>
          ))}
          {(location.pathname.startsWith("/orders/") ||
            location.pathname.startsWith("/consumer/requests/")) && (
            <div className="sidebar-link active subtle">
              {location.pathname.startsWith("/orders/") ? "Order detail" : "Request quotes"}
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          {(user?.role === "ADMIN" || onRefresh) && (
            <button
              className="btn secondary sidebar-logout"
              type="button"
              disabled={countsLoading}
              onClick={() => void handleRefresh()}
            >
              Refresh
            </button>
          )}
          <div className="sidebar-user">
            <strong>{user?.full_name}</strong>
            <span className="muted">
              {user?.role}
              {user?.phone_number ? ` · ${user.phone_number}` : ""}
            </span>
          </div>
          <button
            className="btn secondary sidebar-logout"
            type="button"
            onClick={() => {
              logout();
              navigate("/login");
            }}
          >
            Log out
          </button>
        </div>
      </aside>

      <div className="main-pane">
        <header className="main-topbar">
          <div className="main-topbar-left">
            <button
              type="button"
              className="menu-toggle"
              aria-label="Open menu"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <span />
              <span />
              <span />
            </button>
            <div>
              <h1 className="page-title">{title}</h1>
            </div>
          </div>
          <div className="nav-actions">
            {typeof connected === "boolean" && (
              <span className={`pill ${connected ? "online" : "offline"}`}>
                {connected ? "Live" : "Reconnecting"}
              </span>
            )}
            <span className="pill hide-sm">{user?.full_name}</span>
          </div>
        </header>

        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
