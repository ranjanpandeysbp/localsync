import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useNavigate, useSearchParams } from "react-router-dom";
import { LoginModal } from "../components/LoginModal";
import { PostRequestModal } from "../components/PostRequestModal";
import { RegisterModal } from "../components/RegisterModal";
import { MapsLink } from "../components/MapsLink";
import { MarketplaceScene } from "../components/MarketplaceScene";
import { offerKindClass, offerKindLabel } from "../components/ProviderTrust";
import { CONSUMER_NAV } from "../nav/consumer";
import { api } from "../services/api";
import { reverseGeocodeDetails, isMeaningfulLocationLabel } from "../services/geo";
import { useAuth } from "../store/auth";
import { providerPublicPath } from "../utils/providerUrl";
import {
  clearPostRequestDraft,
  majorityCategoryId,
  providersShareTopLevelCategory,
  readPostRequestDraft,
  SAME_CATEGORY_REQUEST_MESSAGE,
  savePostRequestDraft,
  type PostRequestDraft,
} from "../utils/postRequestDraft";
import type {
  Category,
  CategoryTree,
  NearbyCategoryCounts,
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
  const navigate = useNavigate();
  const { user, token, logout } = useAuth();
  const signedIn = Boolean(token && user);
  const [searchParams, setSearchParams] = useSearchParams();
  const searchRef = useRef<HTMLElement | null>(null);
  const browseRef = useRef<HTMLElement | null>(null);
  const [tree, setTree] = useState<CategoryTree[]>([]);
  const [nearbyCounts, setNearbyCounts] = useState<Record<number, number>>({});
  const [countsReady, setCountsReady] = useState(false);
  const [selected, setSelected] = useState<CategoryTree | Category | null>(null);
  const [categoryProviders, setCategoryProviders] = useState<ProviderCatalogItem[]>([]);
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [error, setError] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchProviders, setSearchProviders] = useState<ProviderCatalogItem[]>([]);
  const [searchDone, setSearchDone] = useState(false);
  const [selectedSearchIds, setSelectedSearchIds] = useState<string[]>([]);
  const [searchActionError, setSearchActionError] = useState("");
  const [postDraft, setPostDraft] = useState<PostRequestDraft | null>(null);
  const [postModalOpen, setPostModalOpen] = useState(false);
  const [categoryMismatchPopup, setCategoryMismatchPopup] = useState(false);
  const [editingPin, setEditingPin] = useState(false);
  const [pinDraft, setPinDraft] = useState("");
  const [pinPopup, setPinPopup] = useState(false);
  const [loginOpen, setLoginOpen] = useState(
    () => !signedIn && searchParams.get("login") === "1",
  );
  const [registerOpen, setRegisterOpen] = useState(
    () => !signedIn && searchParams.get("register") === "1",
  );
  const [navOpen, setNavOpen] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 961px)").matches : true,
  );
  const [loc, setLoc] = useState<LocState>({
    latitude: null,
    longitude: null,
    pincode: "",
    label: "",
    status: "idle",
  });

  const hasCoords = loc.latitude != null && loc.longitude != null;
  const hasLocation = hasCoords || loc.pincode.length === 6;
  const matchHint = useMemo(() => {
    if (hasCoords) return `Near ${loc.label || "you"} · within 5 km`;
    if (loc.pincode.length === 6) return `In pincode ${loc.pincode}`;
    return "Allow location or enter a pincode to see nearby providers";
  }, [hasCoords, loc.label, loc.pincode]);

  const popularTree = useMemo(() => {
    if (!countsReady || !hasLocation) return tree;
    return [...tree].sort(
      (a, b) => (nearbyCounts[b.id] || 0) - (nearbyCounts[a.id] || 0),
    );
  }, [tree, nearbyCounts, countsReady, hasLocation]);

  const browsing = Boolean(selected) && !searchDone;

  useEffect(() => {
    void api
      .get<CategoryTree[]>("/categories/tree")
      .then((res) => setTree(res.data))
      .catch(() => setError("Could not load categories"));
    detectLocation();
  }, []);

  useEffect(() => {
    if (!hasCoords && loc.pincode.length !== 6) {
      setNearbyCounts({});
      setCountsReady(false);
      return;
    }
    let cancelled = false;
    const params: Record<string, string | number> = {};
    if (hasCoords) {
      params.latitude = loc.latitude!;
      params.longitude = loc.longitude!;
    }
    if (loc.pincode.length === 6) params.pincode = loc.pincode;

    void api
      .get<NearbyCategoryCounts>("/providers/nearby-category-counts", { params })
      .then((res) => {
        if (cancelled) return;
        const map: Record<number, number> = {};
        for (const row of res.data.counts) {
          map[row.category_id] = row.nearby_count;
        }
        setNearbyCounts(map);
        setCountsReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setNearbyCounts({});
        setCountsReady(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loc.latitude, loc.longitude, loc.pincode, hasCoords]);

  useEffect(() => {
    if (!selected || searchDone) {
      setCategoryProviders([]);
      setCategoryBusy(false);
      return;
    }
    if (!hasLocation) {
      setCategoryProviders([]);
      setCategoryBusy(false);
      return;
    }

    let cancelled = false;
    setCategoryBusy(true);
    const params: Record<string, string | number> = { category_id: selected.id };
    if (hasCoords) {
      params.latitude = loc.latitude!;
      params.longitude = loc.longitude!;
    }
    if (loc.pincode.length === 6) params.pincode = loc.pincode;

    void api
      .get<ProviderCatalogItem[]>("/providers/public-catalog", { params })
      .then((res) => {
        if (cancelled) return;
        setCategoryProviders(res.data);
      })
      .catch(() => {
        if (cancelled) return;
        setCategoryProviders([]);
        setError("Could not load providers for this category");
      })
      .finally(() => {
        if (!cancelled) setCategoryBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    selected?.id,
    searchDone,
    loc.latitude,
    loc.longitude,
    loc.pincode,
    hasCoords,
    hasLocation,
  ]);

  useEffect(() => {
    if (!filterOpen) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest(".landing-cat-filter-menu")) return;
      setFilterOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [filterOpen]);

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

  function resolveCategory(
    cat: CategoryTree | Category | PublicSearchCategory,
    parent?: CategoryTree,
  ): CategoryTree | Category {
    if ("subcategories" in cat) return cat as CategoryTree;
    return (
      tree.find((t) => t.id === cat.id) ||
      tree.flatMap((t) => t.subcategories || []).find((s) => s.id === cat.id) ||
      ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        kind: cat.kind,
        is_active: true,
        subcategories: [],
        parent_id: parent?.id,
      } as Category)
    );
  }

  function onSelectCategory(
    cat: CategoryTree | Category | PublicSearchCategory,
    parent?: CategoryTree,
  ) {
    const full = resolveCategory(cat, parent);
    setSelected(full);
    setSearchDone(false);
    setSearchProviders([]);
    setSelectedSearchIds([]);
    setSearchActionError("");
    setFilterOpen(false);
    setError("");
    window.setTimeout(() => {
      browseRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function clearCategoryBrowse() {
    setSelected(null);
    setCategoryProviders([]);
    setFilterOpen(false);
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
    setCategoryProviders([]);
    setSelectedSearchIds([]);
    setSearchActionError("");
    setFilterOpen(false);
    try {
      const params: Record<string, string | number> = { q, pincode: pin };
      if (!appliedFreshPin && loc.latitude != null && loc.longitude != null) {
        params.latitude = loc.latitude;
        params.longitude = loc.longitude;
      }
      const { data } = await api.get<PublicSearchResult>("/providers/public-search", { params });
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

  function categoryMeta(cat: CategoryTree | Category): string {
    const nearby = nearbyCounts[cat.id];
    if (hasLocation && countsReady) {
      return `${nearby || 0}`;
    }
    if ("subcategories" in cat && cat.subcategories?.length) {
      return String(cat.subcategories.length);
    }
    return "";
  }

  const nearbyForSelected = selected ? nearbyCounts[selected.id] : undefined;

  useEffect(() => {
    if (signedIn) {
      setLoginOpen(false);
      setRegisterOpen(false);
      if (searchParams.get("login") === "1" || searchParams.get("register") === "1") {
        const next = new URLSearchParams(searchParams);
        next.delete("login");
        next.delete("register");
        setSearchParams(next, { replace: true });
      }
      return;
    }
    if (searchParams.get("login") === "1") {
      setLoginOpen(true);
      setRegisterOpen(false);
    } else if (searchParams.get("register") === "1") {
      setRegisterOpen(true);
      setLoginOpen(false);
    } else {
      setLoginOpen(false);
      setRegisterOpen(false);
    }
  }, [searchParams, signedIn, setSearchParams]);

  function setAuthParam(kind: "login" | "register" | null) {
    const next = new URLSearchParams(searchParams);
    next.delete("login");
    next.delete("register");
    if (kind === "login") next.set("login", "1");
    if (kind === "register") next.set("register", "1");
    setSearchParams(next, { replace: true });
  }

  function openLogin() {
    if (signedIn) return;
    setLoginOpen(true);
    setRegisterOpen(false);
    setAuthParam("login");
  }

  function openRegister() {
    if (signedIn) return;
    setRegisterOpen(true);
    setLoginOpen(false);
    setAuthParam("register");
  }

  function closeAuth() {
    setLoginOpen(false);
    setRegisterOpen(false);
    setAuthParam(null);
  }

  function toggleSearchProvider(userId: string) {
    setSearchActionError("");
    setSelectedSearchIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  function buildPostDraft(): PostRequestDraft | null {
    if (selectedSearchIds.length === 0) return null;
    const selected = searchProviders.filter((p) => selectedSearchIds.includes(p.user_id));
    return {
      providerIds: selected.map((p) => p.user_id),
      categoryId: majorityCategoryId(searchProviders, selectedSearchIds),
      providers: selected.map((p) => ({
        id: p.user_id,
        name: p.business_name || p.full_name,
        categoryId: p.category_id,
      })),
    };
  }

  function selectedShareTopLevelCategory(): boolean {
    const selected = searchProviders.filter((p) => selectedSearchIds.includes(p.user_id));
    return providersShareTopLevelCategory(tree, selected);
  }

  function goSendRequest() {
    const draft = buildPostDraft();
    if (!draft) {
      setSearchActionError("Select one or more providers first");
      return;
    }
    setSearchActionError("");

    if (!selectedShareTopLevelCategory()) {
      setCategoryMismatchPopup(true);
      return;
    }

    if (!signedIn || !user) {
      savePostRequestDraft(draft);
      openLogin();
      return;
    }
    if (user.role !== "CONSUMER") {
      setSearchActionError("Only consumers can send requests. Sign in with a consumer account.");
      return;
    }
    setPostDraft(draft);
    setPostModalOpen(true);
  }

  useEffect(() => {
    if (!signedIn || user?.role !== "CONSUMER") return;
    if (tree.length === 0) return;
    const draft = readPostRequestDraft();
    if (!draft) return;
    clearPostRequestDraft();
    const providers = draft.providers?.length
      ? draft.providers
      : draft.providerIds.map((id) => ({ id, name: id, categoryId: draft.categoryId }));
    if (!providersShareTopLevelCategory(tree, providers)) {
      setCategoryMismatchPopup(true);
      return;
    }
    setPostDraft(draft);
    setPostModalOpen(true);
  }, [signedIn, user?.role, tree]);

  function onLogout() {
    logout();
    setNavOpen(false);
    navigate("/");
  }

  useEffect(() => {
    if (!signedIn) {
      setNavOpen(false);
      return;
    }
    setNavOpen(window.matchMedia("(min-width: 961px)").matches);
  }, [signedIn]);

  useEffect(() => {
    document.body.style.overflow = navOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [navOpen]);

  return (
    <div
      className={`landing landing-booking${signedIn ? " landing-with-nav" : ""}${
        navOpen ? " landing-nav-open" : " landing-nav-collapsed"
      }`}
    >
      {!signedIn && (
        <>
          <LoginModal open={loginOpen} onClose={closeAuth} onCreateAccount={openRegister} />
          <RegisterModal open={registerOpen} onClose={closeAuth} onSignIn={openLogin} />
        </>
      )}
      {signedIn && user?.role === "CONSUMER" && (
        <PostRequestModal
          open={postModalOpen}
          draft={postDraft}
          onClose={() => {
            setPostModalOpen(false);
            setPostDraft(null);
          }}
          onSuccess={() => {
            setSelectedSearchIds([]);
            setPostDraft(null);
          }}
        />
      )}

      {signedIn && user && (
        <>
          <button
            type="button"
            className="landing-nav-backdrop"
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
          />
          <aside className="landing-sidebar" aria-label="Consumer navigation">
            <div className="landing-sidebar-brand">
              <div className="landing-sidebar-brand-row">
                <Link to="/" className="brand" onClick={() => setNavOpen(false)}>
                  Gharq
                </Link>
                <button
                  type="button"
                  className="landing-sidebar-close"
                  aria-label="Hide menu"
                  title="Hide menu"
                  onClick={() => setNavOpen(false)}
                >
                  <LandingCloseIcon />
                </button>
              </div>
              <p className="muted sidebar-tagline">Hyper-local marketplace</p>
            </div>
            <nav className="landing-sidebar-nav">
              {CONSUMER_NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `landing-sidebar-link${isActive ? " active" : ""}`
                  }
                  onClick={() => setNavOpen(false)}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="landing-sidebar-footer">
              <div className="sidebar-user">
                <strong>{user.full_name}</strong>
                <span className="muted">
                  {user.role}
                  {user.phone_number ? ` · ${user.phone_number}` : ""}
                </span>
              </div>
              <button
                className="btn secondary sidebar-logout"
                type="button"
                onClick={onLogout}
              >
                Log out
              </button>
            </div>
          </aside>
        </>
      )}

      <div
        className="landing-main"
        onClick={() => {
          if (navOpen) setNavOpen(false);
        }}
      >
        <header className="landing-top landing-top-over">
          <div className="landing-top-inner">
            <div className="landing-top-start">
              {signedIn && (
                <button
                  type="button"
                  className="menu-toggle landing-menu-toggle"
                  aria-label="Open menu"
                  aria-expanded={navOpen}
                  aria-hidden={navOpen ? true : undefined}
                  tabIndex={navOpen ? -1 : undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    setNavOpen(true);
                  }}
                >
                  <span />
                  <span />
                  <span />
                </button>
              )}
              <Link to="/" className="brand landing-brand">
                Gharq
              </Link>
            </div>
            <nav className="landing-auth">
              {signedIn && user ? (
                <>
                  <span className="landing-user-chip" title={user.phone_number || undefined}>
                    {user.full_name}
                  </span>
                  <button
                    type="button"
                    className="topbar-logout landing-logout"
                    aria-label="Log out"
                    title="Log out"
                    onClick={onLogout}
                  >
                    <LandingLogoutIcon />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn secondary landing-btn-ghost"
                    onClick={openLogin}
                  >
                    Log in
                  </button>
                  <button type="button" className="btn" onClick={openRegister}>
                    Register
                  </button>
                </>
              )}
            </nav>
          </div>
        </header>

      <section className="landing-hero-bleed">
        <div className="landing-hero-media" aria-hidden="true">
          <MarketplaceScene className="landing-hero-scene marketplace-scene" idPrefix="landing" />
        </div>
        <div className="landing-hero-veil" aria-hidden="true" />
        <div className="landing-hero-inner">
          <h1 className="landing-title">Gharq</h1>
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
                placeholder="Name, mobile, category, or slug…"
                aria-label="Search by name, mobile, category, or slug"
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
          {error && !searchDone && !browsing && <p className="error landing-hero-error">{error}</p>}
        </div>
      </section>

      <div className="landing-sheet">
        {searchDone && (
          <section className="landing-section landing-section-pad" ref={searchRef} id="search-results">
            <div className="landing-section-head landing-search-head">
              <div>
                <h2>
                  {searchQ.trim()
                    ? `Results for “${searchQ.trim()}”`
                    : loc.pincode.length === 6 && !hasCoords
                      ? `Providers in pincode ${loc.pincode}`
                      : "Providers near you"}
                </h2>
                <p className="muted">{matchHint}</p>
              </div>
              {searchProviders.length > 0 && (
                <div className="landing-search-actions">
                  <p className="muted landing-search-selected">
                    {selectedSearchIds.length === 0
                      ? "Select providers to request"
                      : `${selectedSearchIds.length} selected`}
                  </p>
                  <button
                    type="button"
                    className="btn"
                    onClick={goSendRequest}
                    disabled={selectedSearchIds.length === 0}
                  >
                    Send a request
                  </button>
                </div>
              )}
            </div>
            {searchActionError && <p className="error">{searchActionError}</p>}
            <div className="landing-provider-list">
              {searchProviders.length === 0 && (
                <p className="muted">No providers found. Try another keyword or browse a category below.</p>
              )}
              {searchProviders.map((p) => (
                <ProviderCard
                  key={p.user_id}
                  provider={p}
                  selectable
                  selected={selectedSearchIds.includes(p.user_id)}
                  onToggleSelect={() => toggleSearchProvider(p.user_id)}
                />
              ))}
            </div>
          </section>
        )}

        {!searchDone && !browsing && (
          <section className="landing-section landing-section-pad" id="categories">
            <div className="landing-section-head">
              <h2>Popular categories</h2>
              <p className="muted">
                {hasCoords
                  ? `Verified options near ${loc.label || "you"} within 5 km.`
                  : loc.pincode.length === 6
                    ? `Verified options in pincode ${loc.pincode}.`
                    : "Allow location or enter a pincode to see how many options are near you."}
              </p>
            </div>

            <div className="landing-cat-grid">
              {tree.length === 0 && <p className="muted">Loading categories…</p>}
              {popularTree.map((cat) => {
                const nearby = nearbyCounts[cat.id];
                const subCount = cat.subcategories?.length || 0;
                let meta: string;
                if (hasLocation && countsReady) {
                  meta = `${nearby || 0} option${nearby === 1 ? "" : "s"} nearby`;
                } else if (hasLocation && !countsReady) {
                  meta = "Counting nearby…";
                } else if (subCount > 0) {
                  meta = `${subCount} option${subCount === 1 ? "" : "s"}`;
                } else {
                  meta = offerKindLabel(cat.kind);
                }
                return (
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
                    <span className="muted">{meta}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {browsing && selected && (
          <section
            className={`landing-section ${filterOpen ? "landing-browse-filter-open" : ""}`}
            ref={browseRef}
            id="category-browse"
          >
            <div className="landing-browse-head">
              <div className="landing-section-head" style={{ marginBottom: 0 }}>
                <h2>{selected.name}</h2>
                <p className="muted">
                  {hasLocation
                    ? `${matchHint}${
                        countsReady && nearbyForSelected != null
                          ? ` · ${nearbyForSelected} option${nearbyForSelected === 1 ? "" : "s"}`
                          : ""
                      }`
                    : "Allow location or enter a pincode to see nearby providers"}
                </p>
              </div>

              <div className="landing-cat-filter-menu">
                <button
                  type="button"
                  className={`icon-btn landing-cat-filter-btn has-filter ${filterOpen ? "open" : ""}`}
                  aria-label="Filter by category"
                  aria-expanded={filterOpen}
                  aria-haspopup="listbox"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFilterOpen((v) => !v);
                  }}
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
                    <path d="M4 5h16M7 12h10M10 19h4" strokeLinecap="round" />
                  </svg>
                  <span className="landing-cat-filter-dot" aria-hidden="true" />
                </button>
                {filterOpen && (
                  <ul className="landing-cat-filter-list" role="listbox">
                    <li role="option" aria-selected={false}>
                      <button type="button" onClick={clearCategoryBrowse}>
                        <span>All categories</span>
                      </button>
                    </li>
                    {popularTree.map((cat) => (
                      <li key={cat.id} className="landing-cat-filter-group">
                        <button
                          type="button"
                          className={selected.id === cat.id ? "active" : ""}
                          onClick={() => onSelectCategory(cat)}
                        >
                          <span>{cat.name}</span>
                          {categoryMeta(cat) !== "" && (
                            <span className="landing-cat-filter-count">{categoryMeta(cat)}</span>
                          )}
                        </button>
                        {(cat.subcategories?.length || 0) > 0 && (
                          <ul className="landing-cat-filter-sub">
                            {cat.subcategories.map((sub) => (
                              <li
                                key={sub.id}
                                role="option"
                                aria-selected={selected.id === sub.id}
                              >
                                <button
                                  type="button"
                                  className={selected.id === sub.id ? "active" : ""}
                                  onClick={() => onSelectCategory(sub, cat)}
                                >
                                  <span>{sub.name}</span>
                                  {categoryMeta(sub) !== "" && (
                                    <span className="landing-cat-filter-count">
                                      {categoryMeta(sub)}
                                    </span>
                                  )}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {error && <p className="error">{error}</p>}

            <div className="landing-provider-list">
              {categoryBusy && <p className="muted">Loading providers…</p>}
              {!categoryBusy && !hasLocation && (
                <p className="muted">
                  Allow location or enter a pincode above to see providers in this category.
                </p>
              )}
              {!categoryBusy && hasLocation && categoryProviders.length === 0 && (
                <p className="muted">No verified providers nearby in this category.</p>
              )}
              {!categoryBusy &&
                categoryProviders.map((p) => <ProviderCard key={p.user_id} provider={p} />)}
            </div>
          </section>
        )}

        <footer className="landing-footer">
          <strong>Gharq</strong>
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

      {categoryMismatchPopup && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setCategoryMismatchPopup(false)}
        >
          <div
            className="modal-dialog card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="landing-category-mismatch-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="landing-category-mismatch-title" style={{ margin: "0 0 0.5rem" }}>
              Same category required
            </h3>
            <p className="muted" style={{ margin: "0 0 1rem" }}>
              {SAME_CATEGORY_REQUEST_MESSAGE}
            </p>
            <button className="btn" type="button" onClick={() => setCategoryMismatchPopup(false)}>
              OK
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

function ProviderCard({
  provider: p,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  provider: ProviderCatalogItem;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const kind = p.offer_kind || "BOTH";
  const kindClass = offerKindClass(kind);
  const blurb = p.offerings_detail || p.description;
  const initial = (p.business_name || "?").trim().slice(0, 1).toUpperCase();
  const hours =
    p.opening_time && p.closing_time ? `${p.opening_time}–${p.closing_time}` : null;

  return (
    <article
      className={`landing-provider ${kindClass}${selected ? " is-selected" : ""}`}
    >
      <div className="landing-provider-accent" aria-hidden="true" />
      <div className="landing-provider-body">
        <div className="landing-provider-top">
          {selectable && (
            <label className="landing-provider-select">
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggleSelect?.()}
                aria-label={`Select ${p.business_name}`}
              />
            </label>
          )}
          <span className={`landing-provider-mark ${kindClass}`} aria-hidden="true">
            {initial}
          </span>
          <div className="landing-provider-identity">
            <div className="landing-provider-title-row">
              <strong className="landing-provider-name">
                <Link to={providerPublicPath(p)}>{p.business_name}</Link>
              </strong>
              <span className={`pill ${p.is_online ? "online" : "offline"}`}>
                {p.is_online ? "Online" : "Offline"}
              </span>
            </div>
            {p.full_name && <p className="landing-provider-owner muted">{p.full_name}</p>}
            <div className="landing-provider-chips">
              <span className={`pill ${kindClass}`}>{offerKindLabel(kind)}</span>
              {(p.categories || []).slice(0, 3).map((cat) => (
                <span key={cat} className="landing-provider-chip">
                  {cat}
                </span>
              ))}
            </div>
          </div>
        </div>

        {blurb && <p className="landing-provider-blurb">{blurb}</p>}

        <div className="landing-provider-meta">
          <span>
            ★ {p.average_rating.toFixed(1)}
            <span className="muted"> ({p.rating_count})</span>
          </span>
          {hours && <span className="muted">{hours}</span>}
          {isMeaningfulLocationLabel(p.location_label) && (
            <span className="muted">{p.location_label}</span>
          )}
        </div>

        <div className="landing-provider-footer">
          <MapsLink
            latitude={p.latitude}
            longitude={p.longitude}
            maps_url={p.maps_url}
            label="Map"
          />
          <Link className="btn landing-provider-cta" to={providerPublicPath(p)}>
            View profile
          </Link>
        </div>
      </div>
    </article>
  );
}

function LandingCloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function LandingLogoutIcon() {
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
