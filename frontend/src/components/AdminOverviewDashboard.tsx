import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import type {
  AdminAnalytics,
  AdminCustomerServiceAgent,
  AdminOrder,
  AdminProvider,
  AdminSupportConversation,
  Category,
} from "../types";
import { SERVICE_AREAS } from "../utils/serviceAreas";
import { SERVICE_CITIES, matchServiceCity } from "../utils/serviceCities";

const OPEN_ORDER_STATUSES = new Set(["CONFIRMED", "IN_PROGRESS", "DISPUTED"]);
const PROBLEM_STATUSES = new Set(["DISPUTED", "CANCELLED", "REJECTED"]);
const STUCK_DAYS = 7;

function inr(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function daysAgoMs(days: number) {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function inferProviderCity(p: AdminProvider): string | null {
  const fromCity = matchServiceCity(p.city);
  if (fromCity) return fromCity.name;
  const pin = (p.pincode || "").replace(/\D/g, "");
  if (pin.length === 6) {
    const area = SERVICE_AREAS.find((a) => a.pincode === pin);
    if (area) return area.city;
  }
  const fromLabel = matchServiceCity(p.location_label);
  if (fromLabel) return fromLabel.name;
  return null;
}

function parentForCategoryName(tree: Category[], name: string): string | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  for (const parent of tree) {
    if (parent.name.toLowerCase() === n) return parent.name;
    if ((parent.children || []).some((c) => c.name.toLowerCase() === n)) {
      return parent.name;
    }
  }
  return null;
}

function statusLabel(status: string) {
  return status
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AdminOverviewDashboard({
  isAdmin,
  refreshNonce = 0,
}: {
  isAdmin: boolean;
  refreshNonce?: number;
}) {
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [providers, setProviders] = useState<AdminProvider[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [threads, setThreads] = useState<AdminSupportConversation[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [csAgents, setCsAgents] = useState<AdminCustomerServiceAgent[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError("");
      setBusy(true);
      try {
        const [provs, ords, support, cats, analyticsRes, agents] = await Promise.all([
          api.get<AdminProvider[]>("/admin/providers"),
          api.get<AdminOrder[]>("/admin/orders"),
          api.get<AdminSupportConversation[]>("/support-conversations"),
          api.get<Category[]>("/categories/admin/all"),
          api.get<AdminAnalytics>("/admin/analytics", {
            params: { group_by: "city", location_of: "provider" },
          }),
          isAdmin
            ? api.get<AdminCustomerServiceAgent[]>("/admin/customer-service-agents")
            : Promise.resolve({ data: [] as AdminCustomerServiceAgent[] }),
        ]);
        if (cancelled) return;
        setProviders(provs.data);
        setOrders(ords.data);
        setThreads(support.data);
        setCategories(cats.data);
        setAnalytics(analyticsRes.data);
        setCsAgents(agents.data);
      } catch (err: unknown) {
        if (cancelled) return;
        const msg =
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
          "Could not load overview";
        setError(String(msg));
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, refreshNonce]);

  const dash = useMemo(() => {
    const pending = providers.filter((p) => p.verification_status === "PENDING");
    const approved = providers.filter((p) => p.verification_status === "APPROVED");
    const rejected = providers.filter((p) => p.verification_status === "REJECTED");
    const revoked = providers.filter((p) => p.verification_status === "REVOKED");
    const unread = threads
      .filter((t) => (t.unread_count || 0) > 0)
      .sort((a, b) => (b.unread_count || 0) - (a.unread_count || 0));
    const openOrders = orders.filter((o) => OPEN_ORDER_STATUSES.has(o.status));
    const weekStart = daysAgoMs(7);
    const weekGmv = orders.reduce((sum, o) => {
      if (o.status !== "COMPLETED") return sum;
      const when = o.completed_at || o.created_at;
      const t = new Date(when).getTime();
      if (Number.isNaN(t) || t < weekStart) return sum;
      return sum + (o.agreed_price || 0);
    }, 0);
    const watchJobs = orders
      .filter(
        (o) =>
          o.status === "DISPUTED" ||
          ((o.status === "CONFIRMED" || o.status === "IN_PROGRESS") &&
            daysSince(o.created_at) >= STUCK_DAYS),
      )
      .sort((a, b) => {
        if (a.status === "DISPUTED" && b.status !== "DISPUTED") return -1;
        if (b.status === "DISPUTED" && a.status !== "DISPUTED") return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    const pendingCs = csAgents.filter((a) => a.status === "PENDING");
    const problemOrders = orders
      .filter((o) => PROBLEM_STATUSES.has(o.status))
      .sort((a, b) => {
        const rank = (s: string) => (s === "DISPUTED" ? 0 : s === "REJECTED" ? 1 : 2);
        const d = rank(a.status) - rank(b.status);
        if (d !== 0) return d;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

    const cityCounts = SERVICE_CITIES.map((city) => ({
      name: city.name,
      count: approved.filter((p) => inferProviderCity(p) === city.name).length,
    }));
    const noCity = approved.filter((p) => !inferProviderCity(p)).length;
    const cityMax = Math.max(1, ...cityCounts.map((c) => c.count), noCity);

    const mix = categories.map((parent) => {
      const count = approved.filter((p) => {
        const names = [
          p.category_name,
          ...(p.categories || []),
        ].filter((n): n is string => Boolean(n));
        return names.some((n) => parentForCategoryName(categories, n) === parent.name);
      }).length;
      return { name: parent.name, count };
    });
    const uncategorized = approved.filter((p) => {
      const names = [p.category_name, ...(p.categories || [])].filter(
        (n): n is string => Boolean(n),
      );
      return names.every((n) => !parentForCategoryName(categories, n));
    }).length;
    if (uncategorized > 0) mix.push({ name: "Uncategorized", count: uncategorized });
    mix.sort((a, b) => b.count - a.count);
    const mixMax = Math.max(1, ...mix.map((m) => m.count));

    const summary = analytics?.summary;

    return {
      pending,
      approved,
      rejected,
      revoked,
      unread,
      openOrders,
      weekGmv,
      watchJobs,
      pendingCs,
      problemOrders,
      cityCounts,
      noCity,
      cityMax,
      mix,
      mixMax,
      summary,
    };
  }, [providers, orders, threads, categories, analytics, csAgents]);

  return (
    <div className="page-stack admin-overview">
      <header className="page-hero">
        <p className="dash-eyebrow">{isAdmin ? "Admin" : "Customer service"}</p>
        <h2>Home</h2>
        <p className="page-lead">
          Queues for today, then marketplace health. Order filters stay on the Order dashboard.
        </p>
      </header>

      {error && <p className="error">{error}</p>}
      {busy && !providers.length && !orders.length && <p className="muted">Loading overview…</p>}

      <section className="provider-today" aria-label="Today">
        <Link className="provider-today-item is-link" to="/admin/providers">
          <span className="provider-today-label">Pending providers</span>
          <strong className={dash.pending.length ? "is-on" : ""}>{dash.pending.length}</strong>
        </Link>
        <Link className="provider-today-item is-link" to="/admin/messages">
          <span className="provider-today-label">Unread messages</span>
          <strong className={dash.unread.length ? "is-on" : ""}>{dash.unread.length}</strong>
        </Link>
        <Link className="provider-today-item is-link" to="/admin/orders">
          <span className="provider-today-label">Open orders</span>
          <strong>{dash.openOrders.length}</strong>
        </Link>
        <div className="provider-today-item">
          <span className="provider-today-label">Completed GMV this week</span>
          <strong>{inr(dash.weekGmv)}</strong>
        </div>
      </section>

      <section className="provider-board" aria-label="Needs attention">
        <div className="provider-board-head">
          <div>
            <p className="dash-eyebrow">Work</p>
            <h3>Needs attention</h3>
          </div>
        </div>
        <div className={`provider-board-grid admin-board-grid ${isAdmin ? "cols-4" : "cols-3"}`}>
          <article className="dash-surface provider-board-col">
            <div className="provider-board-col-head">
              <h4>Approve these</h4>
              <span>{dash.pending.length}</span>
            </div>
            {dash.pending.length === 0 ? (
              <p className="muted provider-board-empty">No providers waiting.</p>
            ) : (
              <ul>
                {dash.pending.slice(0, 4).map((p) => (
                  <li key={p.user_id}>
                    <Link to={`/admin/providers/${p.user_id}`}>
                      <strong>{p.business_name}</strong>
                      <span className="muted">
                        {p.full_name}
                        {inferProviderCity(p) ? ` · ${inferProviderCity(p)}` : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link className="provider-board-more" to="/admin/providers">
              All providers
            </Link>
          </article>

          <article className="dash-surface provider-board-col">
            <div className="provider-board-col-head">
              <h4>Reply</h4>
              <span>{dash.unread.length}</span>
            </div>
            {dash.unread.length === 0 ? (
              <p className="muted provider-board-empty">No unread threads.</p>
            ) : (
              <ul>
                {dash.unread.slice(0, 4).map((t) => (
                  <li key={t.id}>
                    <Link to={`/admin/providers/${t.provider_id}#messaging`}>
                      <strong>{t.provider_business_name || t.provider_name || "Provider"}</strong>
                      <span className="muted">
                        {t.unread_count} new
                        {t.last_message ? ` · ${t.last_message}` : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link className="provider-board-more" to="/admin/messages">
              All messages
            </Link>
          </article>

          <article className="dash-surface provider-board-col">
            <div className="provider-board-col-head">
              <h4>Watch jobs</h4>
              <span>{dash.watchJobs.length}</span>
            </div>
            {dash.watchJobs.length === 0 ? (
              <p className="muted provider-board-empty">No disputed or stuck jobs.</p>
            ) : (
              <ul>
                {dash.watchJobs.slice(0, 4).map((o) => (
                  <li key={o.id}>
                    <Link to="/admin/orders">
                      <strong>
                        {o.provider_business_name || o.provider_name || "Provider"}
                      </strong>
                      <span className="muted">
                        {statusLabel(o.status)}
                        {o.status !== "DISPUTED" ? ` · ${daysSince(o.created_at)}d` : ""}
                        {` · ${inr(o.agreed_price)}`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link className="provider-board-more" to="/admin/orders">
              Order dashboard
            </Link>
          </article>

          {isAdmin && (
            <article className="dash-surface provider-board-col">
              <div className="provider-board-col-head">
                <h4>CS agents</h4>
                <span>{dash.pendingCs.length}</span>
              </div>
              {dash.pendingCs.length === 0 ? (
                <p className="muted provider-board-empty">No agents waiting to approve.</p>
              ) : (
                <ul>
                  {dash.pendingCs.slice(0, 4).map((a) => (
                    <li key={a.id}>
                      <Link to={`/admin/customer-service/${a.id}`}>
                        <strong>{a.full_name}</strong>
                        <span className="muted">{a.phone_number}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <Link className="provider-board-more" to="/admin/customer-service">
                All agents
              </Link>
            </article>
          )}
        </div>
      </section>

      <section className="admin-overview-health" aria-label="Marketplace health">
        <div className="admin-overview-health-head">
          <div>
            <p className="dash-eyebrow">Marketplace</p>
            <h3>Health</h3>
          </div>
          <Link to="/admin/orders">Order dashboard</Link>
        </div>
        <div className="admin-analytics-kpis">
          <div className="admin-analytics-kpi kpi-consumers">
            <span className="dash-kpi-label">Consumers</span>
            <strong>{dash.summary?.consumers ?? "—"}</strong>
          </div>
          <div className="admin-analytics-kpi kpi-providers">
            <span className="dash-kpi-label">Providers</span>
            <strong>{dash.summary?.providers ?? "—"}</strong>
          </div>
          <div className="admin-analytics-kpi kpi-orders">
            <span className="dash-kpi-label">Orders</span>
            <strong>{dash.summary?.orders ?? "—"}</strong>
          </div>
          <div className="admin-analytics-kpi kpi-completed">
            <span className="dash-kpi-label">Completed</span>
            <strong>{dash.summary?.orders_completed ?? "—"}</strong>
          </div>
          <div className="admin-analytics-kpi kpi-gmv">
            <span className="dash-kpi-label">Completed GMV</span>
            <strong>{dash.summary ? inr(dash.summary.gmv) : "—"}</strong>
          </div>
        </div>
      </section>

      <section className="provider-overview-split">
        <article className="dash-surface admin-funnel">
          <p className="dash-eyebrow">Providers</p>
          <h3>Verification funnel</h3>
          <div className="admin-funnel-grid">
            <Link className="admin-funnel-cell" to="/admin/providers">
              <span>Pending</span>
              <strong>{dash.pending.length}</strong>
            </Link>
            <Link className="admin-funnel-cell is-ok" to="/admin/providers">
              <span>Approved</span>
              <strong>{dash.approved.length}</strong>
            </Link>
            <Link className="admin-funnel-cell is-warn" to="/admin/providers">
              <span>Rejected</span>
              <strong>{dash.rejected.length}</strong>
            </Link>
            <Link className="admin-funnel-cell is-muted" to="/admin/providers">
              <span>Revoked</span>
              <strong>{dash.revoked.length}</strong>
            </Link>
          </div>
        </article>

        <article className="dash-surface admin-problems">
          <div className="provider-expire-head">
            <div>
              <p className="dash-eyebrow">Orders</p>
              <h3>Problem orders</h3>
            </div>
            <Link to="/admin/orders">View all</Link>
          </div>
          {dash.problemOrders.length === 0 ? (
            <p className="muted">No disputed, cancelled, or rejected orders.</p>
          ) : (
            <ul>
              {dash.problemOrders.slice(0, 6).map((o) => (
                <li key={o.id}>
                  <Link to="/admin/orders">
                    <strong>
                      {o.provider_business_name || o.provider_name || "Provider"}
                    </strong>
                    <span>
                      {statusLabel(o.status)} · {inr(o.agreed_price)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      <section className="provider-overview-split">
        <article className="dash-surface provider-mix">
          <p className="dash-eyebrow">Approved providers</p>
          <h3>Coverage by city</h3>
          <ul>
            {dash.cityCounts.map((row) => (
              <li key={row.name}>
                <div className="provider-mix-row">
                  <span>{row.name}</span>
                  <strong>{row.count}</strong>
                </div>
                <span
                  className="provider-mix-bar"
                  style={{ width: `${Math.max(row.count ? 8 : 0, (row.count / dash.cityMax) * 100)}%` }}
                />
              </li>
            ))}
            <li>
              <div className="provider-mix-row">
                <span>No city</span>
                <strong>{dash.noCity}</strong>
              </div>
              <span
                className="provider-mix-bar"
                style={{ width: `${Math.max(dash.noCity ? 8 : 0, (dash.noCity / dash.cityMax) * 100)}%` }}
              />
            </li>
          </ul>
        </article>

        <article className="dash-surface provider-mix">
          <p className="dash-eyebrow">Approved providers</p>
          <h3>Category coverage</h3>
          {dash.mix.length === 0 ? (
            <p className="muted">No categories yet.</p>
          ) : (
            <ul>
              {dash.mix.map((row) => (
                <li key={row.name}>
                  <div className="provider-mix-row">
                    <span>{row.name}</span>
                    <strong>{row.count}</strong>
                  </div>
                  <span
                    className="provider-mix-bar"
                    style={{ width: `${Math.max(row.count ? 8 : 0, (row.count / dash.mixMax) * 100)}%` }}
                  />
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>
    </div>
  );
}
