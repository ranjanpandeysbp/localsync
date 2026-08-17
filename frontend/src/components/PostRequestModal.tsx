import { FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CategorySearchBox } from "./CategorySearchBox";
import { flattenCategoryOptions } from "./ProviderTrust";
import { api, apiErrorMessage } from "../services/api";
import { useAuth } from "../store/auth";
import type { PostRequestDraft, PostRequestProvider } from "../utils/postRequestDraft";
import {
  clearPostRequestDraft,
  normalizeDraftProviders,
  providersShareTopLevelCategory,
  resolveDraftCategoryId,
  SAME_CATEGORY_REQUEST_MESSAGE,
} from "../utils/postRequestDraft";
import type { CategoryTree, ProviderCatalogItem, PublicSearchResult, ServiceRequest, User } from "../types";
import {
  btn,
  btnSecondary,
  errorText,
  eyebrow,
  field,
  fieldInput,
  fieldLabel,
  fieldTextarea,
  loginModal,
  loginModalBackdrop,
  loginModalClose,
  loginModalTitle,
  muted,
  pageActions,
} from "../ui";

type FormState = {
  category_id: string;
  title: string;
  description: string;
  longitude: string;
  latitude: string;
  search_radius_km: string;
};

const EMPTY_FORM: FormState = {
  category_id: "",
  title: "",
  description: "",
  longitude: "",
  latitude: "",
  search_radius_km: "5",
};

function formFromUser(user: User | null | undefined, draft?: PostRequestDraft | null): FormState {
  const categoryId = draft?.categoryId ?? draft?.providers?.find((p) => p.categoryId != null)?.categoryId;
  return {
    ...EMPTY_FORM,
    category_id: categoryId != null ? String(categoryId) : "",
    latitude: user?.latitude != null ? String(user.latitude) : "",
    longitude: user?.longitude != null ? String(user.longitude) : "",
  };
}

type Props = {
  open: boolean;
  onClose: () => void;
  draft?: PostRequestDraft | null;
  onSuccess?: () => void;
};

export function PostRequestModal({ open, onClose, draft = null, onSuccess }: Props) {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  const suggestRef = useRef<HTMLDivElement | null>(null);
  const [tree, setTree] = useState<CategoryTree[]>([]);
  const [form, setForm] = useState<FormState>(() => formFromUser(user, draft));
  const [providers, setProviders] = useState<PostRequestProvider[]>(() =>
    draft ? normalizeDraftProviders(draft) : [],
  );
  const [providerQuery, setProviderQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ProviderCatalogItem[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  onCloseRef.current = onClose;

  const categoryOptions = flattenCategoryOptions(tree);
  const selectedIds = useMemo(() => new Set(providers.map((p) => p.id)), [providers]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setError("");
      setBusy(false);
      setProviderQuery("");
      setSuggestions([]);
      setSuggestOpen(false);
      return;
    }
    setForm(formFromUser(user, draft));
    setProviders(draft ? normalizeDraftProviders(draft) : []);
    clearPostRequestDraft();
    void api
      .get<CategoryTree[]>("/categories/tree")
      .then((res) => setTree(res.data))
      .catch(() => setTree([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft]);

  useEffect(() => {
    if (!open || tree.length === 0) return;
    const resolved = resolveDraftCategoryId(draft, tree);
    if (resolved == null) return;
    setForm((current) =>
      current.category_id === String(resolved)
        ? current
        : { ...current, category_id: String(resolved) },
    );
  }, [open, tree, draft]);

  useEffect(() => {
    if (!open) return;
    const q = providerQuery.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSuggestBusy(false);
      return;
    }
    let cancelled = false;
    setSuggestBusy(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const params: Record<string, string | number> = { q };
          if (user?.latitude != null && user?.longitude != null) {
            params.latitude = user.latitude;
            params.longitude = user.longitude;
          }
          if (user?.pincode) params.pincode = user.pincode;
          const { data } = await api.get<PublicSearchResult>("/providers/public-search", {
            params,
          });
          if (cancelled) return;
          setSuggestions(data.providers.filter((p) => !selectedIds.has(p.user_id)).slice(0, 8));
          setSuggestOpen(true);
        } catch {
          if (!cancelled) setSuggestions([]);
        } finally {
          if (!cancelled) setSuggestBusy(false);
        }
      })();
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [providerQuery, open, selectedIds, user?.latitude, user?.longitude, user?.pincode]);

  useEffect(() => {
    if (!suggestOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!suggestRef.current?.contains(e.target as Node)) setSuggestOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [suggestOpen]);

  if (!open) return null;

  function addProvider(item: PostRequestProvider) {
    if (providers.some((p) => p.id === item.id)) {
      setProviderQuery("");
      setSuggestions([]);
      setSuggestOpen(false);
      return;
    }
    const next = [...providers, item];
    if (!providersShareTopLevelCategory(tree, next)) {
      setError(SAME_CATEGORY_REQUEST_MESSAGE);
      setProviderQuery("");
      setSuggestions([]);
      setSuggestOpen(false);
      return;
    }
    setProviders(next);
    setProviderQuery("");
    setSuggestions([]);
    setSuggestOpen(false);
    setError("");
  }

  function removeProvider(id: string) {
    setProviders((prev) => prev.filter((p) => p.id !== id));
  }

  function tryAddFromQuery() {
    const q = providerQuery.trim().toLowerCase();
    if (!q) return;
    const exact =
      suggestions.find(
        (p) =>
          p.business_name.toLowerCase() === q ||
          p.full_name.toLowerCase() === q ||
          `${p.business_name} (${p.full_name})`.toLowerCase() === q,
      ) ||
      suggestions.find(
        (p) =>
          p.business_name.toLowerCase().includes(q) || p.full_name.toLowerCase().includes(q),
      );
    if (exact) {
      addProvider({
        id: exact.user_id,
        name: exact.business_name || exact.full_name,
        categoryId: exact.category_id,
      });
      return;
    }
    setError("No matching provider found. Pick a name from the suggestions.");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (!form.category_id) {
        setError("Pick a category first");
        setBusy(false);
        return;
      }
      if (providers.length === 0) {
        setError("Add at least one provider by name");
        setBusy(false);
        return;
      }
      const lat = form.latitude ? Number(form.latitude) : user?.latitude ?? null;
      const lon = form.longitude ? Number(form.longitude) : user?.longitude ?? null;
      if (lat == null && lon == null && !user?.pincode) {
        setError("Add a location or pincode in My profile before sending");
        setBusy(false);
        return;
      }

      const { data } = await api.post<ServiceRequest>("/requests", {
        category_id: Number(form.category_id),
        title: form.title,
        description: form.description,
        longitude: lon,
        latitude: lat,
        pincode: user?.pincode || null,
        search_radius_km: Number(form.search_radius_km) || 5,
        target_provider_ids: providers.map((p) => p.id),
      });

      onClose();
      onSuccess?.();
      navigate("/consumer/requests", {
        state: {
          toast: `Request sent to ${data.matched_provider_count ?? providers.length} provider(s)`,
        },
      });
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to create request"));
    } finally {
      setBusy(false);
    }
  }

  const step = "grid gap-3 pb-[1.1rem] border-b border-solid border-line last:border-b-0 last:pb-0";

  return (
    <div
      className={`${loginModalBackdrop} items-start p-5 overflow-auto overscroll-contain`}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`${loginModal} flex flex-col w-[min(640px,100%)] max-h-[min(92dvh,920px)] overflow-hidden my-6 text-left`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <button type="button" className={loginModalClose} onClick={onClose} aria-label="Close">
          ×
        </button>
        <p className={eyebrow}>Requests</p>
        <h2 id={titleId} className={loginModalTitle}>
          Send a request
        </h2>
        <p className={`${muted} m-0 mb-[1.1rem]`}>
          Choose a category, add providers by name, and describe what you need.
        </p>

        <form className="flex flex-col flex-1 min-h-0 mt-[0.35rem] gap-5" onSubmit={onSubmit}>
          <div className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain">
          <section className={step}>
            <h3 className="m-0 text-[1.05rem] text-brand-dark">1. Category</h3>
            <div className={field}>
              <label className={fieldLabel}>Find a category</label>
              <CategorySearchBox
                options={categoryOptions}
                value={form.category_id}
                onChange={(id) => setForm({ ...form, category_id: id })}
                placeholder="e.g. Plumbing, Cleaning, Electrician…"
                required
              />
            </div>
            {form.category_id && (
              <p className="m-0 py-[0.65rem] px-[0.85rem] rounded-xl bg-primary/8 text-brand-dark text-[0.92rem]">
                Category{" "}
                <strong>
                  {categoryOptions.find((c) => String(c.id) === form.category_id)?.label ||
                    "selected"}
                </strong>
              </p>
            )}
          </section>

          <section className={step}>
            <h3 className="m-0 text-[1.05rem] text-brand-dark">2. Providers</h3>
            <p className={`${muted} m-0 text-[0.9rem]`}>
              Add or remove providers by business or owner name. Type to search, then pick a match.
            </p>
            <div className={field}>
              <label className={fieldLabel} htmlFor="provider-name-box">
                Providers
              </label>
              <div
                className="relative border border-solid border-line rounded-xl bg-card py-[0.45rem] px-[0.55rem] transition-[border-color,box-shadow] focus-within:border-brand focus-within:shadow-[0_0_0_3px_rgba(15,76,67,0.12)]"
                ref={suggestRef}
              >
                <div className="flex flex-wrap gap-[0.4rem] items-center">
                  {providers.map((p) => (
                    <span
                      key={p.id}
                      className="inline-flex items-center gap-[0.3rem] max-w-full py-[0.3rem] pr-[0.35rem] pl-[0.65rem] rounded-full bg-primary/10 text-brand-dark text-[0.88rem] font-semibold"
                    >
                      {p.name}
                      <button
                        type="button"
                        className="w-[1.35rem] h-[1.35rem] border-0 rounded-full bg-transparent text-muted text-base leading-none cursor-pointer hover:bg-[rgba(15,23,42,0.08)] hover:text-ink"
                        aria-label={`Remove ${p.name}`}
                        onClick={() => removeProvider(p.id)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    id="provider-name-box"
                    className="flex-1 min-w-32 border-0 bg-transparent py-[0.45rem] px-1 font-inherit focus:outline-none"
                    type="text"
                    value={providerQuery}
                    placeholder={
                      providers.length === 0 ? "Type a provider name…" : "Add another…"
                    }
                    autoComplete="off"
                    onChange={(e) => {
                      setProviderQuery(e.target.value);
                      setSuggestOpen(true);
                      setError("");
                    }}
                    onFocus={() => {
                      if (providerQuery.trim().length >= 2) setSuggestOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        tryAddFromQuery();
                      } else if (e.key === "Backspace" && !providerQuery && providers.length) {
                        removeProvider(providers[providers.length - 1].id);
                      }
                    }}
                  />
                </div>
                {suggestOpen && (suggestions.length > 0 || suggestBusy || providerQuery.trim().length >= 2) && (
                  <ul
                    className="absolute z-30 left-0 right-0 top-[calc(100%+0.35rem)] m-0 p-[0.35rem] list-none max-h-[220px] overflow-auto rounded-[14px] border border-solid border-[rgba(29,36,43,0.1)] bg-card shadow-[0_16px_36px_rgba(12,18,28,0.16)]"
                    role="listbox"
                  >
                    {suggestBusy && <li className={`${muted} py-2 px-3`}>Searching…</li>}
                    {!suggestBusy && suggestions.length === 0 && (
                      <li className={`${muted} py-2 px-3`}>No providers match “{providerQuery.trim()}”</li>
                    )}
                    {suggestions.map((p) => (
                      <li key={p.user_id}>
                        <button
                          type="button"
                          className="block w-full border-0 rounded-[10px] bg-transparent py-2 px-3 font-inherit text-left cursor-pointer hover:bg-primary/8"
                          role="option"
                          onClick={() =>
                            addProvider({
                              id: p.user_id,
                              name: p.business_name || p.full_name,
                              categoryId: p.category_id,
                            })
                          }
                        >
                          <strong>{p.business_name}</strong>
                          {p.full_name && <span className={muted}> · {p.full_name}</span>}
                          {p.category_name && (
                            <span className={muted}> · {p.category_name}</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className={`${muted} mt-[0.4rem] mb-0 text-[0.85rem]`}>
                {providers.length === 0
                  ? "No providers added yet."
                  : `${providers.length} provider${providers.length === 1 ? "" : "s"} will receive this request.`}
              </p>
            </div>
          </section>

          <section className={step}>
            <h3 className="m-0 text-[1.05rem] text-brand-dark">3. Your request</h3>
            <div className={field}>
              <label className={fieldLabel}>Title</label>
              <input
                className={fieldInput}
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Leaking kitchen sink"
              />
            </div>
            <div className={field}>
              <label className={fieldLabel}>Details</label>
              <textarea
                className={fieldTextarea}
                required
                rows={4}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Describe the work, timing, and anything providers should know…"
              />
            </div>
          </section>

          {error && <p className={errorText}>{error}</p>}
          </div>

          <div
            className={`${pageActions} shrink-0 justify-end m-0 pt-[0.85rem] pb-[calc(0.35rem+env(safe-area-inset-bottom,0px))] bg-[linear-gradient(180deg,rgba(250,249,245,0.72),rgba(250,249,245,0.96)_28%)] border-t border-solid border-[rgba(29,36,43,0.08)]`}
          >
            <button className={btnSecondary} type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              className={btn}
              type="submit"
              disabled={busy || !form.category_id || providers.length === 0}
            >
              {busy ? "Sending…" : "Send to providers"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
