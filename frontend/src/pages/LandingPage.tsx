import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useNavigate, useSearchParams } from "react-router-dom";
import { LoginModal } from "../components/LoginModal";
import { PostRequestModal } from "../components/PostRequestModal";
import { RegisterModal } from "../components/RegisterModal";
import { CitySearchBox } from "../components/CitySearchBox";
import { AreaSearchBox, type AreaPick } from "../components/AreaSearchBox";
import { CategoryNeedSearch, categoryNeedOptions, resolveCategoryNeed, type CategoryNeedOption } from "../components/CategoryNeedSearch";
import { CategoryChipIcon } from "../components/CategoryChipIcon";
import { BroadcastRequestModal } from "../components/BroadcastRequestModal";
import { InquiryChatPanel, startOrOpenChat } from "../components/InquiryChat";
import { MapsLink } from "../components/MapsLink";
import { MarketplaceScene } from "../components/MarketplaceScene";
import { offerKindClass, offerKindLabel } from "../components/ProviderTrust";
import { CONSUMER_NAV } from "../nav/consumer";
import { useWebSocket } from "../hooks/useWebSocket";
import { api } from "../services/api";
import { reverseGeocodeDetails, isMeaningfulLocationLabel } from "../services/geo";
import { useAuth } from "../store/auth";
import { useConsumerNav } from "../store/consumerNav";
import { consumeLogoutNavigation } from "../utils/logoutNav";
import {
  clearBroadcastDraft,
  readBroadcastDraft,
  saveBroadcastDraft,
  type BroadcastRequestDraft,
} from "../utils/broadcastDraft";
import { providerPublicPath } from "../utils/providerUrl";
import { isProviderOnlineNow } from "../utils/businessHours";
import {
  clearPostRequestDraft,
  majorityCategoryId,
  providersShareTopLevelCategory,
  readPostRequestDraft,
  SAME_CATEGORY_REQUEST_MESSAGE,
  savePostRequestDraft,
  type PostRequestDraft,
} from "../utils/postRequestDraft";
import {
  findServiceCityByName,
  matchServiceCity,
  readSavedServiceCity,
  saveServiceCity,
  type ServiceCity,
} from "../utils/serviceCities";
import {
  matchServiceAreaNear,
  readSavedCustomPincode,
  readSavedServiceArea,
  saveCustomPincode,
  saveServiceArea,
  type ServiceArea,
} from "../utils/serviceAreas";
import type {
  Category,
  CategoryTree,
  Conversation,
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

type CityPopupReason = "no_location" | "out_of_area" | null;

const SEARCH_PAGE_SIZE = 10;
const POPULAR_PREVIEW = 8;
const SUBCAT_TAB_PREVIEW = 5;

function parentCategoryTags(categories: string[] | undefined): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of categories || []) {
    const parent = (raw.split(" › ")[0] || raw).trim();
    if (!parent || seen.has(parent)) continue;
    seen.add(parent);
    tags.push(parent);
  }
  return tags;
}

function sortProvidersNearest(items: ProviderCatalogItem[]): ProviderCatalogItem[] {
  return [...items].sort((a, b) => {
    const da = a.distance_km;
    const db = b.distance_km;
    if (da == null && db == null) return 0;
    if (da == null) return 1;
    if (db == null) return -1;
    return da - db;
  });
}

export function LandingPage() {
  const navigate = useNavigate();
  const { user, token, logout } = useAuth();
  const signedIn = Boolean(token && user);
  const quotesChatUnread = useConsumerNav((s) => s.quotesChatUnread);
  const receivedQuotesUnread = useConsumerNav((s) => s.receivedQuotesUnread);
  const refreshQuotesChatUnread = useConsumerNav((s) => s.refreshQuotesChatUnread);
  const refreshReceivedQuotesUnread = useConsumerNav((s) => s.refreshReceivedQuotesUnread);
  const [searchParams, setSearchParams] = useSearchParams();
  const searchRef = useRef<HTMLElement | null>(null);
  const browseRef = useRef<HTMLDivElement | null>(null);
  const [catsExpanded, setCatsExpanded] = useState(false);
  const [subMoreOpen, setSubMoreOpen] = useState(false);
  const subMoreRef = useRef<HTMLDivElement | null>(null);
  const [tree, setTree] = useState<CategoryTree[]>([]);
  const [nearbyCounts, setNearbyCounts] = useState<Record<number, number>>({});
  const [countsReady, setCountsReady] = useState(false);
  const [selected, setSelected] = useState<CategoryTree | Category | null>(null);
  const [categoryProviders, setCategoryProviders] = useState<ProviderCatalogItem[]>([]);
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [error, setError] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchProviders, setSearchProviders] = useState<ProviderCatalogItem[]>([]);
  const [searchCategories, setSearchCategories] = useState<PublicSearchCategory[]>([]);
  const [searchDone, setSearchDone] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [selectedSearchIds, setSelectedSearchIds] = useState<string[]>([]);
  const [searchActionError, setSearchActionError] = useState("");
  const [postDraft, setPostDraft] = useState<PostRequestDraft | null>(null);
  const [postModalOpen, setPostModalOpen] = useState(false);
  const [broadcastDraft, setBroadcastDraft] = useState<BroadcastRequestDraft | null>(null);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [needCategory, setNeedCategory] = useState<CategoryNeedOption | null>(null);
  const [categoryMismatchPopup, setCategoryMismatchPopup] = useState(false);
  const [activeChat, setActiveChat] = useState<{
    id: string;
    title: string;
    ownerName: string;
    isOnline: boolean;
  } | null>(null);
  const [openingChatId, setOpeningChatId] = useState<string | null>(null);
  const [chatError, setChatError] = useState("");
  const [chatUnreadByProvider, setChatUnreadByProvider] = useState<Record<string, number>>({});
  const [selectedCity, setSelectedCity] = useState<ServiceCity | null>(() => readSavedServiceCity());
  const [selectedArea, setSelectedArea] = useState<ServiceArea | null>(() => {
    const city = readSavedServiceCity();
    return city ? readSavedServiceArea(city.name) : null;
  });
  const [customPincode, setCustomPincode] = useState(() => {
    const city = readSavedServiceCity();
    return city && !readSavedServiceArea(city.name) ? readSavedCustomPincode(city.name) : "";
  });
  const [cityDraft, setCityDraft] = useState(() => readSavedServiceCity()?.name || "");
  const [cityPopupReason, setCityPopupReason] = useState<CityPopupReason>(null);
  const selectedCityRef = useRef(selectedCity);
  selectedCityRef.current = selectedCity;
  /** After logout, skip auto city popup once (does not block Sign in). */
  const skipAutoCityAfterLogoutRef = useRef(false);
  // Auth modals are URL-driven so logout cleanup cannot fight intentional Sign in.
  const loginOpen = !signedIn && searchParams.get("login") === "1";
  const registerOpen = !signedIn && searchParams.get("register") === "1";
  const [navOpen, setNavOpen] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 961px)").matches : true,
  );
  const [loc, setLoc] = useState<LocState>(() => {
    const saved = readSavedServiceCity();
    const area = saved ? readSavedServiceArea(saved.name) : null;
    const savedPin = saved && !area ? readSavedCustomPincode(saved.name) : "";
    if (area) {
      return {
        latitude: area.latitude,
        longitude: area.longitude,
        pincode: area.pincode,
        label: `${area.name}, ${area.city}`,
        status: "ready",
      };
    }
    if (saved && savedPin) {
      return {
        latitude: saved.latitude,
        longitude: saved.longitude,
        pincode: savedPin,
        label: `Pincode ${savedPin}, ${saved.name}`,
        status: "ready",
      };
    }
    if (saved) {
      return {
        latitude: saved.latitude,
        longitude: saved.longitude,
        pincode: saved.pincode,
        label: saved.name,
        status: "ready",
      };
    }
    return {
      latitude: null,
      longitude: null,
      pincode: "",
      label: "",
      status: "idle",
    };
  });

  const hasCoords = loc.latitude != null && loc.longitude != null;
  const hasLocation = hasCoords || Boolean(selectedCity);
  const areaFieldValue = selectedArea?.name || customPincode;
  const consumerOrigin = useMemo(() => {
    if (selectedArea) {
      return { latitude: selectedArea.latitude, longitude: selectedArea.longitude };
    }
    if (signedIn && user?.role === "CONSUMER" && user.latitude != null && user.longitude != null) {
      return { latitude: user.latitude, longitude: user.longitude };
    }
    if (loc.latitude != null && loc.longitude != null) {
      return { latitude: loc.latitude, longitude: loc.longitude };
    }
    if (selectedCity) {
      return { latitude: selectedCity.latitude, longitude: selectedCity.longitude };
    }
    return { latitude: null as number | null, longitude: null as number | null };
  }, [
    selectedArea,
    signedIn,
    user?.role,
    user?.latitude,
    user?.longitude,
    loc.latitude,
    loc.longitude,
    selectedCity,
  ]);
  const matchHint = useMemo(() => {
    if (selectedArea && selectedCity) {
      return `Near ${selectedArea.name}, ${selectedCity.name} · nearest first`;
    }
    if (customPincode && selectedCity) {
      return `Near pincode ${customPincode} in ${selectedCity.name} · nearest first`;
    }
    if (selectedCity && consumerOrigin.latitude != null) {
      return `In ${selectedCity.name} · nearest to you first`;
    }
    if (consumerOrigin.latitude != null) return `Near ${loc.label || "you"} · nearest first`;
    if (selectedCity) return `In ${selectedCity.name} · nearest first`;
    return "Choose a city or allow location to see nearby providers";
  }, [selectedArea, customPincode, consumerOrigin.latitude, loc.label, selectedCity]);
  const searchPageCount = Math.max(1, Math.ceil(searchProviders.length / SEARCH_PAGE_SIZE));
  const currentSearchPage = Math.min(searchPage, searchPageCount);
  const pagedSearchProviders = searchProviders.slice(
    (currentSearchPage - 1) * SEARCH_PAGE_SIZE,
    currentSearchPage * SEARCH_PAGE_SIZE,
  );

  useEffect(() => {
    if (signedIn && user?.role === "CONSUMER") {
      void refreshQuotesChatUnread();
      void refreshReceivedQuotesUnread();
    }
  }, [signedIn, user?.role, refreshQuotesChatUnread, refreshReceivedQuotesUnread]);

  useWebSocket((msg) => {
    const m = msg as { type?: string };
    if (!signedIn || user?.role !== "CONSUMER") return;
    if (m.type === "new_quote" || m.type === "quote_updated") {
      void refreshReceivedQuotesUnread();
    }
    if (m.type === "inquiry_message") {
      void refreshQuotesChatUnread();
    }
  });

  async function refreshLandingChatUnread() {
    if (!signedIn || user?.role !== "CONSUMER") {
      setChatUnreadByProvider({});
      return;
    }
    try {
      const { data } = await api.get<Conversation[]>("/conversations");
      const map: Record<string, number> = {};
      for (const c of data) {
        const n = c.unread_count || 0;
        if (n > 0 && c.provider_id) {
          map[c.provider_id] = (map[c.provider_id] || 0) + n;
        }
      }
      setChatUnreadByProvider(map);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void refreshLandingChatUnread();
  }, [signedIn, user?.role, activeChat?.id]);

  const popularTree = useMemo(() => {
    if (!countsReady || !hasLocation) return tree;
    return [...tree].sort(
      (a, b) => (nearbyCounts[b.id] || 0) - (nearbyCounts[a.id] || 0),
    );
  }, [tree, nearbyCounts, countsReady, hasLocation]);
  const visiblePopular = catsExpanded ? popularTree : popularTree.slice(0, POPULAR_PREVIEW);
  const selectedParentCat = useMemo(() => {
    if (!selected) return null;
    return (
      tree.find((t) => t.id === selected.id) ||
      tree.find((t) => (t.subcategories || []).some((s) => s.id === selected.id)) ||
      null
    );
  }, [selected, tree]);

  const browsing = Boolean(selected) && !searchDone;
  const rankedSubcats = useMemo(() => {
    const subs = selectedParentCat?.subcategories || [];
    if (subs.length === 0) return [];
    return [...subs].sort((a, b) => {
      const ca = nearbyCounts[a.id] || 0;
      const cb = nearbyCounts[b.id] || 0;
      if (cb !== ca) return cb - ca;
      return a.name.localeCompare(b.name);
    });
  }, [selectedParentCat, nearbyCounts]);
  const visibleSubcats = useMemo(() => {
    const preview = rankedSubcats.slice(0, SUBCAT_TAB_PREVIEW);
    if (!selected || !selectedParentCat || selected.id === selectedParentCat.id) return preview;
    if (preview.some((s) => s.id === selected.id)) return preview;
    const extra = rankedSubcats.find((s) => s.id === selected.id);
    return extra ? [...preview, extra] : preview;
  }, [rankedSubcats, selected, selectedParentCat]);
  const overflowSubcats = useMemo(
    () => rankedSubcats.filter((s) => !visibleSubcats.some((v) => v.id === s.id)),
    [rankedSubcats, visibleSubcats],
  );
  const cityPopupOpen = cityPopupReason != null;

  function applyCity(city: ServiceCity) {
    saveServiceCity(city);
    setSelectedCity(city);
    setCityDraft(city.name);
    setCityPopupReason(null);
    const savedArea = readSavedServiceArea(city.name);
    const savedPin = savedArea ? "" : readSavedCustomPincode(city.name);
    if (savedArea) {
      setSelectedArea(savedArea);
      setCustomPincode("");
      setLoc((s) => ({
        ...s,
        label: `${savedArea.name}, ${city.name}`,
        pincode: savedArea.pincode,
        latitude: savedArea.latitude,
        longitude: savedArea.longitude,
        status: "ready",
      }));
    } else if (savedPin) {
      setSelectedArea(null);
      setCustomPincode(savedPin);
      setLoc((s) => ({
        ...s,
        label: `Pincode ${savedPin}, ${city.name}`,
        pincode: savedPin,
        latitude: city.latitude,
        longitude: city.longitude,
        status: "ready",
      }));
    } else {
      setSelectedArea(null);
      setCustomPincode("");
      saveServiceArea(null);
      saveCustomPincode(null, null);
      setLoc((s) => ({
        ...s,
        label: city.name,
        pincode: city.pincode,
        latitude: city.latitude,
        longitude: city.longitude,
        status: "ready",
      }));
    }
    setError("");
  }

  function applyAreaPick(pick: AreaPick | null) {
    if (!pick) {
      setSelectedArea(null);
      setCustomPincode("");
      saveServiceArea(null);
      saveCustomPincode(null, null);
      const city = selectedCityRef.current;
      if (city) {
        setLoc((s) => ({
          ...s,
          label: city.name,
          pincode: city.pincode,
          latitude: city.latitude,
          longitude: city.longitude,
          status: "ready",
        }));
      }
      return;
    }
    if (pick.kind === "area") {
      setSelectedArea(pick.area);
      setCustomPincode("");
      saveServiceArea(pick.area);
      setLoc((s) => ({
        ...s,
        label: `${pick.area.name}, ${pick.area.city}`,
        pincode: pick.area.pincode,
        latitude: pick.area.latitude,
        longitude: pick.area.longitude,
        status: "ready",
      }));
      return;
    }
    setSelectedArea(null);
    setCustomPincode(pick.pincode);
    saveCustomPincode(pick.city, pick.pincode);
    const city = selectedCityRef.current;
    setLoc((s) => ({
      ...s,
      label: city ? `Pincode ${pick.pincode}, ${city.name}` : `Pincode ${pick.pincode}`,
      pincode: pick.pincode,
      latitude: city?.latitude ?? s.latitude,
      longitude: city?.longitude ?? s.longitude,
      status: "ready",
    }));
  }

  function openCityPopup(reason: Exclude<CityPopupReason, null>) {
    if (skipAutoCityAfterLogoutRef.current) return;
    const existing = selectedCityRef.current || readSavedServiceCity();
    if (existing) {
      // City already chosen — don't interrupt browsing.
      setSelectedCity(existing);
      setCityDraft(existing.name);
      setCityPopupReason(null);
      return;
    }
    setCityDraft("");
    setCityPopupReason(reason);
  }

  function applySavedCityToLoc(city: ServiceCity) {
    const area = readSavedServiceArea(city.name);
    if (area) {
      setSelectedArea(area);
      setCustomPincode("");
      setLoc({
        latitude: area.latitude,
        longitude: area.longitude,
        pincode: area.pincode,
        label: `${area.name}, ${city.name}`,
        status: "ready",
      });
      return;
    }
    const savedPin = readSavedCustomPincode(city.name);
    if (savedPin) {
      setSelectedArea(null);
      setCustomPincode(savedPin);
      setLoc({
        latitude: city.latitude,
        longitude: city.longitude,
        pincode: savedPin,
        label: `Pincode ${savedPin}, ${city.name}`,
        status: "ready",
      });
      return;
    }
    setLoc({
      latitude: city.latitude,
      longitude: city.longitude,
      pincode: city.pincode,
      label: city.name,
      status: "ready",
    });
  }

  useEffect(() => {
    // Logout landing: suppress auto city popup only. Do not touch auth URL params here —
    // Sign in is URL-driven (?login=1) and must stay open when the user asks for it.
    if (consumeLogoutNavigation()) {
      skipAutoCityAfterLogoutRef.current = true;
      setCityPopupReason(null);
    }

    void api
      .get<CategoryTree[]>("/categories/tree")
      .then((res) => setTree(res.data))
      .catch(() => setError("Could not load categories"));
    // Only auto-prompt for location when no city is saved yet.
    if (!readSavedServiceCity() && !skipAutoCityAfterLogoutRef.current) {
      detectLocation();
    }
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
    if (!selectedParentCat) return;
    const idx = popularTree.findIndex((c) => c.id === selectedParentCat.id);
    if (idx >= POPULAR_PREVIEW) setCatsExpanded(true);
  }, [selectedParentCat, popularTree]);

  useEffect(() => {
    setSubMoreOpen(false);
  }, [selectedParentCat?.id]);

  useEffect(() => {
    if (!subMoreOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!subMoreRef.current?.contains(e.target as Node)) setSubMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSubMoreOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [subMoreOpen]);

  function detectLocation() {
    if (!navigator.geolocation) {
      const saved = selectedCityRef.current || readSavedServiceCity();
      if (saved) {
        applySavedCityToLoc(saved);
        return;
      }
      setLoc((s) => ({ ...s, status: "denied", label: "Location unavailable" }));
      openCityPopup("no_location");
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
          const matched =
            matchServiceCity(details?.city) ||
            matchServiceCity(details?.location_label) ||
            matchServiceCity(place);
          const pin = details?.pincode?.trim() || "";
          if (matched) {
            saveServiceCity(matched);
            setSelectedCity(matched);
            setCityDraft(matched.name);
            setCityPopupReason(null);
            const area = matchServiceAreaNear(matched.name, {
              pincode: pin,
              latitude,
              longitude,
            });
            if (area) {
              setSelectedArea(area);
              setCustomPincode("");
              saveServiceArea(area);
              setLoc({
                latitude,
                longitude,
                label: `${area.name}, ${matched.name}`,
                pincode: area.pincode,
                status: "ready",
              });
              return;
            }
            setSelectedArea(null);
            if (pin.length === 6) {
              setCustomPincode(pin);
              saveCustomPincode(matched.name, pin);
            } else {
              setCustomPincode("");
              saveCustomPincode(null, null);
              saveServiceArea(null);
            }
            setLoc({
              latitude,
              longitude,
              label: matched.name,
              pincode: pin || matched.pincode,
              status: "ready",
            });
            return;
          }
          const saved = selectedCityRef.current || readSavedServiceCity();
          if (saved) {
            // GPS is outside service cities, but user already picked one — keep it.
            applySavedCityToLoc(saved);
            setCityPopupReason(null);
            return;
          }
          setLoc((s) => ({
            ...s,
            latitude,
            longitude,
            label: place,
            pincode: pin || s.pincode,
            status: "ready",
          }));
          openCityPopup("out_of_area");
        });
      },
      () => {
        const saved = selectedCityRef.current || readSavedServiceCity();
        if (saved) {
          applySavedCityToLoc(saved);
          setCityPopupReason(null);
          return;
        }
        setLoc((s) => ({
          ...s,
          status: "denied",
          label: "Location denied — choose a city",
        }));
        openCityPopup("no_location");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function onCitySelectChange(name: string) {
    setCityDraft(name);
    if (!name) {
      setSelectedCity(null);
      setSelectedArea(null);
      setCustomPincode("");
      saveServiceArea(null);
      saveCustomPincode(null, null);
      return;
    }
    const city = findServiceCityByName(name);
    if (city) applyCity(city);
  }

  function confirmCityPopup() {
    const city = findServiceCityByName(cityDraft);
    if (!city) {
      setError("Select a city to continue");
      return;
    }
    applyCity(city);
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
    setError("");
    const opt = categoryNeedOptions(tree).find((o) => o.id === full.id);
    if (opt) {
      setNeedCategory(opt);
      setSearchQ(opt.name);
    } else {
      setSearchQ(full.name);
    }
    window.setTimeout(() => {
      browseRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
  }

  function clearCategoryBrowse() {
    setSelected(null);
    setCategoryProviders([]);
  }

  async function runSearch(q: string, categoryId?: number) {
    const city =
      selectedCity ||
      findServiceCityByName(loc.label) ||
      matchServiceCity(loc.label);
    if (!city && !hasCoords) {
      openCityPopup("no_location");
      return;
    }
    setSearchBusy(true);
    setError("");
    setSearchDone(false);
    setSelected(null);
    setCategoryProviders([]);
    setSelectedSearchIds([]);
    setSearchActionError("");
    try {
      const params: Record<string, string | number> = { q };
      if (categoryId != null) params.category_id = categoryId;
      if (city) {
        params.city = city.name;
        // Prefer a more specific area/pincode when the consumer picked one.
        const pin =
          selectedArea?.pincode ||
          customPincode ||
          (loc.pincode.replace(/\D/g, "").length === 6 ? loc.pincode.replace(/\D/g, "") : "") ||
          city.pincode;
        if (pin) params.pincode = pin;
      }
      const lat = consumerOrigin.latitude ?? city?.latitude ?? null;
      const lon = consumerOrigin.longitude ?? city?.longitude ?? null;
      if (lat != null && lon != null) {
        params.latitude = lat;
        params.longitude = lon;
      }
      if (!params.pincode) {
        const pin = loc.pincode.replace(/\D/g, "").slice(0, 6);
        if (pin.length === 6) params.pincode = pin;
      }
      const { data } = await api.get<PublicSearchResult>("/providers/public-search", { params });
      setSearchProviders(sortProvidersNearest(data.providers || []));
      setSearchCategories(data.categories || []);
      setSearchPage(1);
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

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    await runSearch(searchQ.trim());
  }

  function onPickNeed(opt: CategoryNeedOption) {
    setNeedCategory(opt);
    void runSearch(opt.name, opt.id);
  }

  function resolveLandingBroadcast(): BroadcastRequestDraft | null {
    const city =
      selectedCity ||
      findServiceCityByName(loc.label) ||
      matchServiceCity(loc.label);
    if (!city) return null;
    const fromField = resolveCategoryNeed(tree, searchQ, needCategory);
    const fromBrowse =
      selected && !fromField
        ? resolveCategoryNeed(tree, selected.name) || {
            id: selected.id,
            isParent: true,
            name: selected.name,
            parentName: null,
            label: selected.name,
            haystack: selected.name.toLowerCase(),
          }
        : null;
    const cat = fromField || fromBrowse;
    if (!cat) return null;
    const pin =
      selectedArea?.pincode ||
      customPincode ||
      (loc.pincode.replace(/\D/g, "").length === 6 ? loc.pincode.replace(/\D/g, "") : "") ||
      city.pincode;
    const lat = consumerOrigin.latitude ?? city.latitude;
    const lon = consumerOrigin.longitude ?? city.longitude;
    return {
      categoryId: cat.id,
      categoryLabel: cat.label || cat.name,
      city: city.name,
      areaName: selectedArea?.name,
      pincode: pin,
      latitude: lat,
      longitude: lon,
    };
  }

  function onBroadcastNearby() {
    setError("");
    const city =
      selectedCity ||
      findServiceCityByName(loc.label) ||
      matchServiceCity(loc.label);
    if (!city) {
      openCityPopup("no_location");
      return;
    }
    const draft = resolveLandingBroadcast();
    if (!draft) {
      setError("Pick a category so we know which nearby providers to notify.");
      return;
    }
    if (!signedIn || !user) {
      saveBroadcastDraft(draft);
      openLogin();
      return;
    }
    if (user.role !== "CONSUMER") {
      setError("Only consumers can broadcast a request. Sign in with a consumer account.");
      return;
    }
    setBroadcastDraft(draft);
    setBroadcastOpen(true);
  }

  const nearbyForSelected = selected ? nearbyCounts[selected.id] : undefined;
  const zeroNearbySelected =
    browsing && hasLocation && countsReady && nearbyForSelected === 0;
  const emptyNearbySelected =
    browsing && hasLocation && !categoryBusy && categoryProviders.length === 0;
  const showBroadcastEmpty = Boolean(zeroNearbySelected || emptyNearbySelected);

  useEffect(() => {
    if (!signedIn) return;
    if (searchParams.get("login") === "1" || searchParams.get("register") === "1") {
      const next = new URLSearchParams(searchParams);
      next.delete("login");
      next.delete("register");
      setSearchParams(next, { replace: true });
    }
  }, [signedIn, searchParams, setSearchParams]);

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
    // Clear stale logout flag so Sign in is never treated as a logout redirect.
    consumeLogoutNavigation();
    setAuthParam("login");
  }

  function openRegister() {
    if (signedIn) return;
    consumeLogoutNavigation();
    setAuthParam("register");
  }

  function closeAuth() {
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
      categoryLabels: selected.flatMap((p) => p.categories || []),
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

  async function chatWithProvider(provider: ProviderCatalogItem) {
    setChatError("");
    if (!signedIn || !user) {
      openLogin();
      return;
    }
    if (user.role !== "CONSUMER") {
      setChatError("Only consumers can chat with providers. Sign in with a consumer account.");
      return;
    }
    if (openingChatId) return;
    setOpeningChatId(provider.user_id);
    try {
      const conv = await startOrOpenChat(
        provider.user_id,
        provider.category_id,
        `Hi, I'm interested in your services.`,
      );
      setActiveChat({
        id: conv.id,
        title: provider.business_name || provider.full_name,
        ownerName: provider.full_name,
        isOnline: isProviderOnlineNow({
          opening_time: provider.opening_time,
          closing_time: provider.closing_time,
          verification_status: provider.verification_status,
        }),
      });
      void refreshQuotesChatUnread();
      void refreshLandingChatUnread();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Cannot start chat";
      setChatError(String(msg));
    } finally {
      setOpeningChatId(null);
    }
  }

  const showChat = !signedIn || user?.role === "CONSUMER";

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

  useEffect(() => {
    if (!signedIn || user?.role !== "CONSUMER") {
      if (signedIn && user && user.role !== "CONSUMER") {
        clearBroadcastDraft();
      }
      return;
    }
    const draft = readBroadcastDraft();
    if (!draft) return;
    setBroadcastDraft(draft);
    setBroadcastOpen(true);
  }, [signedIn, user?.role, user]);

  function onLogout() {
    logout();
    skipAutoCityAfterLogoutRef.current = true;
    setNavOpen(false);
    setCityPopupReason(null);
    navigate("/", { replace: true });
    // Ensure auth query params are cleared without blocking later Sign in.
    const next = new URLSearchParams(searchParams);
    if (next.has("login") || next.has("register")) {
      next.delete("login");
      next.delete("register");
      setSearchParams(next, { replace: true });
    }
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
      }${!searchDone && !browsing ? " landing-home-fit" : ""}`}
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
            setActiveChat(null);
          }}
        />
      )}
      {signedIn && user?.role === "CONSUMER" && (
        <BroadcastRequestModal
          open={broadcastOpen}
          draft={broadcastDraft}
          nearbyCount={broadcastDraft ? nearbyCounts[broadcastDraft.categoryId] : undefined}
          onClose={() => {
            setBroadcastOpen(false);
            setBroadcastDraft(null);
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
                  SahiLocal
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
              {CONSUMER_NAV.map((item) => {
                const badge =
                  item.to === "/consumer/quotes"
                    ? receivedQuotesUnread
                    : item.to === "/consumer/inquiries"
                      ? quotesChatUnread
                      : 0;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `landing-sidebar-link${isActive ? " active" : ""}`
                    }
                    onClick={() => setNavOpen(false)}
                  >
                    <span className="landing-sidebar-link-label">{item.label}</span>
                    {badge > 0 && (
                      <span className="nav-badge" aria-label={`${badge} unread`}>
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
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
                SahiLocal
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
          <p className="landing-lead">
            Every Store. Every Service. Nearby.
          </p>

          <div className="landing-search-shell">
            <div className="landing-search-shell-head">
              <p className="landing-search-kicker">Find nearby help</p>
              <p className="landing-search-sub">
                City, area, then category.
              </p>
            </div>
            <form className="landing-booking-pad landing-booking-pad-3" onSubmit={onSearch}>
              <div className="landing-pad-row">
                <div className="landing-pad-field landing-pad-city">
                  <label htmlFor="landing-city-field">City</label>
                  <div className="landing-pad-city-row">
                    <CitySearchBox
                      id="landing-city-field"
                      variant="pad"
                      value={selectedCity?.name || ""}
                      onChange={onCitySelectChange}
                      placeholder="Select city…"
                    />
                    <button
                      className="icon-btn landing-area-icon-btn"
                      type="button"
                      title="Detect my location"
                      aria-label="Detect my location"
                      disabled={loc.status === "locating"}
                      onClick={() => detectLocation()}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z" />
                        <circle cx="12" cy="10" r="2.5" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="landing-pad-divider" aria-hidden="true" />
                <div className="landing-pad-field landing-pad-area">
                  <label htmlFor="landing-area-field">Area / pincode</label>
                  <AreaSearchBox
                    id="landing-area-field"
                    city={selectedCity?.name || null}
                    value={areaFieldValue}
                    onChange={applyAreaPick}
                    disabled={!selectedCity}
                    placeholder={selectedCity ? "Area or pincode…" : "Select a city first"}
                  />
                </div>
              </div>
              <div className="landing-pad-row landing-pad-row-need">
                <div className="landing-pad-field landing-pad-grow">
                  <label htmlFor="landing-search-q">Category / need</label>
                  <CategoryNeedSearch
                    id="landing-search-q"
                    tree={tree}
                    value={searchQ}
                    onChange={(value) => {
                      setSearchQ(value);
                      if (
                        needCategory &&
                        value.trim().toLowerCase() !== needCategory.name.toLowerCase()
                      ) {
                        setNeedCategory(null);
                      }
                    }}
                    onPick={onPickNeed}
                    placeholder="Category or leave blank…"
                  />
                </div>
                <button className="btn landing-pad-submit" type="submit" disabled={searchBusy}>
                  {searchBusy ? "Searching…" : "Search"}
                </button>
              </div>
            </form>
            <p className="landing-search-status" aria-live="polite">
              {loc.status === "locating"
                ? "Detecting your area…"
                : selectedArea && selectedCity
                  ? `Ready near ${selectedArea.name}, ${selectedCity.name}`
                  : customPincode && selectedCity
                    ? `Ready near pincode ${customPincode} in ${selectedCity.name}`
                    : selectedCity
                      ? `Ready to search in ${selectedCity.name}`
                      : hasCoords
                        ? `Near ${loc.label || "you"} — choose a supported city if needed`
                        : "Choose a city to begin"}
            </p>
          </div>
          <div className="landing-broadcast-card">
            <div>
              <p className="landing-broadcast-kicker">Can’t find the right shop?</p>
              <p className="landing-broadcast-copy" id="landing-broadcast-copy">
                Broadcast your need if you don’t see the right shop.
              </p>
            </div>
            <button
              type="button"
              className="btn landing-broadcast-btn"
              onClick={onBroadcastNearby}
              aria-describedby="landing-broadcast-copy"
            >
              Ask nearby
            </button>
          </div>
          {error && <p className="error landing-hero-error">{error}</p>}
        </div>
      </section>

      <div className="landing-sheet">
        {searchDone && (
          <section className="landing-section landing-section-pad landing-results" ref={searchRef} id="search-results">
            <div className="landing-section-head landing-search-head">
              <div>
                <p className="landing-section-kicker">Results</p>
                <h2>
                  {searchQ.trim()
                    ? `Matches for “${searchQ.trim()}”`
                    : selectedArea && selectedCity
                      ? `Providers near ${selectedArea.name}`
                      : customPincode && selectedCity
                        ? `Providers near ${customPincode}`
                        : selectedCity
                          ? `Providers in ${selectedCity.name}`
                          : "Providers near you"}
                </h2>
                <p className="landing-section-lead">{matchHint}</p>
                {searchCategories.length > 0 && (
                  <div className="landing-search-cats" aria-label="Matching categories">
                    {searchCategories.slice(0, 8).map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        className="landing-search-cat"
                        onClick={() => {
                          const parent = tree.find((p) => p.id === cat.id);
                          const subParent = tree.find((p) =>
                            (p.subcategories || []).some((s) => s.id === cat.id),
                          );
                          const sub = subParent?.subcategories?.find((s) => s.id === cat.id);
                          onSelectCategory(parent || sub || cat, subParent);
                        }}
                      >
                        {cat.parent_name ? `${cat.parent_name} › ${cat.name}` : cat.name}
                      </button>
                    ))}
                  </div>
                )}
                {searchProviders.length > 0 && (
                  <p className="muted landing-search-page-meta">
                    {searchProviders.length} provider{searchProviders.length === 1 ? "" : "s"} · page{" "}
                    {currentSearchPage} of {searchPageCount}
                  </p>
                )}
              </div>
              {searchProviders.length > 0 && (
                <div className="landing-search-actions">
                  <p className="landing-search-selected">
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
            {chatError && (
              <p className="error" onClick={() => setChatError("")}>
                {chatError}
              </p>
            )}
            <div className="landing-provider-list">
              {searchProviders.length === 0 ? (
                <div className="landing-empty">
                  <strong>No providers found</strong>
                  <p>
                    Try another keyword, or browse popular categories below after a new search.
                  </p>
                </div>
              ) : (
                pagedSearchProviders.map((p) => (
                  <ProviderCard
                    key={p.user_id}
                    provider={p}
                    selectable
                    selected={selectedSearchIds.includes(p.user_id)}
                    onToggleSelect={() => toggleSearchProvider(p.user_id)}
                    showDistance
                    parentCategoriesOnly
                    showChat={showChat}
                    chatBusy={openingChatId === p.user_id}
                    chatUnread={chatUnreadByProvider[p.user_id] || 0}
                    onChat={() => void chatWithProvider(p)}
                  />
                ))
              )}
            </div>
            {searchProviders.length > SEARCH_PAGE_SIZE && (
              <nav className="landing-search-pager" aria-label="Search results pages">
                <button
                  type="button"
                  className="btn secondary"
                  disabled={currentSearchPage <= 1}
                  onClick={() => {
                    setSearchPage((p) => Math.max(1, p - 1));
                    searchRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  Previous
                </button>
                <div className="landing-search-pager-pages">
                  {Array.from({ length: searchPageCount }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      type="button"
                      className={`landing-search-pager-page${page === currentSearchPage ? " is-active" : ""}`}
                      aria-current={page === currentSearchPage ? "page" : undefined}
                      onClick={() => {
                        setSearchPage(page);
                        searchRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                    >
                      {page}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={currentSearchPage >= searchPageCount}
                  onClick={() => {
                    setSearchPage((p) => Math.min(searchPageCount, p + 1));
                    searchRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  Next
                </button>
              </nav>
            )}
          </section>
        )}

        {!searchDone && (
          <section className="landing-section landing-section-pad landing-categories" id="categories">
            <div className="landing-section-head landing-cat-wrap-head">
              <div>
                <p className="landing-section-kicker">{browsing ? "Category" : "Browse"}</p>
                <h2>
                  {browsing
                    ? selectedParentCat?.name || selected?.name || "Category"
                    : "Popular categories"}
                </h2>
                <p className="landing-section-lead">
                  {browsing
                    ? hasLocation
                      ? `${matchHint}${
                          countsReady && nearbyForSelected != null
                            ? ` · ${nearbyForSelected} option${nearbyForSelected === 1 ? "" : "s"}`
                            : ""
                        }`
                      : "Choose a city or allow location to see nearby providers"
                    : hasCoords
                      ? `Verified options near ${selectedCity?.name || loc.label || "you"}.`
                      : selectedCity
                        ? `Verified options in ${selectedCity.name}.`
                        : "Choose a city above to see how many options are near you."}
                </p>
              </div>
              {browsing ? (
                <button
                  type="button"
                  className="btn secondary landing-browse-back"
                  onClick={clearCategoryBrowse}
                >
                  All categories
                </button>
              ) : popularTree.length > POPULAR_PREVIEW ? (
                <button
                  type="button"
                  className="landing-cat-more"
                  onClick={() => setCatsExpanded((v) => !v)}
                >
                  {catsExpanded ? "Show less" : `See all (${popularTree.length})`}
                </button>
              ) : null}
            </div>

            {tree.length === 0 && <p className="muted">Loading categories…</p>}
            <div
              className={`landing-cat-wrap${browsing ? " is-collapsed" : ""}`}
              role="list"
              aria-label={browsing ? "Selected category" : "Popular categories"}
            >
              {(browsing && selectedParentCat ? [selectedParentCat] : visiblePopular).map((cat) => {
                const nearby = nearbyCounts[cat.id];
                const subCount = cat.subcategories?.length || 0;
                let meta: string;
                if (hasLocation && countsReady) {
                  meta = `${nearby || 0} nearby`;
                } else if (hasLocation && !countsReady) {
                  meta = "Counting…";
                } else if (subCount > 0) {
                  meta = `${subCount} type${subCount === 1 ? "" : "s"}`;
                } else {
                  meta = offerKindLabel(cat.kind);
                }
                const isActive = selectedParentCat?.id === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    className={`landing-cat${isActive ? " active" : ""}`}
                    role="listitem"
                    aria-pressed={isActive}
                    onClick={() => onSelectCategory(cat)}
                  >
                    <span className="landing-cat-mark" aria-hidden="true">
                      <CategoryChipIcon name={cat.name} slug={cat.slug} />
                    </span>
                    <span className="landing-cat-copy">
                      <strong>{cat.name}</strong>
                      <span className="landing-cat-meta">{meta}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {selectedParentCat && rankedSubcats.length > 0 && (
              <div className="landing-cat-subs" role="tablist" aria-label={`${selectedParentCat.name} types`}>
                <button
                  type="button"
                  role="tab"
                  className={`landing-cat-sub${selected?.id === selectedParentCat.id ? " is-active" : ""}`}
                  aria-selected={selected?.id === selectedParentCat.id}
                  onClick={() => onSelectCategory(selectedParentCat)}
                >
                  All {selectedParentCat.name}
                  {hasLocation && countsReady ? (
                    <span className="landing-cat-sub-count">
                      · {nearbyCounts[selectedParentCat.id] || 0}
                    </span>
                  ) : null}
                </button>
                {visibleSubcats.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    role="tab"
                    className={`landing-cat-sub${selected?.id === sub.id ? " is-active" : ""}`}
                    aria-selected={selected?.id === sub.id}
                    title={sub.description || undefined}
                    onClick={() => onSelectCategory(sub, selectedParentCat)}
                  >
                    {sub.name}
                    {hasLocation && countsReady ? (
                      <span className="landing-cat-sub-count">· {nearbyCounts[sub.id] || 0}</span>
                    ) : null}
                  </button>
                ))}
                {overflowSubcats.length > 0 && (
                  <div className="landing-cat-sub-more-wrap" ref={subMoreRef}>
                    <button
                      type="button"
                      className={`landing-cat-sub landing-cat-sub-more${subMoreOpen ? " is-open" : ""}`}
                      aria-expanded={subMoreOpen}
                      aria-haspopup="listbox"
                      aria-controls="landing-cat-sub-more-list"
                      onClick={() => setSubMoreOpen((v) => !v)}
                    >
                      +{overflowSubcats.length} more
                    </button>
                    {subMoreOpen && (
                      <ul
                        id="landing-cat-sub-more-list"
                        className="landing-cat-sub-menu"
                        role="listbox"
                        aria-label="More types"
                      >
                        {overflowSubcats.map((sub) => (
                          <li key={sub.id} role="option" aria-selected={selected?.id === sub.id}>
                            <button
                              type="button"
                              className={selected?.id === sub.id ? "is-active" : ""}
                              title={sub.description || undefined}
                              onClick={() => {
                                onSelectCategory(sub, selectedParentCat);
                                setSubMoreOpen(false);
                              }}
                            >
                              <span>{sub.name}</span>
                              {hasLocation && countsReady ? (
                                <span className="landing-cat-sub-count">{nearbyCounts[sub.id] || 0}</span>
                              ) : null}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            {browsing && selected && (
              <div className="landing-cat-results" ref={browseRef} id="category-browse">
                {selectedParentCat && selected.id !== selectedParentCat.id && (
                  <p className="landing-cat-results-label">
                    Showing <strong>{selected.name}</strong>
                  </p>
                )}
                {error && <p className="error">{error}</p>}
                {!hasLocation && (
                  <p className="muted">
                    Choose a city or allow location above to see providers in this category.
                  </p>
                )}
                {hasLocation && categoryBusy && !zeroNearbySelected && (
                  <p className="muted">Loading providers…</p>
                )}
                {showBroadcastEmpty && (
                  <div className="landing-empty landing-empty-broadcast">
                    <strong>No verified providers nearby</strong>
                    <p>
                      Nobody listed for {selected.name}
                      {selectedCity ? ` in ${selectedArea?.name || selectedCity.name}` : ""}. Broadcast
                      this need and nearby providers can send quotes.
                    </p>
                    <button type="button" className="btn" onClick={onBroadcastNearby}>
                      Ask nearby
                    </button>
                  </div>
                )}
                {hasLocation && !showBroadcastEmpty && !categoryBusy && (
                  <div className="landing-provider-list">
                    {categoryProviders.map((p) => (
                      <ProviderCard
                        key={p.user_id}
                        provider={p}
                        showChat={showChat}
                        chatBusy={openingChatId === p.user_id}
                        chatUnread={chatUnreadByProvider[p.user_id] || 0}
                        onChat={() => void chatWithProvider(p)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        <footer className="landing-footer">
          <strong>SahiLocal</strong>
          <span className="muted">Verified providers · nearby matching</span>
        </footer>
      </div>

      {activeChat && (
        <InquiryChatPanel
          conversationId={activeChat.id}
          mode="overlay"
          title={activeChat.title}
          subtitle={
            activeChat.ownerName && activeChat.ownerName !== activeChat.title
              ? activeChat.ownerName
              : "Inquiry chat"
          }
          avatarLabel={activeChat.title}
          statusLabel={activeChat.isOnline ? "Online" : "Offline"}
          statusTone={activeChat.isOnline ? "online" : "offline"}
          autoFocus
          emptyHint="Say hello and ask about availability, pricing, or timing."
          placeholder="Write a message…"
          onClose={() => setActiveChat(null)}
          onMessagesLoaded={() => {
            void refreshQuotesChatUnread();
            void refreshLandingChatUnread();
          }}
        />
      )}

      {cityPopupOpen && (
        <div className="modal-backdrop landing-city-popup-backdrop" role="presentation">
          <div
            className="modal-dialog card landing-city-popup"
            role="dialog"
            aria-modal="true"
            aria-labelledby="landing-city-popup-title"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="dash-eyebrow">Service area</p>
            <h3 id="landing-city-popup-title">
              {cityPopupReason === "out_of_area" ? "Choose a supported city" : "Select your city"}
            </h3>
            <p className="muted landing-city-popup-copy">
              {cityPopupReason === "out_of_area"
                ? "Your current location is outside our service cities. Pick one of the cities below to continue."
                : "Location isn’t available. Choose a city to browse nearby providers."}
            </p>
            <div className="field">
              <label htmlFor="landing-city-popup-select">City</label>
              <CitySearchBox
                id="landing-city-popup-select"
                value={cityDraft}
                onChange={setCityDraft}
                placeholder="Search city…"
                autoFocus
              />
            </div>
            <div className="landing-city-popup-actions">
              {selectedCity && (
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => setCityPopupReason(null)}
                >
                  Keep {selectedCity.name}
                </button>
              )}
              <button
                className="btn"
                type="button"
                disabled={!cityDraft}
                onClick={confirmCityPopup}
              >
                Continue
              </button>
            </div>
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

function formatDistanceKm(km: number | null | undefined): string | null {
  if (km == null || Number.isNaN(Number(km))) return null;
  const value = Number(km);
  if (value < 1) return `${Math.max(0.1, Math.round(value * 10) / 10)} km`;
  if (value < 10) return `${Math.round(value * 10) / 10} km`;
  return `${Math.round(value)} km`;
}

function ProviderCard({
  provider: p,
  selectable = false,
  selected = false,
  onToggleSelect,
  showDistance = false,
  parentCategoriesOnly = false,
  showChat = false,
  chatBusy = false,
  chatUnread = 0,
  onChat,
}: {
  provider: ProviderCatalogItem;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  showDistance?: boolean;
  parentCategoriesOnly?: boolean;
  showChat?: boolean;
  chatBusy?: boolean;
  chatUnread?: number;
  onChat?: () => void;
}) {
  const kind = p.offer_kind || "BOTH";
  const kindClass = offerKindClass(kind);
  const blurb = p.offerings_detail || p.description;
  const initial = (p.business_name || "?").trim().slice(0, 1).toUpperCase();
  const hours =
    p.opening_time && p.closing_time ? `${p.opening_time}–${p.closing_time}` : null;
  const online = isProviderOnlineNow({
    opening_time: p.opening_time,
    closing_time: p.closing_time,
    verification_status: p.verification_status,
  });
  const distanceLabel = showDistance ? formatDistanceKm(p.distance_km) : null;
  const categoryTags = parentCategoriesOnly
    ? parentCategoryTags(p.categories)
    : p.categories || [];

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
              <span className={`pill ${online ? "online" : "offline"}`}>
                {online ? "Online" : "Offline"}
              </span>
            </div>
            {p.full_name && <p className="landing-provider-owner muted">{p.full_name}</p>}
            <div className="landing-provider-chips">
              <span className={`pill ${kindClass}`}>{offerKindLabel(kind)}</span>
              {distanceLabel && (
                <span className="landing-provider-chip landing-provider-distance">
                  {distanceLabel} away
                </span>
              )}
              {categoryTags.slice(0, 3).map((cat) => (
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
            ★ {(p.average_rating ?? 0).toFixed(1)}
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
          <div className="landing-provider-footer-actions">
            {showChat && (
              <button
                type="button"
                className="icon-btn landing-provider-chat provider-quote-chat-btn"
                title={
                  chatBusy
                    ? "Opening chat…"
                    : chatUnread > 0
                      ? `Chat with ${p.business_name}, ${chatUnread} unread`
                      : `Chat with ${p.business_name}`
                }
                aria-label={
                  chatBusy
                    ? "Opening chat…"
                    : chatUnread > 0
                      ? `Chat with ${p.business_name}, ${chatUnread} unread`
                      : `Chat with ${p.business_name}`
                }
                disabled={chatBusy}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onChat?.();
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                {chatUnread > 0 && (
                  <span className="nav-badge provider-quote-chat-badge">
                    {chatUnread > 99 ? "99+" : chatUnread}
                  </span>
                )}
              </button>
            )}
            <Link className="btn landing-provider-cta" to={providerPublicPath(p)}>
              View profile
            </Link>
          </div>
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
