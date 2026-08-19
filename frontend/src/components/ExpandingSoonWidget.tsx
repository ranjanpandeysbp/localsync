import { SERVICE_CITIES, type ServiceCity } from "../utils/serviceCities";
import { btn, btnSecondary, cn } from "../ui";

type ExpandingSoonWidgetProps = {
  placeLabel?: string;
  compact?: boolean;
  onAskNearby?: () => void;
  askNearbyLabel?: string;
  onPickCity?: (city: ServiceCity) => void;
  className?: string;
};

export function ExpandingSoonWidget({
  placeLabel,
  compact = false,
  onAskNearby,
  askNearbyLabel = "Ask nearby providers",
  onPickCity,
  className,
}: ExpandingSoonWidgetProps) {
  if (compact) {
    return (
      <div className={cn("px-3 py-2.5 text-left", className)}>
        <p className="m-0 text-[0.92rem] font-semibold text-ink">We're expanding here soon!</p>
        <p className="mt-1 mb-0 text-[0.8rem] leading-snug text-muted">
          KoshalKarobar currently serves {SERVICE_CITIES.map((c: ServiceCity) => c.name).join(", ")}.
        </p>

      </div>
    );
  }


  return (
    <div
      className={cn(
        "rounded-3xl border border-primary/15 bg-white px-5 py-8 text-center shadow-[0_18px_40px_rgba(15,76,67,0.08)] sm:px-8 sm:py-10",
        className,
      )}
    >
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/15 text-2xl" aria-hidden>
        📍
      </div>
      <p className="m-0 text-[0.72rem] font-bold uppercase tracking-[0.16em] text-gold">Coming soon</p>
      <h2 className="mt-2 mb-0 font-display text-[1.55rem] font-extrabold tracking-tight text-ink sm:text-[1.85rem]">
        We're expanding here soon!
      </h2>
      <p className="mx-auto mt-3 mb-0 max-w-lg text-[0.98rem] leading-relaxed text-muted">
        {placeLabel ? (
          <>
            Coverage in <strong className="font-semibold text-ink">{placeLabel}</strong> is still
            limited. We're onboarding more neighbourhood shops and services nearby.
          </>
        ) : (
          <>
            This spot isn't fully covered yet. We're onboarding more neighbourhood shops and
            services nearby.
          </>
        )}
      </p>
      <p className="mt-4 mb-3 text-[0.82rem] font-semibold uppercase tracking-[0.08em] text-muted">
        Browse a city we serve today
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {SERVICE_CITIES.map((city: ServiceCity) => (
          <button
            key={city.name}
            type="button"
            className={cn(btnSecondary, "rounded-full px-4 py-2 text-[0.88rem]")}
            onClick={() => onPickCity?.(city)}
          >
            {city.name}
          </button>
        ))}
      </div>

      {onAskNearby ? (
        <button type="button" className={cn(btn, "mt-6")} onClick={onAskNearby}>
          {askNearbyLabel}
        </button>
      ) : null}
    </div>
  );
}
