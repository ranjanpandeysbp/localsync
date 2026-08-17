import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, apiErrorMessage } from "../services/api";
import type { ServiceRequest } from "../types";
import type { BroadcastRequestDraft } from "../utils/broadcastDraft";
import { clearBroadcastDraft } from "../utils/broadcastDraft";
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

type Props = {
  open: boolean;
  onClose: () => void;
  draft: BroadcastRequestDraft | null;
  nearbyCount?: number | null;
  onSuccess?: () => void;
};

export function BroadcastRequestModal({
  open,
  onClose,
  draft,
  nearbyCount,
  onSuccess,
}: Props) {
  const navigate = useNavigate();
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  onCloseRef.current = onClose;

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
      setTitle("");
      setDescription("");
      setError("");
      setBusy(false);
      return;
    }
    clearBroadcastDraft();
  }, [open]);

  if (!open || !draft) return null;

  const place = draft.areaName
    ? `${draft.areaName}, ${draft.city}`
    : draft.pincode
      ? `pincode ${draft.pincode} in ${draft.city}`
      : draft.city;
  const countLabel =
    nearbyCount != null
      ? nearbyCount === 1
        ? "1 nearby verified provider"
        : `${nearbyCount} nearby verified providers`
      : "nearby verified providers";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setError("");
    const nextTitle = title.trim();
    const nextDetails = description.trim();
    if (nextTitle.length < 3) {
      setError("Add a short title (at least 3 characters).");
      return;
    }
    if (nextDetails.length < 5) {
      setError("Add a few details so providers know what you need.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post<ServiceRequest>("/requests", {
        category_id: draft.categoryId,
        title: nextTitle,
        description: nextDetails,
        longitude: draft.longitude,
        latitude: draft.latitude,
        pincode: draft.pincode || null,
        target_provider_ids: [],
      });
      onClose();
      onSuccess?.();
      const matched = data.matched_provider_count ?? nearbyCount ?? 0;
      navigate("/consumer/requests", {
        state: {
          toast: `Request broadcast to ${matched} nearby provider${matched === 1 ? "" : "s"} in ${draft.city}`,
        },
      });
    } catch (err) {
      setError(apiErrorMessage(err, "Could not broadcast this request"));
    } finally {
      setBusy(false);
    }
  }

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
        <p className={eyebrow}>Broadcast</p>
        <h2 id={titleId} className={loginModalTitle}>
          Ask nearby
        </h2>
        <p className={`${muted} m-0 mb-[1.1rem]`}>
          This will notify {countLabel} for{" "}
          <strong>{draft.categoryLabel || "this category"}</strong> near {place}.
        </p>

        <form className="flex flex-col flex-1 min-h-0 mt-[0.35rem] gap-5" onSubmit={onSubmit}>
          <div className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain">
            <div className={field}>
              <label className={fieldLabel} htmlFor="broadcast-title">
                Title
              </label>
              <input
                className={fieldInput}
                id="broadcast-title"
                required
                minLength={3}
                maxLength={255}
                value={title}
                autoFocus
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Leaking kitchen tap"
              />
            </div>
            <div className={field}>
              <label className={fieldLabel} htmlFor="broadcast-details">
                Details
              </label>
              <textarea
                className={fieldTextarea}
                id="broadcast-details"
                required
                minLength={5}
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What do you need, when, and any extra notes…"
              />
            </div>
            {error && (
              <p className={errorText} role="alert">
                {error}
              </p>
            )}
          </div>
          <div
            className={`${pageActions} shrink-0 justify-end m-0 pt-[0.85rem] pb-[calc(0.35rem+env(safe-area-inset-bottom,0px))] bg-[linear-gradient(180deg,rgba(250,249,245,0.72),rgba(250,249,245,0.96)_28%)] border-t border-solid border-[rgba(29,36,43,0.08)]`}
          >
            <button className={btnSecondary} type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className={btn} type="submit" disabled={busy}>
              {busy ? "Sending…" : "Broadcast request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
