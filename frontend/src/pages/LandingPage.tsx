import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useNavigate, useSearchParams } from "react-router-dom";
import { LoginModal } from "../components/LoginModal";
import { PostRequestModal } from "../components/PostRequestModal";
import { RegisterModal } from "../components/RegisterModal";
import { ContactForm } from "../components/ContactForm";
import { CitySearchBox } from "../components/CitySearchBox";
import { AreaSearchBox, type AreaPick } from "../components/AreaSearchBox";
import { SkeletonCard, SkeletonCategoryCard } from "../components/Skeleton";
import {
  CategoryNeedSearch,
  categoryNeedOptions,
  defaultCategoryNeed,
  resolveCategoryNeed,
  type CategoryNeedOption,
} from "../components/CategoryNeedSearch";
import { CategoryChipIcon } from "../components/CategoryChipIcon";
import { BroadcastRequestModal } from "../components/BroadcastRequestModal";
import { InquiryChatPanel, startOrOpenChat } from "../components/InquiryChat";
import { MapsLink } from "../components/MapsLink";
import { MarketplaceScene } from "../components/MarketplaceScene";
import { Pagination } from "../components/Pagination";
import { KoshalCityLogo } from "../components/KoshalCityLogo";

import { offerKindLabel, VerifiedLocalPartnerBadge } from "../components/ProviderTrust";
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
import {
  btn,
  btnSecondary,
  card,
  cn,
  errorText,
  field,
  fieldLabel,
  iconBtn,
  modalBackdrop,
  muted,
  navBadge,
  pillKindBoth,
  pillKindProduct,
  pillKindService,
  pillOffline,
  pillOnline,
} from "../ui";

type LocState = {
  latitude: number | null;
  longitude: number | null;
  pincode: string;
  label: string;
  status: "idle" | "locating" | "ready" | "denied";
};

type CityPopupReason = "no_location" | "out_of_area" | null;

const SEARCH_PAGE_SIZE = 10;
const POPULAR_PREVIEW = 9;
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
  const [searchCatsExpanded, setSearchCatsExpanded] = useState(false);
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
  const privacyOpen = searchParams.get("privacy") === "1";
  const contactOpen = searchParams.get("contact") === "1";
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
  const searchPin = (selectedArea?.pincode || customPincode || "").replace(/\D/g, "");
  const hasSearchArea = Boolean(selectedArea) || searchPin.length === 6;
  const canSearch = Boolean(selectedCity) && hasSearchArea;
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
    if (countsReady && hasLocation) {
      return [...tree].sort(
        (a, b) => (nearbyCounts[b.id] || 0) - (nearbyCounts[a.id] || 0),
      );
    }
    // Fallback: sort by subcategory count so richest categories show first
    return [...tree].sort(
      (a, b) => (b.subcategories?.length || 0) - (a.subcategories?.length || 0),
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
    if (tree.length === 0) return;
    const opt = defaultCategoryNeed(tree);
    if (!opt) return;
    setNeedCategory((prev) => prev ?? opt);
    setSearchQ((q) => (q.trim() ? q : opt.name));
  }, [tree]);

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
    setSearchProviders([]);
    setSearchDone(false);
    setSearchCatsExpanded(false);
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
    if (!canSearch) {
      if (!selectedCity) openCityPopup("no_location");
      return;
    }
    const city = selectedCity;
    if (!city) {
      openCityPopup("no_location");
      return;
    }
    const pin = selectedArea?.pincode || searchPin;
    if (!pin) return;
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
      params.city = city.name;
      params.pincode = pin;
      const lat = consumerOrigin.latitude ?? city.latitude ?? null;
      const lon = consumerOrigin.longitude ?? city.longitude ?? null;
      if (lat != null && lon != null) {
        params.latitude = lat;
        params.longitude = lon;
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
    if (!canSearch) return;
    const resolved = resolveCategoryNeed(tree, searchQ, needCategory);
    await runSearch(searchQ.trim(), resolved?.id);
  }

  function onPickNeed(opt: CategoryNeedOption) {
    setNeedCategory(opt);
    setSearchQ(opt.name);
    if (!canSearch) return;
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
  const homeFit = !searchDone && !browsing;

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
      className={cn(
        "min-h-screen max-w-full min-w-0 overflow-x-clip bg-canvas",
        signedIn && "block min-h-screen [--landing-sidebar-w:260px]",
        homeFit && "min-h-dvh",
      )}
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
            className={cn(
              "block fixed inset-0 border-0 p-0 m-0 bg-[rgba(28,42,36,0.45)] z-[35] transition-opacity duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] min-[961px]:hidden",
              navOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
            )}
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
          />
          <aside
            className={cn(
              "flex flex-col gap-4 px-4 pt-[1.15rem] pb-5 bg-[linear-gradient(180deg,#0f4c43_0%,#0a3530_100%)] text-[#f4faf7] fixed left-0 top-0 bottom-0 w-[var(--landing-sidebar-w)] max-h-dvh overflow-auto z-40 -translate-x-[105%] transition-transform duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform shadow-[8px_0_28px_rgba(12,28,24,0.18)] max-[960px]:w-[min(86vw,300px)]",
              navOpen && "translate-x-0",
            )}
            aria-label="Consumer navigation"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <Link to="/" className="inline-flex no-underline text-inherit min-w-0" onClick={() => setNavOpen(false)}>
                  <KoshalCityLogo tone="light" markSize={36} showTagline />
                </Link>
                <button
                  type="button"
                  className="inline-flex items-center justify-center w-9 h-9 shrink-0 rounded-[10px] border border-solid border-white/28 bg-white/10 text-[#f7f3ea] cursor-pointer hover:bg-white/20 hover:text-white"
                  aria-label="Hide menu"
                  title="Hide menu"
                  onClick={() => setNavOpen(false)}
                >
                  <LandingCloseIcon />
                </button>
              </div>
            </div>
            <nav className="flex flex-col gap-1 flex-1">
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
                      cn(
                        "flex items-center justify-between gap-2 px-[0.8rem] py-[0.65rem] rounded-xl text-[rgba(244,250,247,0.88)] no-underline text-[0.95rem] font-medium hover:bg-white/8 hover:text-white",
                        isActive && "bg-accent/22 text-white",
                      )
                    }
                    onClick={() => setNavOpen(false)}
                  >
                    <span className="min-w-0 flex-1">{item.label}</span>
                    {badge > 0 && (
                      <span className={navBadge} aria-label={`${badge} unread`}>
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </nav>
            <div className="flex flex-col gap-3 mt-auto pt-3 border-t border-solid border-white/12">
              <div className="flex flex-col gap-[0.15rem] text-[0.9rem]">
                <strong>{user.full_name}</strong>
                <span className="text-[rgba(244,250,247,0.65)] text-[0.78rem] font-medium">
                  {user.role}
                  {user.phone_number ? ` · ${user.phone_number}` : ""}
                </span>
              </div>
              <button
                className={`${btnSecondary} w-full justify-center bg-transparent text-white border-[rgba(234,161,29,0.55)] hover:bg-accent/16 hover:text-white hover:border-[rgba(234,161,29,0.55)]`}
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
        className={cn(
          "min-w-0 relative transition-[margin-left] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          signedIn && navOpen && "ml-[var(--landing-sidebar-w)] max-[960px]:ml-0",
          homeFit && "min-h-dvh flex flex-col",
        )}
        onClick={() => {
          if (navOpen) setNavOpen(false);
        }}
      >
        <header className="absolute left-0 right-0 z-30 bg-transparent border-b-0">
          <div
            className={cn(
              "w-[min(1120px,calc(100%-2rem))] mx-auto py-3 flex items-center justify-between gap-2 min-w-0 flex-nowrap max-[560px]:py-2.5 max-[560px]:w-[min(1120px,calc(100%-1.25rem))]",
              signedIn && "max-[960px]:w-auto max-[960px]:max-w-none max-[960px]:mx-[0.65rem]",
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              {signedIn && (
                <button
                  type="button"
                  className={cn(
                    "w-[42px] h-[42px] rounded-xl border border-solid border-white/35 bg-white/14 p-[0.65rem] flex-col justify-between cursor-pointer shrink-0",
                    navOpen ? "hidden max-[960px]:flex" : "flex",
                    "max-[560px]:w-9 max-[560px]:h-9 max-[560px]:p-2",
                  )}
                  aria-label="Open menu"
                  aria-expanded={navOpen}
                  aria-hidden={navOpen ? true : undefined}
                  tabIndex={navOpen ? -1 : undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    setNavOpen(true);
                  }}
                >
                  <span className="block h-0.5 w-full bg-white rounded-sm" />
                  <span className="block h-0.5 w-full bg-white rounded-sm" />
                  <span className="block h-0.5 w-full bg-white rounded-sm" />
                </button>
              )}
              <Link to="/" className="inline-flex no-underline text-inherit min-w-0 [&_.kc-word]:max-[360px]:hidden">
                <KoshalCityLogo tone="light" markSize={28} showTagline={false} />
              </Link>
            </div>
            <nav className="flex gap-2 items-center shrink-0 flex-nowrap">
              {signedIn && user ? (
                <>
                  <span
                    className="max-w-40 overflow-hidden text-ellipsis whitespace-nowrap text-[0.92rem] font-semibold text-[#f7f3ea] max-[560px]:hidden"
                    title={user.phone_number || undefined}
                  >
                    {user.full_name}
                  </span>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-xl border border-solid border-[rgba(255,252,247,0.35)] bg-[rgba(255,252,247,0.14)] text-[#f7f3ea] cursor-pointer hover:bg-[rgba(255,252,247,0.24)] hover:border-[rgba(255,252,247,0.55)] hover:text-white max-[560px]:w-9 max-[560px]:h-9"
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
                    className={`${btnSecondary} bg-white/14 border-white/35 text-white hover:bg-white/24 hover:text-white hover:border-white/35 max-[560px]:px-3 max-[560px]:py-[0.4rem] max-[560px]:text-[0.82rem]`}
                    onClick={openLogin}
                  >
                    Log in
                  </button>
                  <button
                    type="button"
                    className={`${btn} max-[560px]:px-3 max-[560px]:py-[0.4rem] max-[560px]:text-[0.82rem]`}
                    onClick={openRegister}
                  >
                    Register
                  </button>
                </>
              )}
            </nav>
          </div>
        </header>

        {privacyOpen ? (
          <div className="flex-1 flex flex-col min-h-[calc(100vh-80px)] bg-canvas text-ink pt-[6.5rem]">
            <div className="flex-1 w-[min(900px,calc(100%-2rem))] mx-auto pb-12">
              <Link
                to="/"
                className="inline-flex items-center gap-2 mb-6 text-sm font-semibold text-primary hover:text-accent no-underline cursor-pointer"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                Back to Home
              </Link>

              <div className="bg-white border border-solid border-line rounded-[24px] p-[clamp(1.5rem,5vw,3rem)] shadow-[0_12px_40px_rgba(0,0,0,0.04)] text-left">
                <h1 className="m-0 text-3xl font-display font-extrabold tracking-tight text-ink">
                  Privacy Policy &amp; Platform Terms of Use
                </h1>
                <p className="mt-2 mb-8 text-sm font-medium text-primary">
                  Last Updated: August 2026
                </p>

                <div className="prose max-w-none text-[0.98rem] leading-[1.65] text-[#4a5568] space-y-6">
                  <p>
                    Welcome to KoshalKarobar (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;). We operate as an online intermediary directory and marketplace platform connecting local consumers with independent service providers, technicians, and merchants across the region.
                  </p>
                  <p>
                    By accessing or using our website, services, or mobile platform, you agree to the collection, use, and terms outlined in this Privacy Policy and Disclaimer.
                  </p>

                  <hr className="my-6 border-t border-solid border-line" />

                  <div className="space-y-4">
                    <h2 className="text-xl font-bold text-ink m-0">1. Nature of the Platform (Intermediary &amp; Marketplace Disclaimer)</h2>
                    <p className="m-0">
                      <strong>Listing Directory Only:</strong> KoshalKarobar acts solely as a discovery and communication bridge between consumers (&quot;Users&quot;) and independent third-party vendors/technicians (&quot;Providers&quot;).
                    </p>
                    <p className="m-0">
                      <strong>No Direct Business Relationship:</strong> KoshalKarobar is not a contractor, employer, broker, retailer, or direct service provider. We do not employ any listed technicians or merchant staff.
                    </p>
                    <p className="m-0">
                      <strong>Sole Responsibility of Users and Providers:</strong> All commercial transactions, quotes, negotiations, service delivery, product purchases, pricing agreements, and payments are strictly between the consumer and the provider.
                    </p>
                    <p className="m-0">
                      <strong>Zero Liability for Disputes &amp; Damages:</strong> KoshalKarobar assumes no liability or responsibility for:
                    </p>
                    <ul className="list-disc pl-5 m-0 space-y-1">
                      <li>Incomplete, substandard, or delayed service delivery.</li>
                      <li>Property damage, personal injury, or financial losses arising from transactions arranged through the platform.</li>
                      <li>Quality, safety, or legality of products sold by listed merchants.</li>
                      <li>Pricing disputes, unfulfilled guarantees, or failure to issue refunds.</li>
                    </ul>
                    <p className="m-0">
                      <strong>Independent Due Diligence:</strong> Users are strictly advised to verify credentials, prices, IDs, and workmanship warranties directly with the provider before initiating any work or releasing payment.
                    </p>
                  </div>

                  <hr className="my-6 border-t border-solid border-line" />

                  <div className="space-y-3">
                    <h2 className="text-xl font-bold text-ink m-0">2. Information We Collect</h2>
                    <p className="m-0">We collect information to facilitate local connections and improve platform reliability:</p>
                    <ul className="list-disc pl-5 m-0 space-y-1">
                      <li><strong>Account &amp; Profile Data:</strong> Name, phone number, email address, physical location/address, and trade categories (for service providers).</li>
                      <li><strong>Provider Verification Details:</strong> Business licenses, trade references, store photos, and government identification submitted voluntarily for listing verification.</li>
                      <li><strong>Usage &amp; Device Data:</strong> IP address, browser type, location coordinates, pages viewed, search queries, and session timestamps.</li>
                      <li><strong>Communication Logs:</strong> Messages, inquiries, or phone link clicks initiated through our directory features.</li>
                    </ul>
                  </div>

                  <hr className="my-6 border-t border-solid border-line" />

                  <div className="space-y-3">
                    <h2 className="text-xl font-bold text-ink m-0">3. How We Use Your Information</h2>
                    <ul className="list-disc pl-5 m-0 space-y-1">
                      <li>To match local consumers with relevant service professionals and nearby shops.</li>
                      <li>To display provider business profiles, contact numbers, and trade locations publicly on the platform.</li>
                      <li>To detect and prevent spam, malicious bot traffic, fraudulent listings, and misuse of directory contacts.</li>
                      <li>To provide platform updates, administrative alerts, and user support.</li>
                    </ul>
                  </div>

                  <hr className="my-6 border-t border-solid border-line" />

                  <div className="space-y-3">
                    <h2 className="text-xl font-bold text-ink m-0">4. Data Sharing &amp; Third-Party Disclosure</h2>
                    <ul className="list-disc pl-5 m-0 space-y-1">
                      <li><strong>Public Directory Listings:</strong> By listing as a provider, you explicitly consent to displaying your business contact details publicly to facilitate direct customer inquiries.</li>
                      <li><strong>Consumer Inquiries:</strong> When a consumer submits a quote or callback request, relevant contact information may be shared with the selected provider.</li>
                      <li><strong>No Sale of Personal Data:</strong> We do not sell, rent, or trade personal user information to third-party marketing brokers.</li>
                      <li><strong>Legal Compliance:</strong> We may disclose collected information if required by applicable Indian law, court order, or regulatory authority.</li>
                    </ul>
                  </div>

                  <hr className="my-6 border-t border-solid border-line" />

                  <div className="space-y-3">
                    <h2 className="text-xl font-bold text-ink m-0">5. User Content, Reviews &amp; Ratings</h2>
                    <ul className="list-disc pl-5 m-0 space-y-1">
                      <li>Reviews, ratings, comments, and profile pictures submitted to the platform are publicly visible.</li>
                      <li>We reserve the right (without obligation) to moderate, remove, or edit false, defamatory, abusive, or spam reviews.</li>
                      <li>KoshalKarobar is not responsible for subjective opinions or feedback posted by consumers regarding any provider.</li>
                    </ul>
                  </div>

                  <hr className="my-6 border-t border-solid border-line" />

                  <div className="space-y-3">
                    <h2 className="text-xl font-bold text-ink m-0">6. Cookies and Tracking Technologies</h2>
                    <ul className="list-disc pl-5 m-0 space-y-1">
                      <li>We use session cookies, local storage, and analytical trackers to maintain logged-in states, remember search preferences, and analyze platform traffic patterns.</li>
                      <li>Users can adjust their browser settings to decline cookies, though certain site features may have reduced functionality.</li>
                    </ul>
                  </div>

                  <hr className="my-6 border-t border-solid border-line" />

                  <div className="space-y-3">
                    <h2 className="text-xl font-bold text-ink m-0">7. Data Security &amp; Storage</h2>
                    <ul className="list-disc pl-5 m-0 space-y-1">
                      <li>We implement standard administrative, technical, and physical safeguards to protect your personal information against unauthorized access, loss, or misuse.</li>
                      <li>While we strive to protect your data, no method of internet transmission or database hosting is 100% secure, and we cannot guarantee absolute data security.</li>
                    </ul>
                  </div>

                  <hr className="my-6 border-t border-solid border-line" />

                  <div className="space-y-3">
                    <h2 className="text-xl font-bold text-ink m-0">8. Platform Intellectual Property</h2>
                    <ul className="list-disc pl-5 m-0 space-y-1">
                      <li>All website code, layout, UI design, branding, and logos (including the KoshalKarobar name and emblem) are the exclusive intellectual property of the platform operator.</li>
                      <li>Unauthorized scraping, programmatic copying of directory data, or reverse engineering is strictly prohibited.</li>
                    </ul>
                  </div>

                  <hr className="my-6 border-t border-solid border-line" />

                  <div className="space-y-3">
                    <h2 className="text-xl font-bold text-ink m-0">9. Policy Updates</h2>
                    <p className="m-0">
                      We may revise this Privacy Policy and Platform Terms periodically. The revised policy will be posted on this page with an updated date. Continued use of the platform constitutes acceptance of the modified terms.
                    </p>
                  </div>

                  <hr className="my-6 border-t border-solid border-line" />

                  <div className="space-y-3">
                    <h2 className="text-xl font-bold text-ink m-0">10. Contact &amp; Grievance Officer</h2>
                    <p className="m-0">For privacy questions, data deletion requests, or directory listing corrections, contact:</p>
                    <ul className="list-disc pl-5 m-0 space-y-1">
                      <li><strong>Platform Name:</strong> KoshalKarobar</li>
                      <li><strong>Email:</strong> support@koshalkarobar.in</li>
                      <li><strong>Region:</strong> Odisha, India</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
            <footer
              className={cn(
                "w-[min(1120px,calc(100%-2rem))] mx-auto pt-6 pb-10 flex flex-wrap gap-3 items-baseline justify-between border-t border-solid border-line mt-auto",
              )}
            >
              <strong className="inline-flex">
                <KoshalCityLogo markSize={32} showTagline={false} />
              </strong>
              <div className="flex items-center gap-4">
                <Link to="/?contact=1" className="text-xs font-semibold text-primary hover:text-accent no-underline">
                  Contact Us
                </Link>
                <span className={muted}>Connecting Homes, Empowering Business</span>
              </div>
            </footer>
          </div>
        ) : contactOpen ? (
          <div className="flex-1 flex flex-col min-h-[calc(100vh-80px)] bg-canvas text-ink pt-[6.5rem]">
            <div className="flex-1 pb-12">
              <ContactForm />
            </div>
            <footer
              className={cn(
                "w-[min(1120px,calc(100%-2rem))] mx-auto pt-6 pb-10 flex flex-wrap gap-3 items-baseline justify-between border-t border-solid border-line mt-auto",
              )}
            >
              <strong className="inline-flex">
                <KoshalCityLogo markSize={32} showTagline={false} />
              </strong>
              <div className="flex items-center gap-4">
                <Link to="/?privacy=1" className="text-xs font-semibold text-primary hover:text-accent no-underline">
                  Privacy Policy &amp; Terms
                </Link>
                <span className={muted}>Connecting Homes, Empowering Business</span>
              </div>
            </footer>
          </div>
        ) : (
          <>
            <section
              className={cn(
                "relative min-h-[clamp(420px,68vh,620px)] grid items-end text-white overflow-visible min-[821px]:items-center min-[821px]:min-h-[clamp(400px,60vh,560px)]",
                homeFit && "min-h-0 flex-[0_0_auto] items-end min-[821px]:items-end min-[821px]:min-h-0",
              )}
            >
              <div className="absolute inset-0 bg-primary overflow-hidden" aria-hidden="true">
                <MarketplaceScene className="marketplace-scene absolute inset-0 w-full h-full max-h-none scale-[1.04] animate-landing-scene-drift" idPrefix="landing" />
              </div>
              <div
                className="absolute inset-0 bg-[linear-gradient(105deg,rgba(10,58,52,0.72)_0%,rgba(10,58,52,0.28)_48%,rgba(10,58,52,0.55)_100%),linear-gradient(180deg,rgba(10,58,52,0.2)_0%,rgba(10,58,52,0.08)_42%,rgba(10,58,52,0.78)_100%)]"
                aria-hidden="true"
              />
              <div
                className={cn(
                  "relative z-[4] w-[min(920px,calc(100%-2rem))] mx-auto pt-[5.5rem] pb-[4.5rem] min-[821px]:pt-[3.25rem] min-[821px]:pb-[3.75rem] min-[821px]:-translate-y-7 max-[820px]:pt-[5.75rem] max-[820px]:pb-14 max-[560px]:w-[min(920px,calc(100%-1.25rem))]",
                  homeFit &&
                  "pt-[5.25rem] pb-5 translate-y-0 min-[821px]:pt-[4.5rem] min-[821px]:pb-[1.35rem] min-[821px]:translate-y-0 max-[820px]:pt-[5.25rem] max-[820px]:pb-[1.1rem]",
                )}
              >
                <p
                  className={cn(
                    "m-0 mb-[1.35rem] max-w-[34rem] text-[1.08rem] font-medium tracking-[-0.01em] leading-normal text-white/92 min-[821px]:mb-[1.15rem]",
                    homeFit && "mb-[0.65rem] text-base",
                  )}
                >
                  Connecting Homes, Empowering Business.
                </p>

                <div
                  className={cn(
                    "w-full box-border relative z-[5] py-4 px-4 rounded-3xl overflow-visible bg-[linear-gradient(180deg,rgba(255,254,251,0.98),rgba(247,245,239,0.96))] border border-solid border-white/55 shadow-[0_1px_0_rgba(255,255,255,0.7)_inset,0_22px_48px_rgba(12,18,28,0.26)] animate-landing-rise max-[820px]:py-[0.9rem] max-[820px]:px-[0.85rem] max-[820px]:pb-3",
                    homeFit && "py-[0.7rem] px-[0.8rem] pb-2 rounded-[18px]",
                  )}
                >
                  <div className={cn("mx-[0.35rem] mb-3", homeFit && "mb-[0.4rem] mx-1")}>
                    <p className="m-0 mb-[0.2rem] text-[0.72rem] font-bold tracking-[0.08em] uppercase text-primary/85">
                      Find nearby help
                    </p>
                    <p className={cn("m-0 text-[0.92rem] leading-[1.45] text-[rgba(29,36,43,0.58)]", homeFit && "hidden")}>
                      City, area, then category.
                    </p>
                  </div>
                  <form
                    className="flex flex-col flex-nowrap gap-0 w-full relative overflow-visible bg-card rounded-2xl border border-solid border-[rgba(29,36,43,0.08)] p-[0.35rem] text-ink max-[820px]:p-[0.45rem]"
                    onSubmit={onSearch}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !canSearch) e.preventDefault();
                    }}
                  >
                    <div
                      className={cn(
                        "flex items-stretch min-w-0",
                        homeFit ? "max-sm:flex-col" : "max-[820px]:flex-col",
                      )}
                    >
                      <div className={cn("relative min-w-0 flex-[1_1_50%] z-5 flex flex-col justify-center gap-[0.2rem] py-[0.55rem] px-4 overflow-visible", homeFit && "py-[0.4rem] px-[0.8rem]", "has-[.z-20]:z-20")}>
                        <label htmlFor="landing-city-field" className="text-[0.72rem] font-bold tracking-[0.04em] uppercase text-muted">
                          City
                        </label>
                        <div className="flex items-center gap-[0.35rem]">
                          <CitySearchBox
                            id="landing-city-field"
                            variant="pad"
                            value={selectedCity?.name || ""}
                            onChange={onCitySelectChange}
                            placeholder="Select city…"
                            className="flex-1 min-w-0"
                          />
                          <button
                            className={`${iconBtn} w-[1.85rem] h-[1.85rem] rounded-lg shrink-0`}
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
                      <div
                        className={cn(
                          "w-px bg-line my-[0.55rem] self-stretch",
                          homeFit
                            ? "max-sm:w-auto max-sm:h-px max-sm:my-[0.15rem] max-sm:mx-[0.35rem]"
                            : "max-[820px]:w-auto max-[820px]:h-px max-[820px]:my-[0.15rem] max-[820px]:mx-[0.35rem]",
                        )}
                        aria-hidden="true"
                      />
                      <div className={cn("relative min-w-0 flex-[1_1_50%] z-[4] flex flex-col justify-center gap-[0.2rem] py-[0.55rem] px-4 overflow-visible", homeFit && "py-[0.4rem] px-[0.8rem]", "has-[.z-20]:z-20")}>
                        <label htmlFor="landing-area-field" className="text-[0.72rem] font-bold tracking-[0.04em] uppercase text-muted">
                          Area / pincode
                        </label>
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
                    <div
                      className={cn(
                        "flex items-stretch min-w-0 border-t border-solid border-line",
                        homeFit ? "max-[560px]:flex-wrap" : "max-[820px]:flex-col",
                      )}
                    >
                      <div className="flex-1 min-w-0 z-3 flex flex-col justify-center gap-[0.2rem] py-[0.55rem] px-4 overflow-visible has-[.z-20]:z-20">
                        <label htmlFor="landing-search-q" className="text-[0.72rem] font-bold tracking-[0.04em] uppercase text-muted">
                          Category / need
                        </label>
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
                          placeholder=""
                        />
                      </div>
                      <button
                        className={cn(
                          btn,
                          "self-center m-[0.3rem_0.3rem_0.3rem_0.4rem] rounded-xl py-[0.9rem] px-[1.4rem] whitespace-nowrap min-w-[7.5rem] disabled:opacity-45 disabled:cursor-not-allowed disabled:bg-[#9aa8a3] disabled:text-white disabled:shadow-none",
                          homeFit
                            ? "py-[0.7rem] px-[1.15rem] max-[560px]:w-full max-[560px]:mt-[0.2rem] max-[560px]:mx-0"
                            : "max-[820px]:w-full max-[820px]:mt-[0.35rem] max-[820px]:mx-0",
                        )}
                        type="submit"
                        disabled={!canSearch || searchBusy}
                        title={
                          canSearch
                            ? undefined
                            : "Choose a city and an area or pincode to search"
                        }
                      >
                        {searchBusy ? "Searching…" : "Search"}
                      </button>
                    </div>
                  </form>
                  <p
                    className={cn(
                      "mt-[0.7rem] mx-[0.4rem] mb-[0.15rem] text-[0.82rem] text-[rgba(29,36,43,0.55)]",
                      homeFit && "mt-[0.35rem] mx-[0.3rem] mb-0 text-[0.78rem]",
                    )}
                    aria-live="polite"
                  >
                    {loc.status === "locating"
                      ? "Detecting your area…"
                      : selectedArea && selectedCity
                        ? `Ready near ${selectedArea.name}, ${selectedCity.name}`
                        : customPincode && selectedCity
                          ? `Ready near pincode ${customPincode} in ${selectedCity.name}`
                          : selectedCity
                            ? "Choose an area or pincode to search"
                            : hasCoords
                              ? `Near ${loc.label || "you"} — choose a supported city and area`
                              : "Choose a city and area to begin"}
                  </p>
                </div>
                <div
                  className={cn(
                    "flex items-center justify-between gap-x-[1.15rem] gap-y-[0.85rem] w-full box-border mt-3 py-[0.85rem] px-4 rounded-2xl bg-[rgba(255,254,251,0.95)] border border-solid border-white/50 shadow-[0_10px_24px_rgba(12,18,28,0.16)] text-ink",
                    homeFit
                      ? "mt-2 py-2 px-[0.8rem] max-[560px]:flex-col max-[560px]:items-stretch"
                      : "max-[820px]:flex-col max-[820px]:items-stretch max-[820px]:py-[0.9rem] max-[820px]:px-[0.9rem]",
                  )}
                >
                  <div>
                    <p className={cn("m-0 text-[0.98rem] font-bold tracking-[-0.01em] text-ink", homeFit && "text-[0.9rem]")}>
                      Can’t find the right shop?
                    </p>
                    <p
                      className={cn(
                        "mt-[0.2rem] mb-0 text-[0.84rem] leading-snug text-[rgba(29,36,43,0.62)]",
                        homeFit && "hidden",
                      )}
                      id="landing-broadcast-copy"
                    >
                      Broadcast your need if you don’t see the right shop.
                    </p>
                  </div>
                  <button
                    type="button"
                    className={cn(
                      btn,
                      "shrink-0 whitespace-nowrap rounded-xl py-3 px-[1.15rem]",
                      homeFit
                        ? "py-2 px-[0.9rem] max-[560px]:w-full max-[560px]:justify-center"
                        : "max-[820px]:w-full max-[820px]:justify-center",
                    )}
                    onClick={onBroadcastNearby}
                    aria-describedby="landing-broadcast-copy"
                  >
                    Ask nearby
                  </button>
                </div>
                {error && <p className={`${errorText} mt-3 mb-0`}>{error}</p>}
              </div>
            </section>

            <div
              className={cn(
                "relative z-[2] -mt-6 pt-[2.35rem] pb-4 bg-[radial-gradient(ellipse_70%_40%_at_50%_0%,rgba(15,76,67,0.05),transparent_55%),var(--color-canvas)] rounded-t-[28px] shadow-[0_-12px_40px_rgba(29,36,43,0.08)]",
                homeFit && "flex-1 flex flex-col -mt-4 pt-[1.1rem] pb-[0.4rem] min-h-0",
              )}
            >
              {searchBusy && (
                <section className="w-[min(920px,calc(100%-2rem))] mx-auto mb-10 box-border max-[560px]:w-[min(920px,calc(100%-1.25rem))]">
                  <div className="pb-[0.85rem] border-b border-solid border-[rgba(29,36,43,0.07)] mb-[1.15rem]">
                    <div className="skeleton h-[0.7rem] w-16 rounded-full mb-2" />
                    <div className="skeleton h-[1.4rem] w-48 rounded-full mb-3" />
                    <div className="skeleton h-[0.75rem] w-64 rounded-full" />
                  </div>
                  <div className="grid gap-3">
                    {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
                  </div>
                </section>
              )}
              {searchDone && (
                <section
                  className="w-[min(920px,calc(100%-2rem))] mx-auto mb-10 box-border max-[560px]:w-[min(920px,calc(100%-1.25rem))]"
                  ref={searchRef}
                  id="search-results"
                >
                  <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 pb-[0.85rem] border-b border-solid border-[rgba(29,36,43,0.07)] mb-[1.15rem]">
                    <div>
                      <p className="m-0 mb-[0.2rem] text-[0.72rem] font-bold tracking-[0.08em] uppercase text-primary/78">Results</p>
                      <h2 className="m-0 mb-[0.35rem] font-display text-[clamp(1.1rem,3.5vw,1.75rem)] md:text-[clamp(1.45rem,2.4vw,1.75rem)] font-bold tracking-[-0.03em] text-brand-dark">
                        {searchQ.trim()
                          ? `Matches for "${searchQ.trim()}"`
                          : selectedArea && selectedCity
                            ? `Providers near ${selectedArea.name}`
                            : customPincode && selectedCity
                              ? `Providers near ${customPincode}`
                              : selectedCity
                                ? `Providers in ${selectedCity.name}`
                                : "Providers near you"}
                      </h2>
                      <p className="m-0 text-[0.92rem] leading-[1.45] text-[rgba(29,36,43,0.62)]">{matchHint}</p>
                      {searchProviders.length > 0 && (
                        <p className={`${muted} mt-[0.35rem] mb-0 text-[0.86rem]`}>
                          {searchProviders.length} provider{searchProviders.length === 1 ? "" : "s"} · page{" "}
                          {currentSearchPage} of {searchPageCount}
                        </p>
                      )}
                    </div>
                    {searchProviders.length > 0 && (
                      <div className="flex flex-wrap items-center justify-end gap-x-[0.85rem] gap-y-[0.65rem] py-[0.65rem] px-[0.85rem] rounded-[14px] bg-primary/6 border border-solid border-primary/12 w-full md:w-auto md:flex-nowrap md:items-center">
                        <p className="m-0 text-[0.88rem] font-semibold text-brand-dark">
                          {selectedSearchIds.length === 0
                            ? "Select providers to request"
                            : `${selectedSearchIds.length} selected`}
                        </p>
                        <button
                          type="button"
                          className={`${btn} w-full md:w-auto`}
                          onClick={goSendRequest}
                          disabled={selectedSearchIds.length === 0}
                        >
                          Send a request
                        </button>
                      </div>
                    )}
                  </div>

                  {searchActionError && <p className={errorText}>{searchActionError}</p>}
                  {chatError && (
                    <p className={errorText} onClick={() => setChatError("")}>
                      {chatError}
                    </p>
                  )}
                  <div className="grid gap-3 animate-landing-rise">
                    {searchProviders.length === 0 ? (
                      <div className="py-7 px-5 text-center rounded-2xl border border-dashed border-[rgba(29,36,43,0.14)] bg-[rgba(255,254,251,0.7)]">
                        <strong className="block mb-[0.35rem] text-[1.02rem] text-ink">No providers found</strong>
                        <p className="m-0 text-[0.92rem] text-[rgba(29,36,43,0.58)] leading-[1.45]">
                          Try another keyword, or browse popular categories below after a new search.
                        </p>
                      </div>
                    ) : (
                      <>
                        {pagedSearchProviders.slice(0, 4).map((p) => (
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
                        ))}

                        {/* All Categories link after 4th provider */}
                        <button
                          type="button"
                          className="w-full py-3 px-4 rounded-2xl border border-solid border-primary/15 bg-white text-brand text-[0.9rem] font-bold cursor-pointer hover:bg-primary/5 hover:border-primary/30 transition-all duration-150"
                          onClick={() => {
                            setSearchDone(false);
                            setTimeout(() => {
                              document.getElementById("categories")?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }, 50);
                          }}
                        >
                          All Categories ({popularTree.length})
                        </button>

                        {pagedSearchProviders.slice(4).map((p) => (
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
                        ))}
                      </>
                    )}
                  </div>

                  {searchProviders.length > SEARCH_PAGE_SIZE && (
                    <Pagination
                      page={currentSearchPage}
                      totalItems={searchProviders.length}
                      pageSize={SEARCH_PAGE_SIZE}
                      onPageChange={(p) => {
                        setSearchPage(p);
                        searchRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      itemLabel="providers"
                      className="mt-4"
                    />
                  )}
                </section>

              )}

              {!searchDone && (
                <section
                  className={cn(
                    "w-[min(920px,calc(100%-2rem))] mx-auto mb-10 box-border max-[560px]:w-[min(920px,calc(100%-1.25rem))]",
                    homeFit && "flex flex-col flex-1 min-h-0 mb-2",
                  )}
                  id="categories"
                >
                  <div
                    className={cn(
                      "flex items-end justify-between gap-4 pb-[0.85rem] border-b border-solid border-[rgba(29,36,43,0.07)] mb-[1.15rem] max-[820px]:items-start max-[820px]:flex-wrap",
                      homeFit && "pb-[0.4rem] mb-[0.55rem]",
                    )}
                  >
                    <div>
                      <p className="m-0 mb-[0.2rem] text-[0.72rem] font-bold tracking-[0.08em] uppercase text-primary/78">
                        {browsing ? "Category" : "Browse"}
                      </p>
                      <h2
                        className={cn(
                          "m-0 mb-[0.35rem] font-display text-[clamp(1.45rem,2.4vw,1.75rem)] font-bold tracking-[-0.03em] text-brand-dark",
                          homeFit && "text-[1.28rem] mb-[0.12rem]",
                        )}
                      >
                        {browsing
                          ? selectedParentCat?.name || selected?.name || "Category"
                          : "Popular categories"}
                      </h2>
                      <p className={cn("m-0 text-[0.92rem] leading-[1.45] text-[rgba(29,36,43,0.62)]", homeFit && "text-[0.84rem]")}>
                        {browsing
                          ? hasLocation
                            ? `${matchHint}${countsReady && nearbyForSelected != null
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
                      <button type="button" className={`${btnSecondary} shrink-0 whitespace-nowrap`} onClick={clearCategoryBrowse}>
                        All categories
                      </button>
                    ) : popularTree.length > POPULAR_PREVIEW ? (
                      <button
                        type="button"
                        className="shrink-0 mb-[0.15rem] py-[0.35rem] px-[0.15rem] border-0 bg-transparent text-brand font-inherit text-[0.88rem] font-bold cursor-pointer hover:text-brand-dark hover:underline"
                        onClick={() => setCatsExpanded((v) => !v)}
                      >
                        {catsExpanded ? "Show less" : `All Categories (${popularTree.length})`}
                      </button>
                    ) : null}
                  </div>

                  {tree.length === 0 && (
                    <div className={cn(
                      "grid grid-cols-1 md:grid-cols-3 gap-[0.65rem]",
                      homeFit && "flex-1 min-h-0 overflow-y-auto content-start",
                    )}>
                      {Array.from({ length: 9 }).map((_, i) => (
                        <SkeletonCategoryCard key={i} compact={homeFit} />
                      ))}
                    </div>
                  )}
                  <div
                    className={cn(
                      browsing
                        ? "flex flex-wrap gap-[0.65rem]"
                        : "grid grid-cols-1 md:grid-cols-3 gap-[0.65rem]"
                        + (homeFit ? " flex-1 min-h-0 overflow-y-auto content-start" : ""),
                    )}
                    role="list"
                    aria-label={browsing ? "Selected category" : "Popular categories"}
                  >
                    {(() => {
                      const itemsToRender = browsing && selectedParentCat ? [selectedParentCat] : visiblePopular;

                      const renderCat = (cat: CategoryTree, index = 0) => {
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
                            className={cn(
                              "flex flex-row items-center gap-[0.85rem] text-left min-h-[4.8rem] min-w-0 py-[0.85rem] px-[1rem] rounded-[1.25rem] border border-solid border-[rgba(29,36,43,0.06)] bg-white shadow-[0_2px_8px_rgba(29,36,43,0.02)] cursor-pointer transition-all duration-200 hover:border-primary/40 hover:bg-[#fbfbf9] hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(15,76,67,0.1)] focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2",
                              browsing && "flex-[0_1_17rem] max-w-80",
                              homeFit && "min-h-14 py-2 px-[0.65rem] gap-[0.55rem]",
                              isActive && "border-brand bg-primary/8 shadow-sm hover:border-brand",
                              !catsExpanded && !browsing && index >= 3 && "md:flex hidden",
                            )}
                            role="listitem"
                            aria-pressed={isActive}
                            onClick={() => onSelectCategory(cat)}
                          >
                            <span
                              className={cn(
                                "grid place-items-center shrink-0 w-8 h-8 rounded-[0.7rem] md:w-[2.75rem] md:h-[2.75rem] md:rounded-[0.85rem] bg-[linear-gradient(135deg,rgba(15,76,67,0.12),rgba(26,107,95,0.06))] text-brand font-bold text-[0.9rem] md:text-[1.1rem]",
                                homeFit && "w-8 h-8 rounded-lg text-[0.9rem]",
                              )}
                              aria-hidden="true"
                            >
                              <CategoryChipIcon name={cat.name} slug={cat.slug} />
                            </span>
                            <span className="flex flex-col gap-[0.1rem] min-w-0 flex-1">
                              <strong className="text-[0.8rem] md:text-[0.92rem] font-bold tracking-[-0.01em] leading-[1.25] text-[var(--ink)] line-clamp-2 whitespace-normal break-words text-left">
                                {cat.name}
                              </strong>
                              <span className="text-[0.72rem] md:text-[0.82rem] font-medium text-[rgba(29,36,43,0.58)] truncate">{meta}</span>
                            </span>
                          </button>
                        );
                      };

                      return itemsToRender.map((c, i) => renderCat(c, i));
                    })()}
                  </div>
                  {selectedParentCat && rankedSubcats.length > 0 && (
                    <div
                      className={cn(
                        "flex flex-wrap items-stretch gap-0 mt-[0.55rem] border-b border-solid border-[rgba(29,36,43,0.1)]",
                        homeFit && "mt-[0.35rem] shrink-0",
                      )}
                      role="tablist"
                      aria-label={`${selectedParentCat.name} types`}
                    >
                      <button
                        type="button"
                        role="tab"
                        className={cn(
                          "inline-flex items-center gap-[0.3rem] m-0 mb-[-1px] pt-[0.7rem] px-[0.85rem] pb-[0.6rem] min-h-10 border-0 border-b-2 border-solid border-transparent rounded-none bg-transparent text-[rgba(29,36,43,0.62)] font-inherit text-[0.9rem] font-medium leading-tight cursor-pointer whitespace-nowrap hover:text-ink",
                          homeFit && "py-[0.55rem] px-[0.7rem] pb-[0.45rem] min-h-[2.4rem] text-[0.86rem]",
                          selected?.id === selectedParentCat.id && "text-brand-dark font-bold border-b-brand",
                        )}
                        aria-selected={selected?.id === selectedParentCat.id}
                        onClick={() => onSelectCategory(selectedParentCat)}
                      >
                        All {selectedParentCat.name}
                        {hasLocation && countsReady ? (
                          <span className="text-[0.78rem] font-medium text-[rgba(29,36,43,0.45)]">
                            · {nearbyCounts[selectedParentCat.id] || 0}
                          </span>
                        ) : null}
                      </button>
                      {visibleSubcats.map((sub) => (
                        <button
                          key={sub.id}
                          type="button"
                          role="tab"
                          className={cn(
                            "inline-flex items-center gap-[0.3rem] m-0 mb-[-1px] pt-[0.7rem] px-[0.85rem] pb-[0.6rem] min-h-10 border-0 border-b-2 border-solid border-transparent rounded-none bg-transparent text-[rgba(29,36,43,0.62)] font-inherit text-[0.9rem] font-medium leading-tight cursor-pointer whitespace-nowrap hover:text-ink",
                            homeFit && "py-[0.55rem] px-[0.7rem] pb-[0.45rem] min-h-[2.4rem] text-[0.86rem]",
                            selected?.id === sub.id && "text-brand-dark font-bold border-b-brand",
                          )}
                          aria-selected={selected?.id === sub.id}
                          title={sub.description || undefined}
                          onClick={() => onSelectCategory(sub, selectedParentCat)}
                        >
                          {sub.name}
                          {hasLocation && countsReady ? (
                            <span className="text-[0.78rem] font-medium text-[rgba(29,36,43,0.45)]">
                              · {nearbyCounts[sub.id] || 0}
                            </span>
                          ) : null}
                        </button>
                      ))}
                      {overflowSubcats.length > 0 && (
                        <div className="relative shrink-0" ref={subMoreRef}>
                          <button
                            type="button"
                            className={cn(
                              "inline-flex items-center gap-[0.3rem] m-0 mb-[-1px] pt-[0.7rem] px-[0.85rem] pb-[0.6rem] min-h-10 border-0 border-b-2 border-solid border-transparent rounded-none bg-transparent text-brand font-inherit text-[0.9rem] font-bold leading-tight cursor-pointer whitespace-nowrap hover:text-brand-dark",
                              subMoreOpen && "text-brand-dark",
                            )}
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
                              className="absolute top-[calc(100%+0.35rem)] right-0 z-[12] min-w-56 max-w-[min(18rem,80vw)] max-h-56 overflow-auto m-0 p-[0.35rem] list-none rounded-xl border border-solid border-[rgba(29,36,43,0.1)] bg-card shadow-[0_14px_32px_rgba(12,18,28,0.16)]"
                              role="listbox"
                              aria-label="More types"
                            >
                              {overflowSubcats.map((sub) => (
                                <li key={sub.id} role="option" aria-selected={selected?.id === sub.id}>
                                  <button
                                    type="button"
                                    className={cn(
                                      "flex items-center justify-between gap-3 w-full m-0 py-[0.55rem] px-[0.7rem] border-0 rounded-lg bg-transparent text-ink font-inherit text-[0.9rem] font-semibold text-left cursor-pointer hover:bg-primary/8",
                                      selected?.id === sub.id && "bg-primary/8 text-brand-dark",
                                    )}
                                    title={sub.description || undefined}
                                    onClick={() => {
                                      onSelectCategory(sub, selectedParentCat);
                                      setSubMoreOpen(false);
                                    }}
                                  >
                                    <span>{sub.name}</span>
                                    {hasLocation && countsReady ? (
                                      <span className="text-[0.78rem] text-[rgba(29,36,43,0.45)]">
                                        {nearbyCounts[sub.id] || 0}
                                      </span>
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
                    <div className="mt-[1.15rem]" ref={browseRef} id="category-browse">
                      {selectedParentCat && selected.id !== selectedParentCat.id && (
                        <p className="m-0 mb-3 text-[0.9rem] text-[rgba(29,36,43,0.62)]">
                          Showing <strong>{selected.name}</strong>
                        </p>
                      )}
                      {error && <p className={errorText}>{error}</p>}
                      {!hasLocation && (
                        <p className={muted}>
                          Choose a city or allow location above to see providers in this category.
                        </p>
                      )}
                      {hasLocation && categoryBusy && !zeroNearbySelected && (
                        <div className="grid gap-3">
                          {[0, 1, 2].map((i) => <SkeletonCard key={i} />)}
                        </div>
                      )}
                      {showBroadcastEmpty && (
                        <div className="py-7 px-5 text-left rounded-2xl border border-solid border-primary/14 bg-primary/4">
                          <strong className="block mb-[0.35rem] text-[1.02rem] text-ink">No verified providers nearby</strong>
                          <p className="m-0 mb-[0.85rem] text-[0.92rem] text-[rgba(29,36,43,0.58)] leading-[1.45]">
                            Nobody listed for {selected.name}
                            {selectedCity ? ` in ${selectedArea?.name || selectedCity.name}` : ""}. Broadcast
                            this need and nearby providers can send quotes.
                          </p>
                          <button type="button" className={btn} onClick={onBroadcastNearby}>
                            Ask nearby
                          </button>
                        </div>
                      )}
                      {hasLocation && !showBroadcastEmpty && !categoryBusy && (
                        <div className="grid gap-3">
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
              <footer
                className={cn(
                  "w-[min(1120px,calc(100%-2rem))] mx-auto pt-6 pb-10 flex flex-wrap gap-3 items-baseline justify-between border-t border-solid border-line",
                  homeFit && "mt-auto pt-[0.55rem] pb-[0.85rem]",
                )}
              >
                <strong className="inline-flex">
                  <KoshalCityLogo markSize={32} showTagline={false} />
                </strong>
                <div className="flex items-center gap-4">
                  <Link to="/?contact=1" className="text-xs font-semibold text-primary hover:text-accent no-underline">
                    Contact Us
                  </Link>
                  <Link to="/?privacy=1" className="text-xs font-semibold text-primary hover:text-accent no-underline">
                    Privacy Policy &amp; Terms
                  </Link>
                  <span className={muted}>Connecting Homes, Empowering Business</span>
                </div>
              </footer>
            </div>
          </>
        )}

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
          <div className={`${modalBackdrop} z-[120]`} role="presentation">
            <div
              className={`${card} w-[min(420px,100%)] text-left py-[1.35rem] px-[1.35rem] pb-[1.2rem] overflow-visible shadow-[0_18px_40px_rgba(15,23,42,0.2)]`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="landing-city-popup-title"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="m-0 mb-1 text-[0.72rem] font-bold tracking-[0.08em] uppercase text-brand">Service area</p>
              <h3 id="landing-city-popup-title" className="m-0 mb-[0.45rem] tracking-[-0.02em]">
                {cityPopupReason === "out_of_area" ? "Choose a supported city" : "Select your city"}
              </h3>
              <p className={`${muted} m-0 mb-4 leading-[1.45]`}>
                {cityPopupReason === "out_of_area"
                  ? "Your current location is outside our service cities. Pick one of the cities below to continue."
                  : "Location isn’t available. Choose a city to browse nearby providers."}
              </p>
              <div className={`${field} mb-4`}>
                <label className={fieldLabel} htmlFor="landing-city-popup-select">
                  City
                </label>
                <CitySearchBox
                  id="landing-city-popup-select"
                  value={cityDraft}
                  onChange={setCityDraft}
                  placeholder="Search city…"
                  autoFocus
                />
              </div>
              <div className="flex flex-wrap justify-end gap-[0.55rem]">
                {selectedCity && (
                  <button
                    className={btnSecondary}
                    type="button"
                    onClick={() => setCityPopupReason(null)}
                  >
                    Keep {selectedCity.name}
                  </button>
                )}
                <button
                  className={btn}
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
            className={modalBackdrop}
            role="presentation"
            onClick={() => setCategoryMismatchPopup(false)}
          >
            <div
              className={`${card} w-[min(400px,100%)] text-center shadow-[0_18px_40px_rgba(15,23,42,0.2)]`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="landing-category-mismatch-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="landing-category-mismatch-title" className="m-0 mb-2">
                Same category required
              </h3>
              <p className={`${muted} m-0 mb-4`}>
                {SAME_CATEGORY_REQUEST_MESSAGE}
              </p>
              <button className={btn} type="button" onClick={() => setCategoryMismatchPopup(false)}>
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

  const kindPill =
    kind === "SERVICE" ? pillKindService : kind === "PRODUCT" ? pillKindProduct : pillKindBoth;
  const accent =
    kind === "SERVICE" ? "bg-blue-600" : kind === "PRODUCT" ? "bg-accent" : "bg-primary";
  const mark =
    kind === "SERVICE"
      ? "bg-blue-600/12 text-blue-700"
      : kind === "PRODUCT"
        ? "bg-accent/18 text-[#9a6a0a]"
        : "bg-primary/14 text-primary";
  const cardBg =
    kind === "SERVICE"
      ? "bg-[linear-gradient(180deg,rgba(37,99,235,0.04),var(--color-card)_42%)]"
      : kind === "PRODUCT"
        ? "bg-[linear-gradient(180deg,rgba(234,161,29,0.08),var(--color-card)_42%)]"
        : "bg-[linear-gradient(180deg,rgba(15,76,67,0.05),var(--color-card)_42%)]";

  return (
    <article
      className={cn(
        "relative grid grid-cols-[4px_1fr] overflow-hidden rounded-2xl border border-solid border-[rgba(29,36,43,0.08)] shadow-none transition-[border-color,box-shadow] hover:border-primary/22 hover:shadow-[0_10px_24px_rgba(28,42,36,0.06)]",
        cardBg,
        selected && "border-primary/45 shadow-[0_0_0_1px_rgba(15,76,67,0.25),0_12px_28px_rgba(15,76,67,0.1)]",
      )}
    >
      <div className={accent} aria-hidden="true" />
      <div className="flex flex-col gap-[0.7rem] pt-4 pr-[1.05rem] pb-4 pl-4 min-w-0">
        <div className="flex gap-[0.85rem] items-start min-w-0">
          {selectable && (
            <label className="grid place-items-center shrink-0 mt-[0.35rem] cursor-pointer">
              <input
                className="w-[1.15rem] h-[1.15rem] accent-brand cursor-pointer"
                type="checkbox"
                checked={selected}
                onChange={() => onToggleSelect?.()}
                aria-label={`Select ${p.business_name}`}
              />
            </label>
          )}
          <span
            className={cn(
              "shrink-0 grid place-items-center w-[2.65rem] h-[2.65rem] rounded-[14px] font-bold text-[1.05rem]",
              mark,
            )}
            aria-hidden="true"
          >
            {initial}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-[0.65rem]">
              <strong className="m-0 text-[1.05rem] leading-tight text-brand-dark">
                <Link className="text-inherit no-underline hover:text-brand" to={providerPublicPath(p)}>
                  {p.business_name}
                </Link>
              </strong>
              <span className={online ? pillOnline : pillOffline}>
                {online ? "Online" : "Offline"}
              </span>
            </div>
            {p.full_name && <p className={`${muted} mt-[0.15rem] mb-0 text-[0.88rem]`}>{p.full_name}</p>}
            <div className="flex flex-wrap items-center gap-[0.35rem] mt-[0.45rem]">
              <VerifiedLocalPartnerBadge verificationStatus={p.verification_status} />
              <span className={kindPill}>{offerKindLabel(kind)}</span>
              {distanceLabel && (
                <span className="inline-flex items-center max-w-full py-[0.2rem] px-[0.65rem] rounded-full border border-solid border-primary/20 bg-primary/8 text-primary text-[0.78rem] font-semibold whitespace-nowrap overflow-hidden text-ellipsis">
                  {distanceLabel} away
                </span>
              )}
              {categoryTags.slice(0, 3).map((cat) => (
                <span
                  key={cat}
                  className="inline-flex items-center max-w-full py-[0.2rem] px-[0.65rem] rounded-full border border-solid border-[rgba(29,36,43,0.08)] bg-[rgba(29,36,43,0.03)] text-muted text-[0.78rem] font-semibold whitespace-nowrap overflow-hidden text-ellipsis"
                >
                  {cat}
                </span>
              ))}
            </div>
          </div>
        </div>

        {blurb && (
          <p className="m-0 text-ink text-[0.92rem] leading-[1.45] line-clamp-2 overflow-hidden">
            {blurb}
          </p>
        )}

        <div className="flex flex-wrap gap-x-[0.85rem] gap-y-[0.35rem] text-[0.86rem] text-ink">
          <span>
            ★ {(p.average_rating ?? 0).toFixed(1)}
            <span className={muted}> ({p.rating_count})</span>
          </span>
          {hours && <span className={muted}>{hours}</span>}
          {isMeaningfulLocationLabel(p.location_label) && (
            <span className={muted}>{p.location_label}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-[0.65rem] pt-[0.15rem]">
          <MapsLink
            latitude={p.latitude}
            longitude={p.longitude}
            maps_url={p.maps_url}
            label="Map"
          />
          <div className="flex flex-wrap items-center justify-end gap-2 ml-auto min-w-0">
            {showChat && (
              <button
                type="button"
                className={`${iconBtn} relative w-[2.35rem] h-[2.35rem] rounded-xl border-primary/18 bg-primary/6 text-primary hover:bg-primary/12 hover:border-primary/35 disabled:opacity-55 disabled:cursor-wait`}
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
                  <span className={`${navBadge} absolute -top-[0.3rem] -right-[0.3rem]`}>
                    {chatUnread > 99 ? "99+" : chatUnread}
                  </span>
                )}
              </button>
            )}
            <Link className={btn} to={providerPublicPath(p)}>
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
