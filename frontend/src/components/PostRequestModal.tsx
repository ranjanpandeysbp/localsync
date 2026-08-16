import { FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CategorySearchBox } from "./CategorySearchBox";
import { FilePicker } from "./Attachments";
import { MapsLink } from "./MapsLink";
import { flattenCategoryOptions } from "./ProviderTrust";
import { api, apiErrorMessage } from "../services/api";
import { useAuth } from "../store/auth";
import { uploadFiles } from "../services/uploads";
import type { PostRequestDraft, PostRequestProvider } from "../utils/postRequestDraft";
import {
  clearPostRequestDraft,
  normalizeDraftProviders,
  providersShareTopLevelCategory,
  resolveDraftCategoryId,
  SAME_CATEGORY_REQUEST_MESSAGE,
} from "../utils/postRequestDraft";
import type { CategoryTree, ProviderCatalogItem, PublicSearchResult, ServiceRequest, User } from "../types";

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
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  onCloseRef.current = onClose;

  const categoryOptions = flattenCategoryOptions(tree);
  const hasCoords =
    (form.latitude && form.longitude) ||
    (user?.latitude != null && user?.longitude != null);
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
      setFiles([]);
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

      const uploaded = await uploadFiles(files);
      const { data } = await api.post<ServiceRequest>("/requests", {
        category_id: Number(form.category_id),
        title: form.title,
        description: form.description,
        longitude: lon,
        latitude: lat,
        pincode: user?.pincode || null,
        search_radius_km: Number(form.search_radius_km) || 5,
        attachment_ids: uploaded.map((a) => a.id),
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

  return (
    <div
      className="login-modal-backdrop post-request-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="login-modal post-request-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <button type="button" className="login-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <p className="eyebrow">Requests</p>
        <h2 id={titleId} className="login-modal-title">
          Send a request
        </h2>
        <p className="muted login-modal-lead">
          Choose a category, add providers by name, and describe what you need.
        </p>

        <form className="post-request-form" onSubmit={onSubmit}>
          <div className="post-request-modal-scroll">
          <section className="post-request-step">
            <h3>1. Category</h3>
            <div className="field">
              <label>Find a category</label>
              <CategorySearchBox
                options={categoryOptions}
                value={form.category_id}
                onChange={(id) => setForm({ ...form, category_id: id })}
                placeholder="e.g. Plumbing, Cleaning, Electrician…"
                required
              />
            </div>
            {form.category_id && (
              <p className="post-request-category-pill">
                Category{" "}
                <strong>
                  {categoryOptions.find((c) => String(c.id) === form.category_id)?.label ||
                    "selected"}
                </strong>
              </p>
            )}
          </section>

          <section className="post-request-step">
            <h3>2. Providers</h3>
            <p className="muted post-request-hint">
              Add or remove providers by business or owner name. Type to search, then pick a match.
            </p>
            <div className="field">
              <label htmlFor="provider-name-box">Providers</label>
              <div className="provider-name-box" ref={suggestRef}>
                <div className="provider-name-chips">
                  {providers.map((p) => (
                    <span key={p.id} className="provider-name-chip">
                      {p.name}
                      <button
                        type="button"
                        aria-label={`Remove ${p.name}`}
                        onClick={() => removeProvider(p.id)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    id="provider-name-box"
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
                  <ul className="provider-name-suggestions" role="listbox">
                    {suggestBusy && <li className="muted">Searching…</li>}
                    {!suggestBusy && suggestions.length === 0 && (
                      <li className="muted">No providers match “{providerQuery.trim()}”</li>
                    )}
                    {suggestions.map((p) => (
                      <li key={p.user_id}>
                        <button
                          type="button"
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
                          {p.full_name && <span className="muted"> · {p.full_name}</span>}
                          {p.category_name && (
                            <span className="muted"> · {p.category_name}</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="muted" style={{ margin: "0.4rem 0 0", fontSize: "0.85rem" }}>
                {providers.length === 0
                  ? "No providers added yet."
                  : `${providers.length} provider${providers.length === 1 ? "" : "s"} will receive this request.`}
              </p>
            </div>
          </section>

          <section className="post-request-step">
            <h3>3. Your request</h3>
            <div className="field">
              <label>Title</label>
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Leaking kitchen sink"
              />
            </div>
            <div className="field">
              <label>Details</label>
              <textarea
                required
                rows={4}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Describe the work, timing, and anything providers should know…"
              />
            </div>
            <FilePicker files={files} onChange={setFiles} disabled={busy} />
          </section>

          <section className="post-request-step post-request-location">
            <h3>4. Location</h3>
            <div className="post-request-location-card">
              {hasCoords ? (
                <>
                  <p>
                    Using your profile location
                    {user?.location_label ? `: ${user.location_label}` : ""}.
                  </p>
                  <MapsLink
                    latitude={Number(form.latitude || user?.latitude)}
                    longitude={Number(form.longitude || user?.longitude)}
                  />
                </>
              ) : user?.pincode ? (
                <p>
                  Your pincode <strong>{user.pincode}</strong> is on file.
                </p>
              ) : (
                <p className="muted">
                  Add GPS or a pincode in{" "}
                  <Link to="/profile" onClick={onClose}>
                    My profile
                  </Link>
                  .
                </p>
              )}
            </div>
          </section>

          {error && <p className="error">{error}</p>}
          </div>

          <div className="page-actions post-request-actions">
            <button className="btn secondary" type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              className="btn"
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
