import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useWebSocket } from "../hooks/useWebSocket";
import { useAuth } from "../store/auth";
import { useAdminNav } from "../store/adminNav";
import { useConsumerNav } from "../store/consumerNav";
import { useProviderNav } from "../store/providerNav";
import { unlockNotificationSound } from "../services/sounds";
import { isStaffRole, roleHome, type UserRole } from "../types";
import { CONSUMER_NAV } from "../nav/consumer";
import {
  btnSecondary,
  cn,
  navBadge,
  pill,
  pillOffline,
  pillOnline,
} from "../ui";

type NavItem = { to: string; label: string; end?: boolean; badge?: number };

function navForRole(
  role: UserRole | undefined,
  adminLabels?: Record<string, string>,
  badges?: {
    adminUnread?: number;
    messagesUnread?: number;
    quotesChatUnread?: number;
    receivedQuotesUnread?: number;
    inquiryUnread?: number;
    requestInquiryUnread?: number;
    quoteInquiryUnread?: number;
  },
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
      {
        to: "/provider/requests",
        label: "Incoming requests",
        badge: badges?.requestInquiryUnread || 0,
      },
      {
        to: "/provider/quotes",
        label: "My sent quotes",
        badge: badges?.quoteInquiryUnread || 0,
      },
      { to: "/provider/orders", label: "Orders" },
      { to: "/profile", label: "My profile" },
    ];
  }
  if (isStaffRole(role)) {
    const items: NavItem[] = [
      { to: "/admin/overview", label: "Overview" },
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
  return CONSUMER_NAV.map((item) => {
    if (item.to === "/consumer/quotes") {
      return { ...item, badge: badges?.receivedQuotesUnread || 0 };
    }
    if (item.to === "/consumer/inquiries") {
      return { ...item, badge: badges?.quotesChatUnread || 0 };
    }
    return { ...item };
  });
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
  const inquiryUnread = useProviderNav((s) => s.inquiryUnread);
  const requestInquiryUnread = useProviderNav((s) => s.requestInquiryUnread);
  const quoteInquiryUnread = useProviderNav((s) => s.quoteInquiryUnread);
  const refreshInquiryUnread = useProviderNav((s) => s.refreshInquiryUnread);
  const quotesChatUnread = useConsumerNav((s) => s.quotesChatUnread);
  const receivedQuotesUnread = useConsumerNav((s) => s.receivedQuotesUnread);
  const refreshQuotesChatUnread = useConsumerNav((s) => s.refreshQuotesChatUnread);
  const refreshReceivedQuotesUnread = useConsumerNav((s) => s.refreshReceivedQuotesUnread);
  const markReceivedQuotesSeen = useConsumerNav((s) => s.markReceivedQuotesSeen);
  const bumpQuotesChatUnread = useConsumerNav((s) => s.bumpQuotesChatUnread);
  const messagesUnread = useAdminNav((s) => s.counts.messagesUnread);
  const bumpMessagesUnread = useAdminNav((s) => s.bumpMessagesUnread);

  useWebSocket((msg) => {
    const m = msg as { type?: string; payload?: { sender_id?: string } };
    if (user?.role === "CONSUMER" && (m.type === "new_quote" || m.type === "quote_updated")) {
      if (location.pathname.startsWith("/consumer/quotes")) {
        void refreshReceivedQuotesUnread();
        return;
      }
      void refreshReceivedQuotesUnread();
      return;
    }
    if (user?.role === "CONSUMER" && m.type === "inquiry_message") {
      if (
        location.pathname.startsWith("/consumer/inquiries") ||
        location.pathname.startsWith("/consumer/requests/") ||
        location.pathname.startsWith("/consumer/quotes")
      ) {
        void refreshQuotesChatUnread();
        return;
      }
      bumpQuotesChatUnread(1);
      return;
    }
    if (user?.role === "PROVIDER" && m.type === "inquiry_message") {
      void refreshInquiryUnread();
      return;
    }
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
          inquiryUnread: user?.role === "PROVIDER" ? inquiryUnread : 0,
          requestInquiryUnread: user?.role === "PROVIDER" ? requestInquiryUnread : 0,
          quoteInquiryUnread: user?.role === "PROVIDER" ? quoteInquiryUnread : 0,
          messagesUnread: isStaffRole(user?.role) ? messagesUnread : 0,
          quotesChatUnread: user?.role === "CONSUMER" ? quotesChatUnread : 0,
          receivedQuotesUnread: user?.role === "CONSUMER" ? receivedQuotesUnread : 0,
        },
        user?.verification_status,
      ),
    [
      user?.role,
      user?.verification_status,
      adminLabels,
      adminUnread,
      inquiryUnread,
      requestInquiryUnread,
      quoteInquiryUnread,
      messagesUnread,
      quotesChatUnread,
      receivedQuotesUnread,
    ],
  );

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (isStaffRole(user?.role)) void refreshCounts();
    if (user?.role === "PROVIDER") {
      void refreshAdminUnread();
      void refreshInquiryUnread();
    }
    if (user?.role === "CONSUMER") {
      void refreshQuotesChatUnread();
      if (location.pathname.startsWith("/consumer/quotes")) {
        void markReceivedQuotesSeen();
      } else {
        void refreshReceivedQuotesUnread();
      }
    }
  }, [
    user?.role,
    location.pathname,
    refreshCounts,
    refreshAdminUnread,
    refreshInquiryUnread,
    refreshQuotesChatUnread,
    refreshReceivedQuotesUnread,
    markReceivedQuotesSeen,
  ]);

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
    if (user?.role === "PROVIDER") {
      await refreshAdminUnread();
      await refreshInquiryUnread();
    }
    if (user?.role === "CONSUMER") {
      await refreshQuotesChatUnread();
      await refreshReceivedQuotesUnread();
    }
  }

  const sidebarLink = (active: boolean, subtle = false) =>
    cn(
      "flex items-center justify-between gap-[0.55rem] px-[0.9rem] py-[0.7rem] rounded-xl text-[rgba(244,250,247,0.9)] font-semibold text-[0.92rem] tracking-[-0.015em] transition-[background,color] duration-150",
      !subtle && "hover:bg-white/10",
      active && "bg-accent/18 text-white shadow-[inset_3px_0_0_#eaa11d]",
      subtle && "text-[0.85rem] font-medium opacity-90 pointer-events-none",
    );

  const sidebarLogout = cn(
    btnSecondary,
    "w-full justify-center bg-transparent text-white border-[rgba(234,161,29,0.55)] hover:bg-accent/16 hover:text-white hover:border-[rgba(234,161,29,0.55)]",
  );

  return (
    <div
      className={cn(
        "min-h-screen min-w-0 max-w-full grid grid-cols-[260px_minmax(0,1fr)] max-[900px]:grid-cols-1",
      )}
    >
      <button
        type="button"
        className={cn(
          "hidden max-[900px]:block max-[900px]:fixed max-[900px]:inset-0 max-[900px]:z-30 max-[900px]:border-0 max-[900px]:p-0 max-[900px]:m-0 max-[900px]:bg-[rgba(28,42,36,0.45)] max-[900px]:transition-opacity max-[900px]:duration-[320ms] max-[900px]:ease-[cubic-bezier(0.22,1,0.36,1)]",
          open
            ? "max-[900px]:opacity-100 max-[900px]:pointer-events-auto"
            : "max-[900px]:opacity-0 max-[900px]:pointer-events-none",
        )}
        aria-label="Close menu"
        onClick={() => setOpen(false)}
      />

      <aside
        className={cn(
          "sticky top-0 h-screen flex flex-col gap-4 px-4 py-5 bg-[linear-gradient(180deg,#0a3a34_0%,#0f4c43_55%,#136057_100%)] text-bg z-40 overflow-auto",
          "max-[900px]:fixed max-[900px]:left-0 max-[900px]:top-0 max-[900px]:w-[min(86vw,300px)] max-[900px]:-translate-x-[105%] max-[900px]:transition-transform max-[900px]:duration-[320ms] max-[900px]:ease-[cubic-bezier(0.22,1,0.36,1)] max-[900px]:will-change-transform max-[900px]:shadow-soft",
          open && "max-[900px]:translate-x-0",
        )}
        aria-label="Main navigation"
      >
        <div>
          <Link to={home} className="font-display text-[1.45rem] font-bold tracking-[-0.04em] text-white">
            KoshalHaat
          </Link>
          <p className="text-[rgba(244,250,247,0.72)] mt-[0.2rem] mb-0 text-[0.8rem] font-medium tracking-[0.01em]">
            Hyper-local marketplace
          </p>
        </div>

        <nav className="flex flex-col gap-[0.35rem] flex-1">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={() => sidebarLink(isActive(item))}>
              <span className="min-w-0 flex-1">{item.label}</span>
              {!!item.badge && item.badge > 0 && (
                <span className={navBadge} aria-label={`${item.badge} unread`}>
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
            </NavLink>
          ))}
          {(location.pathname.startsWith("/orders/") ||
            location.pathname.startsWith("/consumer/requests/")) && (
            <div className={sidebarLink(true, true)}>
              {location.pathname.startsWith("/orders/") ? (
                "Order detail"
              ) : (
                <>
                  <span className="min-w-0 flex-1">Request quotes</span>
                  {quotesChatUnread > 0 && (
                    <span className={navBadge} aria-label={`${quotesChatUnread} unread`}>
                      {quotesChatUnread > 99 ? "99+" : quotesChatUnread}
                    </span>
                  )}
                </>
              )}
            </div>
          )}
        </nav>

        <div className="mt-auto pt-4 border-t border-solid border-white/15 flex flex-col gap-3">
          {(isStaffRole(user?.role) || user?.role === "PROVIDER" || onRefresh) && (
            <button
              className={sidebarLogout}
              type="button"
              disabled={countsLoading}
              onClick={() => void handleRefresh()}
            >
              Refresh
            </button>
          )}
          <div className="flex flex-col gap-[0.15rem] text-[0.9rem]">
            <strong>{user?.full_name}</strong>
            <span className="text-[rgba(244,250,247,0.65)] text-[0.78rem] font-medium">
              {user?.role}
              {user?.phone_number ? ` · ${user.phone_number}` : ""}
            </span>
          </div>
          <button
            className={sidebarLogout}
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

      <div className="min-w-0 flex flex-col min-h-screen">
        <header className="flex items-center justify-between gap-4 px-5 py-4 sticky top-0 z-20 bg-[rgba(247,250,248,0.9)] backdrop-blur-[10px] border-b border-solid border-line max-[560px]:px-[0.9rem] max-[560px]:py-[0.85rem]">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              className="hidden max-[900px]:flex w-[42px] h-[42px] rounded-xl border border-solid border-line bg-card p-[0.65rem] flex-col justify-between cursor-pointer shrink-0"
              aria-label="Open menu"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <span className="block h-0.5 w-full bg-ink rounded-sm" />
              <span className="block h-0.5 w-full bg-ink rounded-sm" />
              <span className="block h-0.5 w-full bg-ink rounded-sm" />
            </button>
            <div>
              <h1 className="m-0 font-display text-[1.2rem] font-bold tracking-[-0.03em] text-brand-dark max-[560px]:text-[1.1rem]">
                {title}
              </h1>
            </div>
          </div>
          <div className="flex gap-[0.6rem] items-center flex-wrap">
            {typeof connected === "boolean" && (
              <span className={connected ? pillOnline : pillOffline}>
                {connected ? "Live" : "Reconnecting"}
              </span>
            )}
            <span className={cn(pill, "max-[900px]:hidden")}>{user?.full_name}</span>
            <button
              type="button"
              className="inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-xl border border-solid border-line bg-card text-brand-dark cursor-pointer transition-colors hover:bg-primary/8 hover:border-primary/28 hover:text-brand focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
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

        <main className="p-5 w-[min(1100px,100%)] mx-auto max-[900px]:p-4">{children}</main>
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
