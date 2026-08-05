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
  const resultsRef = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLElement | null>(null);
  const [tree, setTree] = useState<CategoryTree[]>([]);
  const [selected, setSelected] = useState<CategoryTree | null>(null);
  const [providers, setProviders] = useState<ProviderCatalogItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchCats, setSearchCats] = useState<PublicSearchCategory[]>([]);
  const [searchProviders, setSearchProviders] = useState<ProviderCatalogItem[]>([]);
  const [searchDone, setSearchDone] = useState(false);
  const [loc, setLoc] = useState<LocState>({
    latitude: null,
    longitude: null,
    pincode: "",
    label: "",
    status: "idle",
  });

  const hasCoords = loc.latitude != null && loc.longitude != null;
  const matchHint = useMemo(() => {
    if (hasCoords) return "Showing verified providers within 5 km of your location.";
    if (loc.pincode.length === 6) return `Showing verified providers in pincode ${loc.pincode}.`;
    return "Allow location (or enter a pincode) to see providers within 5 km.";
  }, [hasCoords, loc.pincode]);

  useEffect(() => {
    void api
      .get<CategoryTree[]>("/categories/tree")
      .then((res) => setTree(res.data))
      .catch(() => setError("Could not load categories"));
    detectLocation();
  }, []);

  useEffect(() => {
    if (selected && (hasCoords || loc.pincode.length === 6)) {
      void loadProviders(selected.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCoords, loc.pincode, selected?.id]);

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

  async function loadProviders(categoryId: number, nextLoc = loc) {
    setBusy(true);
    setError("");
    try {
      const params: Record<string, string | number> = { category_id: categoryId };
      if (nextLoc.latitude != null && nextLoc.longitude != null) {
        params.latitude = nextLoc.latitude;
        params.longitude = nextLoc.longitude;
      } else if (nextLoc.pincode.length === 6) {
        params.pincode = nextLoc.pincode;
      }
      const { data } = await api.get<ProviderCatalogItem[]>("/providers/public-catalog", {
        params,
      });
      setProviders(data);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Could not load providers";
      setError(String(msg));
      setProviders([]);
    } finally {
      setBusy(false);
    }
  }

  async function onSelectCategory(cat: CategoryTree | PublicSearchCategory) {
    const full =
      "subcategories" in cat
        ? (cat as CategoryTree)
        : tree.find((t) => t.id === cat.id) ||
          ({
            id: cat.id,
            name: cat.name,
            slug: cat.slug,
            description: cat.description,
            kind: cat.kind,
            is_active: true,
            subcategories: [],
          } as CategoryTree);
    setSelected(full);
    setSearchDone(false);
    await loadProviders(full.id);
    window.setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    const q = searchQ.trim();
    if (q.length < 2) {
      setError("Type at least 2 characters to search");
      return;
    }
    setSearchBusy(true);
    setError("");
    setSearchDone(false);
    try {
      const params: Record<string, string | number> = { q };
      if (loc.latitude != null && loc.longitude != null) {
        params.latitude = loc.latitude;
        params.longitude = loc.longitude;
      } else if (loc.pincode.length === 6) {
        params.pincode = loc.pincode;
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

  async function onPincodeSubmit(e: FormEvent) {
    e.preventDefault();
    const pin = loc.pincode.replace(/\D/g, "").slice(0, 6);
    if (pin.length !== 6) {
      setError("Enter a valid 6-digit pincode");
      return;
    }
    const next = {
      ...loc,
      pincode: pin,
      latitude: null,
      longitude: null,
      label: `Pincode ${pin}`,
      status: "ready" as const,
    };
    setLoc(next);
    if (selected) await loadProviders(selected.id, next);
  }

  return (
    <div className="landing">
      <header className="landing-top">
        <div className="landing-top-inner">
          <Link to="/" className="brand landing-brand">
            LocalSync
          </Link>
          <div className="landing-auth">
            <Link className="btn secondary" to="/login">
              Log in
            </Link>
            <Link className="btn" to="/register">
              Register
            </Link>
          </div>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <p className="landing-kicker">Hyper-local marketplace</p>
          <h1 className="landing-title">LocalSync</h1>
          <p className="landing-lead">
            Find verified providers near you — within 5 km — for everyday products and services.
          </p>
          <form className="landing-search" onSubmit={onSearch}>
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Search products or services (e.g. plumbing, cleaning, furniture)"
              aria-label="Search products or services"
            />
            <button className="btn" type="submit" disabled={searchBusy}>
              {searchBusy ? "Searching…" : "Search"}
            </button>
          </form>
          <div className="landing-cta">
            <Link className="btn" to="/register">
              Get started
            </Link>
            <Link className="btn secondary" to="/login">
              I already have an account
            </Link>
          </div>
        </div>
        <div className="landing-hero-visual" aria-hidden="true">
          <div className="landing-hero-panel">
            <span>Nearby · 5 km</span>
            <strong>Providers ready around you</strong>
            <p>Plumbing · Cleaning · Electrical · more</p>
          </div>
        </div>
      </section>

      {searchDone && (
        <section className="landing-section" ref={searchRef} id="search-results">
          <div className="landing-section-head">
            <h2>Search results for “{searchQ.trim()}”</h2>
            <p className="muted">
              Matching categories and providers
              {hasCoords
                ? " near you (5 km)."
                : loc.pincode.length === 6
                  ? ` in pincode ${loc.pincode}.`
                  : ". Tip: set location above to prioritize nearby providers."}
            </p>
          </div>
          {searchCats.length > 0 && (
            <div className="landing-cat-grid" style={{ marginBottom: "1rem" }}>
              {searchCats.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className="landing-cat"
                  onClick={() => void onSelectCategory(cat)}
                >
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
              <div className="card">
                <p className="muted">No matches found. Try another keyword or browse categories.</p>
              </div>
            )}
            {searchProviders.map((p) => (
              <div key={p.user_id} className="card landing-provider">
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
                <div className="landing-cta" style={{ marginTop: "0.85rem" }}>
                  <Link className="btn" to={providerPublicPath(p)}>
                    View profile
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="landing-section" id="categories">
        <div className="landing-section-head">
          <h2>Browse categories</h2>
          <p className="muted">Pick a category to see approved providers near your location.</p>
        </div>

        <div className="landing-loc-bar card">
          <div>
            <strong>Your area</strong>
            <p className="muted" style={{ margin: "0.25rem 0 0" }}>
              {loc.status === "locating"
                ? "Detecting GPS…"
                : hasCoords
                  ? `${loc.label || "Current location"} (${loc.latitude?.toFixed(4)}, ${loc.longitude?.toFixed(4)})`
                  : loc.label || "Location not set yet"}
            </p>
          </div>
          <div className="landing-loc-actions">
            <button className="btn secondary" type="button" onClick={detectLocation}>
              Use my location
            </button>
            <form className="landing-pin-form" onSubmit={onPincodeSubmit}>
              <input
                inputMode="numeric"
                maxLength={6}
                placeholder="Pincode"
                value={loc.pincode}
                onChange={(e) =>
                  setLoc({ ...loc, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })
                }
              />
              <button className="btn secondary" type="submit">
                Apply
              </button>
            </form>
          </div>
        </div>

        <div className="landing-cat-grid">
          {tree.length === 0 && <p className="muted">Loading categories…</p>}
          {tree.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`landing-cat ${selected?.id === cat.id ? "active" : ""}`}
              onClick={() => void onSelectCategory(cat)}
            >
              <strong>{cat.name}</strong>
              <span className="muted">
                {offerKindLabel(cat.kind)}
                {cat.subcategories?.length
                  ? ` · ${cat.subcategories.length} subcategor${
                      cat.subcategories.length === 1 ? "y" : "ies"
                    }`
                  : ""}
              </span>
              {cat.description && <span className="muted landing-cat-desc">{cat.description}</span>}
            </button>
          ))}
        </div>
      </section>

      <section className="landing-section" ref={resultsRef} id="providers">
        <div className="landing-section-head">
          <h2>{selected ? `Providers · ${selected.name}` : "Nearby providers"}</h2>
          <p className="muted">{matchHint}</p>
        </div>

        {error && <p className="error">{error}</p>}

        {!selected && (
          <div className="card">
            <p className="muted">Select a category above to browse providers within 5 km.</p>
          </div>
        )}

        {selected && (
          <div className="landing-provider-list">
            {busy && <p className="muted">Finding nearby providers…</p>}
            {!busy && providers.length === 0 && (
              <div className="card">
                <p className="muted">
                  No verified providers found nearby for {selected.name}. Try another category,
                  enable GPS, or enter your pincode.
                </p>
                <div className="landing-cta" style={{ marginTop: "1rem" }}>
                  <Link className="btn" to="/register">
                    Register to post a request
                  </Link>
                </div>
              </div>
            )}
            {!busy &&
              providers.map((p) => (
                <div key={p.user_id} className="card landing-provider">
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
                  <p className="muted">
                    Rating {p.average_rating.toFixed(1)} ({p.rating_count})
                    {p.opening_time && p.closing_time
                      ? ` · ${p.opening_time}–${p.closing_time}`
                      : ""}
                  </p>
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
                    <Link className="btn secondary" to="/register">
                      Register to chat or request
                    </Link>
                    <Link className="btn secondary" to="/login">
                      Log in
                    </Link>
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>

      <footer className="landing-footer">
        <strong>LocalSync</strong>
        <span className="muted">Verified providers · nearby matching · quotes & orders</span>
      </footer>
    </div>
  );
}
