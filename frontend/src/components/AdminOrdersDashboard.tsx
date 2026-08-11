import { useEffect, useState } from "react";
import { api } from "../services/api";
import type {
  AdminAnalytics,
  AdminAnalyticsGroupBy,
  AdminAnalyticsLocationOf,
  AdminOrder,
} from "../types";

const GROUP_OPTIONS: { value: AdminAnalyticsGroupBy; label: string }[] = [
  { value: "state", label: "State" },
  { value: "city", label: "City" },
  { value: "area", label: "Area" },
  { value: "pincode", label: "Pincode" },
];

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "#0f4c43",
  CONFIRMED: "#2563eb",
  IN_PROGRESS: "#eaa11d",
  CANCELLED: "#b42318",
  DISPUTED: "#7c3aed",
};

type DatePreset = "7d" | "30d" | "90d" | "month" | "all" | "custom";

function inr(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function rangeForPreset(preset: DatePreset): { from: string; to: string } {
  const today = new Date();
  const to = toISODate(today);
  if (preset === "all") return { from: "", to: "" };
  if (preset === "month") {
    return { from: toISODate(new Date(today.getFullYear(), today.getMonth(), 1)), to };
  }
  const days = preset === "7d" ? 6 : preset === "30d" ? 29 : 89;
  const from = new Date(today);
  from.setDate(today.getDate() - days);
  return { from: toISODate(from), to };
}

function statusColor(status: string) {
  return STATUS_COLORS[status] || "#5b6b62";
}

export function AdminOrdersDashboard() {
  const initial = rangeForPreset("30d");
  const [groupBy, setGroupBy] = useState<AdminAnalyticsGroupBy>("city");
  const [locationOf, setLocationOf] = useState<AdminAnalyticsLocationOf>("consumer");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [pincode, setPincode] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("30d");
  const [dateFrom, setDateFrom] = useState(initial.from);
  const [dateTo, setDateTo] = useState(initial.to);
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showOrders, setShowOrders] = useState(false);

  function applyPreset(preset: DatePreset) {
    setDatePreset(preset);
    if (preset === "custom") return;
    const range = rangeForPreset(preset);
    setDateFrom(range.from);
    setDateTo(range.to);
  }

  async function load() {
    setBusy(true);
    setError("");
    try {
      const params: Record<string, string> = {
        group_by: groupBy,
        location_of: locationOf,
      };
      if (state) params.state = state;
      if (city) params.city = city;
      if (area) params.area = area;
      if (pincode) params.pincode = pincode;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      const orderParams: Record<string, string> = {};
      if (dateFrom) orderParams.date_from = dateFrom;
      if (dateTo) orderParams.date_to = dateTo;

      const [analyticsRes, ordersRes] = await Promise.all([
        api.get<AdminAnalytics>("/admin/analytics", { params }),
        api.get<AdminOrder[]>("/admin/orders", { params: orderParams }),
      ]);
      setAnalytics(analyticsRes.data);
      setOrders(ordersRes.data);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed to load dashboard";
      setError(String(msg));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, [groupBy, locationOf, state, city, area, pincode, dateFrom, dateTo]);

  const options = analytics?.filter_options;
  const summary = analytics?.summary;

  function clearFilters() {
    setState("");
    setCity("");
    setArea("");
    setPincode("");
  }

  const hasFilters = Boolean(state || city || area || pincode);
  const rangeLabel =
    dateFrom || dateTo
      ? `${dateFrom || "…"} → ${dateTo || "…"}`
      : "All time";

  return (
    <div className={`admin-analytics ${busy ? "is-loading" : ""}`}>
      <header className="admin-analytics-hero dash-surface">
        <div className="admin-analytics-hero-top">
          <div>
            <p className="dash-eyebrow">Analytics</p>
            <h2>Order dashboard</h2>
            <p className="muted">
              Track demand, supply, and revenue by location and date.
            </p>
          </div>
          <div className="admin-analytics-hero-actions">
            <span className="dash-range-pill">{rangeLabel}</span>
            <button
              className="btn secondary"
              type="button"
              onClick={() => void load()}
              disabled={busy}
            >
              {busy ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        <div className="admin-analytics-datebar">
          <div className="dash-segment" role="tablist" aria-label="Date range">
            {(
              [
                ["7d", "7 days"],
                ["30d", "30 days"],
                ["90d", "90 days"],
                ["month", "This month"],
                ["all", "All time"],
                ["custom", "Custom"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`dash-segment-btn ${datePreset === value ? "active" : ""}`}
                onClick={() => applyPreset(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="admin-analytics-custom-dates">
            <div className="field">
              <label htmlFor="dash-date-from">From</label>
              <input
                id="dash-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDatePreset("custom");
                  setDateFrom(e.target.value);
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="dash-date-to">To</label>
              <input
                id="dash-date-to"
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDatePreset("custom");
                  setDateTo(e.target.value);
                }}
              />
            </div>
          </div>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      <div className="admin-analytics-kpis">
        <div className="admin-analytics-kpi kpi-consumers">
          <span className="dash-kpi-label">Consumers</span>
          <strong>{summary?.consumers ?? "—"}</strong>
        </div>
        <div className="admin-analytics-kpi kpi-providers">
          <span className="dash-kpi-label">Providers</span>
          <strong>{summary?.providers ?? "—"}</strong>
        </div>
        <div className="admin-analytics-kpi kpi-orders">
          <span className="dash-kpi-label">Orders</span>
          <strong>{summary?.orders ?? "—"}</strong>
        </div>
        <div className="admin-analytics-kpi kpi-completed">
          <span className="dash-kpi-label">Completed</span>
          <strong>{summary?.orders_completed ?? "—"}</strong>
        </div>
        <div className="admin-analytics-kpi kpi-gmv">
          <span className="dash-kpi-label">Completed GMV</span>
          <strong>{summary ? inr(summary.gmv) : "—"}</strong>
        </div>
      </div>

      <section className="dash-surface admin-analytics-filters">
        <div className="dash-section-head">
          <p className="dash-eyebrow">Filters</p>
          <h3>Location scope</h3>
        </div>
        <div className="admin-analytics-filter-row">
          <div className="field">
            <label>Group by</label>
            <div className="dash-segment" role="tablist" aria-label="Group by location">
              {GROUP_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`dash-segment-btn ${groupBy === opt.value ? "active" : ""}`}
                  onClick={() => setGroupBy(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Order location from</label>
            <div className="dash-segment" role="tablist" aria-label="Order location source">
              <button
                type="button"
                className={`dash-segment-btn ${locationOf === "consumer" ? "active" : ""}`}
                onClick={() => setLocationOf("consumer")}
              >
                Consumer
              </button>
              <button
                type="button"
                className={`dash-segment-btn ${locationOf === "provider" ? "active" : ""}`}
                onClick={() => setLocationOf("provider")}
              >
                Provider
              </button>
            </div>
          </div>
        </div>

        <div className="admin-analytics-filter-grid">
          <div className="field">
            <label>State</label>
            <select value={state} onChange={(e) => setState(e.target.value)}>
              <option value="">All states</option>
              {(options?.states || []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>City</label>
            <select value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">All cities</option>
              {(options?.cities || []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Area</label>
            <select value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="">All areas</option>
              {(options?.areas || []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Pincode</label>
            <select value={pincode} onChange={(e) => setPincode(e.target.value)}>
              <option value="">All pincodes</option>
              {(options?.pincodes || []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {hasFilters && (
          <button className="btn secondary" type="button" onClick={clearFilters}>
            Clear location filters
          </button>
        )}
      </section>

      <section className="dash-surface admin-analytics-panel">
        <div className="admin-analytics-panel-head">
          <div className="dash-section-head">
            <p className="dash-eyebrow">Geography</p>
            <h3>By {GROUP_OPTIONS.find((g) => g.value === groupBy)?.label.toLowerCase()}</h3>
            <p className="muted">
              Top locations · consumers, providers, and orders
              {summary?.unknown_location
                ? ` · ${summary.unknown_location} missing location`
                : ""}
            </p>
          </div>
          <div className="admin-analytics-legend">
            <span>
              <i className="consumers" /> Consumers
            </span>
            <span>
              <i className="providers" /> Providers
            </span>
            <span>
              <i className="orders" /> Orders
            </span>
          </div>
        </div>
        {busy && !analytics && <p className="muted">Loading…</p>}

        <div className="admin-analytics-table-wrap">
          <table className="admin-analytics-table">
            <thead>
              <tr>
                <th>Location</th>
                <th>Consumers</th>
                <th>Providers</th>
                <th>Orders</th>
                <th>Completed</th>
                <th>GMV</th>
              </tr>
            </thead>
            <tbody>
              {(analytics?.buckets || []).map((b) => (
                <tr key={b.key}>
                  <td>
                    <strong>{b.label}</strong>
                  </td>
                  <td>
                    <span className="admin-metric consumers">{b.consumers}</span>
                  </td>
                  <td>
                    <span className="admin-metric providers">{b.providers}</span>
                  </td>
                  <td>
                    <span className="admin-metric orders">{b.orders}</span>
                  </td>
                  <td>{b.orders_completed}</td>
                  <td>{inr(b.gmv)}</td>
                </tr>
              ))}
              {(analytics?.buckets || []).length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    No data for this location and date combination.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dash-surface admin-analytics-panel">
        <div className="admin-analytics-panel-head">
          <div className="dash-section-head">
            <p className="dash-eyebrow">Transactions</p>
            <h3>Orders in range</h3>
            <p className="muted">
              {orders.length} order{orders.length === 1 ? "" : "s"} · {rangeLabel}
            </p>
          </div>
          <button
            className="btn secondary"
            type="button"
            onClick={() => setShowOrders((v) => !v)}
          >
            {showOrders ? "Hide list" : "Show list"}
          </button>
        </div>
        {showOrders && (
          <div className="list dash-order-list">
            {orders.length === 0 && <p className="muted">No orders in this range.</p>}
            {orders.map((o) => (
              <div key={o.id} className="list-item dash-order-item">
                <div className="topbar" style={{ marginBottom: "0.35rem" }}>
                  <strong>{inr(o.agreed_price)}</strong>
                  <span
                    className="pill"
                    style={{
                      background: `${statusColor(o.status)}18`,
                      color: statusColor(o.status),
                    }}
                  >
                    {o.status}
                  </span>
                </div>
                <p>
                  <strong>{o.consumer_name || "Consumer"}</strong>
                  <span className="muted"> → </span>
                  <strong>{o.provider_business_name || o.provider_name || "Provider"}</strong>
                </p>
                <p className="muted">
                  {o.fulfillment_type.replaceAll("_", " ")} ·{" "}
                  {new Date(o.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
