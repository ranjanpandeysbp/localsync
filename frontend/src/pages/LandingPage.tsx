import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MapsLink } from "../components/MapsLink";
import { offerKindLabel } from "../components/ProviderTrust";
import { api } from "../services/api";
import { reverseGeocodeDetails } from "../services/geo";
import { providerPublicPath } from "../utils/providerUrl";
import type {
  CategoryTree,
  ProviderCatalogItem,
  PublicSearchCategory,
  PublicSearchResult,
} from "../types";

type LocState = {
  latitude: number | null;
  longitude: number | null;
  pincode: string;
  label: string;
  status: "idle" | "locating" | "ready" | "denied";
};

export function LandingPage() {
  const searchRef = useRef<HTMLElement | null>(null);
  const [tree, setTree] = useState<CategoryTree[]>([]);
  const [selected, setSelected] = useState<CategoryTree | null>(null);
  const [activeParent, setActiveParent] = useState<CategoryTree | null>(null);
  const [error, setError] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchCats, setSearchCats] = useState<PublicSearchCategory[]>([]);
  const [searchProviders, setSearchProviders] = useState<ProviderCatalogItem[]>([]);
  const [searchDone, setSearchDone] = useState(false);
  const [editingPin, setEditingPin] = useState(false);
  const [pinDraft, setPinDraft] = useState("");
  const [pinPopup, setPinPopup] = useState(false);
  const [loc, setLoc] = useState<LocState>({
    latitude: null,
    longitude: null,
    pincode: "",
    label: "",
    status: "idle",
  });

  const hasCoords = loc.latitude != null && loc.longitude != null;
  const matchHint = useMemo(() => {
    if (hasCoords) return `Near ${loc.label || "you"} · within 5 km`;
    if (loc.pincode.length === 6) return `In pincode ${loc.pincode}`;
    return "Allow location or enter a pincode to see nearby providers";
  }, [hasCoords, loc.label, loc.pincode]);

  useEffect(() => {
    void api
      .get<CategoryTree[]>("/categories/tree")
      .then((res) => setTree(res.data))
      .catch(() => setError("Could not load categories"));
    detectLocation();
  }, []);

  function detectLocation() {
    if (!navigator.geolocation) {
      setLoc((s) => ({ ...s, status: "denied", label: "Location unavailable" }));
      return;
    }
    setLoc((s) => ({ ...s, status: "locating" }));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latitude = pos.coords.latitude;
        const longitude = pos.coords.longitude;
        setLoc((s) => ({
          ...s,
          latitude,
          longitude,
          label: "Resolving place name…",
          status: "ready",
        }));
        void reverseGeocodeDetails(latitude, longitude).then((details) => {
          const place =
            details?.city?.trim() ||
            details?.location_label?.split("·")[0]?.trim() ||
            "Current location";
          setLoc((s) => ({
            ...s,
            latitude,
            longitude,
            label: place,
            pincode: details?.pincode?.trim() || s.pincode,
            status: "ready",
          }));
        });
      },
      () => {
        setLoc((s) => ({
          ...s,
          status: "denied",
          label: "Location denied — enter pincode",
        }));
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function onSelectCategory(cat: CategoryTree | PublicSearchCategory, parent?: CategoryTree) {
    const full =
      "subcategories" in cat
        ? (cat as CategoryTree)
        : tree.find((t) => t.id === cat.id) ||
          tree.flatMap((t) => t.subcategories || []).find((s) => s.id === cat.id) ||
          ({
            id: cat.id,
            name: cat.name,
            slug: cat.slug,
            description: cat.description,
            kind: cat.kind,
            is_active: true,
            subcategories: [],
          } as CategoryTree);

    if (parent) {
      setActiveParent(parent);
    } else if ("subcategories" in cat) {
      setActiveParent(full);
    } else {
      const owner = tree.find((t) => t.subcategories?.some((s) => s.id === full.id));
      setActiveParent(owner || null);
    }

    setSelected(full);
    setSearchDone(false);
  }

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    const q = searchQ.trim();
    const pin = (editingPin ? pinDraft : loc.pincode).replace(/\D/g, "").slice(0, 6);
    if (pin.length !== 6) {
      setPinPopup(true);
      return;
    }
    const appliedFreshPin = editingPin && pin !== loc.pincode;
    if (appliedFreshPin) {
      await applyPincode(pin);
    }
    setSearchBusy(true);
    setError("");
    setSearchDone(false);
    setSelected(null);
    setActiveParent(null);
    try {
      const params: Record<string, string | number> = { q, pincode: pin };
      if (!appliedFreshPin && loc.latitude != null && loc.longitude != null) {
        params.latitude = loc.latitude;
        params.longitude = loc.longitude;
      }
      const { data } = await api.get<PublicSearchResult>("/providers/public-search", { params });
      setSearchCats(data.categories);
      setSearchProviders(data.providers);
      setSearchDone(true);
      window.setTimeout(() => {
        searchRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Search failed";
      setError(String(msg));
    } finally {
      setSearchBusy(false);
    }
  }

  async function applyPincode(rawPin?: string) {
    const pin = (rawPin ?? pinDraft).replace(/\D/g, "").slice(0, 6);
    if (pin.length !== 6) {
      setError("Enter a valid 6-digit pincode");
      return;
    }
    const next = {
      ...loc,
      pincode: pin,
      latitude: null as number | null,
      longitude: null as number | null,
      label: `Pincode ${pin}`,
      status: "ready" as const,
    };
    setLoc(next);
    setEditingPin(false);
    setError("");
  }

  function startEditPin() {
    setPinDraft(loc.pincode || "");
    setEditingPin(true);
    setError("");
  }

  const subcats = activeParent?.subcategories || [];

  return (
    <div className="landing landing-booking">
      <header className="landing-top landing-top-over">
        <div className="landing-top-inner">
          <Link to="/" className="brand landing-brand">
            LocalSync
          </Link>
          <nav className="landing-auth">
            <Link className="btn secondary landing-btn-ghost" to="/login">
              Log in
            </Link>
            <Link className="btn" to="/register">
              Register
            </Link>
          </nav>
        </div>
      </header>

      <section className="landing-hero-bleed">
        <div className="landing-hero-media" aria-hidden="true" />
        <div className="landing-hero-veil" aria-hidden="true" />
        <div className="landing-hero-inner">
          <h1 className="landing-title">LocalSync</h1>
          <p className="landing-lead">
            Book trusted local help — verified providers within 5 km of you.
          </p>

          <form className="landing-booking-pad" onSubmit={onSearch}>
            <div className="landing-pad-field landing-pad-grow">
              <label htmlFor="landing-search-q">What do you need?</label>
              <input
                id="landing-search-q"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Plumbing, cleaning, or leave blank…"
                aria-label="Search products or services"
              />
            </div>
            <div className="landing-pad-divider" aria-hidden="true" />
            <div className="landing-pad-field landing-pad-pin">
              <label htmlFor="landing-pin-field">Pincode</label>
              <div className="landing-pad-pin-row">
                {editingPin ? (
                  <input
                    id="landing-pin-field"
                    inputMode="numeric"
                    maxLength={6}
                    autoFocus
                    value={pinDraft}
                    onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setEditingPin(false);
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void applyPincode();
                      }
                    }}
                    placeholder="6 digits"
                    aria-label="Pincode"
                  />
                ) : (
                  <button
                    id="landing-pin-field"
                    type="button"
                    className="landing-pad-pin-value"
                    onClick={startEditPin}
                  >
                    {loc.pincode || "Add pincode"}
                  </button>
                )}
                <button
                  className="icon-btn landing-area-icon-btn"
                  type="button"
                  title={editingPin ? "Apply pincode" : "Edit pincode"}
                  aria-label={editingPin ? "Apply pincode" : "Edit pincode"}
                  onClick={() => {
                    if (editingPin) void applyPincode();
                    else startEditPin();
                  }}
                >
                  {editingPin ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  )}
                </button>
                <button
                  className="icon-btn landing-area-icon-btn"
                  type="button"
                  title="Detect my location"
                  aria-label="Detect my location"
                  disabled={loc.status === "locating"}
                  onClick={() => {
                    setEditingPin(false);
                    detectLocation();
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z" />
                    <circle cx="12" cy="10" r="2.5" />
                  </svg>
                </button>
              </div>
              <p className="landing-pad-hint">
                {loc.status === "locating"
                  ? "Detecting your area…"
                  : hasCoords
                    ? `${loc.label || "Near you"}`
                    : loc.label || "Uses GPS when available"}
              </p>
            </div>
            <button className="btn landing-pad-submit" type="submit" disabled={searchBusy}>
              {searchBusy ? "Searching…" : "Search"}
            </button>
          </form>
          {error && !searchDone && <p className="error landing-hero-error">{error}</p>}
        </div>
      </section>

      <div className="landing-sheet">
        {searchDone && (
          <section className="landing-section" ref={searchRef} id="search-results">
            <div className="landing-section-head">
              <h2>
                {searchQ.trim()
                  ? `Results for “${searchQ.trim()}”`
                  : loc.pincode.length === 6 && !hasCoords
                    ? `Providers in pincode ${loc.pincode}`
                    : "Providers near you"}
              </h2>
              <p className="muted">{matchHint}</p>
            </div>
            {searchCats.length > 0 && (
              <div className="landing-cat-grid" style={{ marginBottom: "1rem" }}>
                {searchCats.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className="landing-cat"
                    onClick={() => onSelectCategory(cat)}
                  >
                    <span className="landing-cat-mark" aria-hidden="true">
                      {cat.name.slice(0, 1)}
                    </span>
                    <strong>{cat.name}</strong>
                    <span className="muted">
                      {offerKindLabel(cat.kind)}
                      {cat.parent_name ? ` · under ${cat.parent_name}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="landing-provider-list">
              {searchCats.length === 0 && searchProviders.length === 0 && (
                <p className="muted">No matches found. Try another keyword or pick a category.</p>
              )}
              {searchProviders.map((p) => (
                <ProviderCard key={p.user_id} provider={p} />
              ))}
            </div>
          </section>
        )}

        {!searchDone && (
          <section className="landing-section" id="categories">
            <div className="landing-section-head">
              <h2>Popular categories</h2>
              <p className="muted">Browse services, then search above to find verified help near you.</p>
            </div>

            <div className="landing-cat-grid">
              {tree.length === 0 && <p className="muted">Loading categories…</p>}
              {tree.map((cat) => {
                const isActive =
                  selected?.id === cat.id ||
                  activeParent?.id === cat.id ||
                  Boolean(cat.subcategories?.some((s) => s.id === selected?.id));
                const count = cat.subcategories?.length || 0;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    className={`landing-cat ${isActive ? "active" : ""}`}
                    onClick={() => onSelectCategory(cat)}
                  >
                    <span className="landing-cat-mark" aria-hidden="true">
                      {cat.name.slice(0, 1)}
                    </span>
                    <strong>{cat.name}</strong>
                    <span className="muted">
                      {count > 0
                        ? `${count} option${count === 1 ? "" : "s"}`
                        : offerKindLabel(cat.kind)}
                    </span>
                  </button>
                );
              })}
            </div>

            {activeParent && subcats.length > 0 && (
              <div className="landing-subcat-panel">
                <p className="landing-subcat-label">
                  Refine <strong>{activeParent.name}</strong>
                </p>
                <div className="landing-subcat-row">
                  <button
                    type="button"
                    className={`landing-subcat-chip ${selected?.id === activeParent.id ? "active" : ""}`}
                    onClick={() => onSelectCategory(activeParent)}
                  >
                    All {activeParent.name}
                  </button>
                  {subcats.map((sub) => (
                    <button
                      key={sub.id}
                      type="button"
                      className={`landing-subcat-chip ${selected?.id === sub.id ? "active" : ""}`}
                      onClick={() => onSelectCategory(sub, activeParent)}
                    >
                      {sub.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <footer className="landing-footer">
          <strong>LocalSync</strong>
          <span className="muted">Verified providers · nearby matching</span>
        </footer>
      </div>

      {pinPopup && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setPinPopup(false)}
        >
          <div
            className="modal-dialog card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="landing-pin-popup-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="landing-pin-popup-title" style={{ margin: "0 0 0.5rem" }}>
              Please enter the pincode
            </h3>
            <p className="muted" style={{ margin: "0 0 1rem" }}>
              Add a 6-digit pincode, or use Detect my location, then search again.
            </p>
            <button className="btn" type="button" onClick={() => setPinPopup(false)}>
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProviderCard({ provider: p }: { provider: ProviderCatalogItem }) {
  return (
    <div className="card landing-provider">
      <div className="topbar" style={{ marginBottom: "0.35rem" }}>
        <div>
          <strong>
            <Link to={providerPublicPath(p)}>{p.business_name}</Link>
          </strong>
          <div className="muted">{p.full_name}</div>
        </div>
        <span className={`pill ${p.is_online ? "online" : "offline"}`}>
          {p.is_online ? "Online" : "Offline"}
        </span>
      </div>
      <p className="muted">
        {offerKindLabel(p.offer_kind || "BOTH")}
        {p.categories?.length ? ` · ${p.categories.join(", ")}` : ""}
      </p>
      {(p.offerings_detail || p.description) && (
        <p className="muted">{p.offerings_detail || p.description}</p>
      )}
      <MapsLink
        latitude={p.latitude}
        longitude={p.longitude}
        maps_url={p.maps_url}
        label={p.location_label || undefined}
      />
      <div className="landing-cta" style={{ marginTop: "0.85rem" }}>
        <Link className="btn" to={providerPublicPath(p)}>
          View profile
        </Link>
      </div>
    </div>
  );
}
