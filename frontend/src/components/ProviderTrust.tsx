import type { CategoryTree, OfferKind, ProviderTrustInfo } from "../types";
import { isMeaningfulLocationLabel } from "../services/geo";

export function offerKindLabel(kind?: OfferKind | null): string {
  if (kind === "PRODUCT") return "Products";
  if (kind === "SERVICE") return "Services";
  if (kind === "BOTH") return "Products & services";
  return "—";
}

export function offerKindClass(kind?: OfferKind | null): string {
  if (kind === "PRODUCT") return "kind-product";
  if (kind === "SERVICE") return "kind-service";
  if (kind === "BOTH") return "kind-both";
  return "";
}

/** Flatten category tree into select options (parents + subcategories). */
export function flattenCategoryOptions(tree: CategoryTree[]): { id: number; label: string }[] {
  const opts: { id: number; label: string }[] = [];
  for (const p of tree) {
    opts.push({ id: p.id, label: p.name });
    for (const s of p.subcategories || []) {
      opts.push({ id: s.id, label: `${p.name} › ${s.name}` });
    }
  }
  return opts;
}

export function ProviderTrustBlock({
  trust,
  compact = false,
}: {
  trust?: ProviderTrustInfo | null;
  compact?: boolean;
}) {
  if (!trust) return null;
  const hours =
    trust.opening_time && trust.closing_time
      ? `${trust.opening_time} – ${trust.closing_time}`
      : null;

  return (
    <div className={`trust-block ${compact ? "compact" : ""}`}>
      <div className="trust-title">
        <strong>{trust.business_name}</strong>
        {trust.verification_status === "APPROVED" && (
          <span className="pill online" style={{ marginLeft: "0.5rem" }}>
            Verified
          </span>
        )}
      </div>
      <p className="muted" style={{ margin: "0.25rem 0" }}>
        {offerKindLabel(trust.offer_kind)}
        {trust.categories?.length ? ` · ${trust.categories.join(", ")}` : ""}
      </p>
      {!compact && trust.offerings_detail && <p style={{ margin: "0.35rem 0" }}>{trust.offerings_detail}</p>}
      {!compact && trust.description && !trust.offerings_detail && (
        <p className="muted">{trust.description}</p>
      )}
      <p className="muted" style={{ fontSize: "0.85rem", margin: "0.25rem 0" }}>
        Rating {trust.average_rating.toFixed(1)} ({trust.rating_count})
        {hours ? ` · Hours ${hours}` : ""}
        {trust.gst_number ? ` · GST ${trust.gst_number}` : ""}
      </p>
      {isMeaningfulLocationLabel(trust.location_label) && (
        <p className="muted" style={{ fontSize: "0.8rem", margin: 0 }}>
          {trust.location_label}
        </p>
      )}
    </div>
  );
}
