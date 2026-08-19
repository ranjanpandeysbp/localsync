import type { CategoryTree, OfferKind, ProviderTrustInfo } from "../types";
import { isMeaningfulLocationLabel } from "../services/geo";
import { cn } from "../ui";

export function isApprovedProvider(status?: string | null): boolean {
  return status === "APPROVED";
}

function ShieldCheckIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.15 19.1 6.2v5.55c0 4.42-3 8.32-7.1 9.4-4.1-1.08-7.1-4.98-7.1-9.4V6.2L12 3.15Z"
        fill="#eaa11d"
        fillOpacity="0.22"
        stroke="#eaa11d"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M8.85 12.05 11.15 14.4 15.35 9.75"
        stroke="#0f4c43"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Compact trust badge for verified vendors. Renders nothing unless APPROVED. */
export function VerifiedLocalPartnerBadge({
  verificationStatus,
  size = "sm",
  className,
}: {
  verificationStatus?: string | null;
  size?: "sm" | "md";
  className?: string;
}) {
  if (!isApprovedProvider(verificationStatus)) return null;
  const md = size === "md";
  return (
    <span
      className={cn(
        "inline-flex items-center max-w-full rounded-full border border-solid border-accent/50",
        "bg-[linear-gradient(180deg,rgba(234,161,29,0.2),rgba(15,76,67,0.08))] text-primary font-semibold tracking-[-0.01em] whitespace-nowrap",
        md
          ? "gap-[0.35rem] py-[0.28rem] px-[0.7rem] text-[0.8rem]"
          : "gap-[0.28rem] py-[0.15rem] px-[0.55rem] text-[0.72rem]",
        className,
      )}
      title="KoshalKarobar verified this local vendor"
    >
      <ShieldCheckIcon size={md ? 14 : 12} />
      Verified Local Partner
    </span>

  );
}

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
      opts.push({
        id: s.id,
        label: s.description
          ? `${p.name} › ${s.name} — ${s.description}`
          : `${p.name} › ${s.name}`,
      });
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
        <VerifiedLocalPartnerBadge
          verificationStatus={trust.verification_status}
          className="ml-2 align-middle"
        />
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
