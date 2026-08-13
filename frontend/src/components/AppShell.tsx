import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useWebSocket } from "../hooks/useWebSocket";
import { useAuth } from "../store/auth";
import { useAdminNav } from "../store/adminNav";
import { useProviderNav } from "../store/providerNav";
import { unlockNotificationSound } from "../services/sounds";
import { isStaffRole, roleHome, type UserRole } from "../types";
import { CONSUMER_NAV } from "../nav/consumer";

type NavItem = { to: string; label: string; end?: boolean; badge?: number };

function navForRole(
  role: UserRole | undefined,
  adminLabels?: Record<string, string>,
  badges?: { adminUnread?: number; messagesUnread?: number },
  providerVerification?: string | null,
): NavItem[] {
  if (role === "PROVIDER") {
    if (providerVerification === "REVOKED" || providerVerification === "REJECTED") {
      return [
        { to: "/provider/overview", label: "Overview" },
        {
          to: "/provider/support",
          label: "Admin messages",
          badge: badges?.adminUnread || 0,
        },
        { to: "/profile", label: "My profile" },
      ];
    }
    return [
      { to: "/provider/overview", label: "Overview" },
      {
        to: "/provider/support",
        label: "Admin messages",
        badge: badges?.adminUnread || 0,
      },
      { to: "/provider/requests", label: "Incoming requests" },
      { to: "/provider/quotes", label: "My sent quotes" },
      { to: "/provider/orders", label: "Orders" },
      { to: "/profile", label: "My profile" },
    ];
  }
  if (isStaffRole(role)) {
    const items: NavItem[] = [
      { to: "/admin/providers", label: adminLabels?.providers || "Providers" },
      { to: "/admin/consumers", label: adminLabels?.consumers || "Consumers" },
      { to: "/admin/orders", label: adminLabels?.orders || "Order dashboard" },
      { to: "/admin/categories", label: adminLabels?.categories || "Categories" },
      {
        to: "/admin/messages",
        label: "Provider messages",
        badge: badges?.messagesUnread || 0,
      },
    ];
    if (role === "ADMIN") {
      items.push(
        { to: "/admin/customer-service", label: "Customer service agents" },
        { to: "/admin/config", label: "Config" },
      );
    }
    return items;
  }
  return CONSUMER_NAV.map((item) => ({ ...item }));
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
  const adminUnread = useProviderNav((s) => s.adminUnread);
  const refreshAdminUnread = useProviderNav((s) => s.refreshAdminUnread);
  const messagesUnread = useAdminNav((s) => s.counts.messagesUnread);
  const bumpMessagesUnread = useAdminNav((s) => s.bumpMessagesUnread);

  useWebSocket((msg) => {
    const m = msg as { type?: string; payload?: { sender_id?: string } };
    if (!isStaffRole(user?.role) || m.type !== "admin_message") return;
    // Provider replies arrive as admin_message; ignore while already viewing messages inbox/chat
    if (location.pathname.startsWith("/admin/messages")) {
      void refreshCounts();
      return;
    }
    if (location.pathname.startsWith("/admin/providers/")) {
      void refreshCounts();
      return;
    }
    bumpMessagesUnread(1);
  });

  const adminLabels = useMemo(() => {
    if (!isStaffRole(user?.role)) return undefined;
    const pending = counts.pendingProviders
      ? ` · ${counts.pendingProviders} new`
      : "";
    return {
      providers: `Providers (${counts.providers}${pending})`,
      consumers: `Consumers (${counts.consumers})`,
      orders: `Order dashboard (${counts.orders})`,
      categories: `Categories (${counts.categories})`,
    };
  }, [user?.role, counts]);

  const items = useMemo(
    () =>
      navForRole(
        user?.role,
        adminLabels,
        {
          adminUnread: user?.role === "PROVIDER" ? adminUnread : 0,
          messagesUnread: isStaffRole(user?.role) ? messagesUnread : 0,
        },
        user?.verification_status,
      ),
    [user?.role, user?.verification_status, adminLabels, adminUnread, messagesUnread],
  );

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (isStaffRole(user?.role)) void refreshCounts();
    if (user?.role === "PROVIDER") void refreshAdminUnread();
  }, [user?.role, location.pathname, refreshCounts, refreshAdminUnread]);

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

  const home = user ? roleHome(user.role) : "/";

  async function handleRefresh() {
    if (onRefresh) await onRefresh();
    if (isStaffRole(user?.role)) await refreshCounts();
    if (user?.role === "PROVIDER") await refreshAdminUnread();
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
            Gharq
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
              <span className="sidebar-link-label">{item.label}</span>
              {!!item.badge && item.badge > 0 && (
                <span className="nav-badge" aria-label={`${item.badge} unread`}>
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
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
          {(isStaffRole(user?.role) || user?.role === "PROVIDER" || onRefresh) && (
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
              navigate("/", { replace: true });
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
            <button
              type="button"
              className="topbar-logout"
              aria-label="Log out"
              title="Log out"
              onClick={() => {
                logout();
                navigate("/", { replace: true });
              }}
            >
              <LogoutIcon />
            </button>
          </div>
        </header>

        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}

function LogoutIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2v10" />
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
    </svg>
  );
}
