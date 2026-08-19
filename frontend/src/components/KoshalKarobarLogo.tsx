import { cn } from "../ui";

type Props = {
  className?: string;
  /** Mark width/height in px. Navbar default is 40. */
  markSize?: number;
  /** `dark` = lockup on light backgrounds. `light` = lockup on teal/dark nav. */
  tone?: "dark" | "light";
  wordmark?: boolean;
  showTagline?: boolean;
};

/** KoshalKarobar lockup: K-node mark + wordmark in site teal, cream, and gold. */
export function KoshalKarobarLogo({
  className,
  markSize = 40,
  tone = "dark",
  wordmark = true,
  showTagline,
}: Props) {
  const tagline = showTagline ?? markSize >= 36;
  const onDark = tone === "light";
  
  const rustColor = "#D46E33";
  const primaryColor = onDark ? "#FAF9F5" : "#0F4C43";
  const accentColor = "#EAA11D";
  const lightColor = onDark ? "#0A3A34" : "#FAF9F5";
  const skyColor = onDark ? "#00C2FF" : "#14665a";

  const koshal = onDark ? "text-[#FAF9F5]" : "text-ink";
  const karbar = "text-accent";
  const sub = onDark ? "text-accent" : "text-primary";

  return (
    <span className={cn("inline-flex items-center min-w-0 py-0.5", markSize <= 32 ? "gap-2" : "gap-3", className)} aria-label="KoshalKarobar">
      <svg
        width={markSize}
        height={markSize}
        viewBox="0 0 500 500"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <defs>
          <linearGradient id="sunGrad" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#E58A1F" />
            <stop offset="60%" stopColor="#F5A623" />
            <stop offset="100%" stopColor="#FFD166" />
          </linearGradient>

          <linearGradient id="mapGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3D5A6C" />
            <stop offset="50%" stopColor="#283E4A" />
            <stop offset="100%" stopColor="#1B2A32" />
          </linearGradient>

          <linearGradient id="arrowGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0E8A74" />
            <stop offset="50%" stopColor="#14B89A" />
            <stop offset="100%" stopColor="#2AE8C4" />
          </linearGradient>

          <filter id="subtleShadow" x="-15%" y="-15%" width="130%" height="130%">
            <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#1B2A32" floodOpacity="0.22" />
          </filter>
        </defs>

        <g id="KoshalKarobarIcon" filter="url(#subtleShadow)">
          <g id="Sun">
            <g stroke="url(#sunGrad)" strokeWidth="8" strokeLinecap="round">
              <line x1="250" y1="155" x2="250" y2="90" />
              <line x1="288" y1="165" x2="330" y2="110" />
              <line x1="320" y1="190" x2="385" y2="155" />
              <line x1="212" y1="165" x2="170" y2="110" />
              <line x1="180" y1="190" x2="115" y2="155" />
              <line x1="155" y1="228" x2="90" y2="225" />
            </g>
            <path d="M 160,240 A 90,90 0 0,1 340,240 Z" fill="url(#sunGrad)" />
          </g>

          <g id="RegionalLandmass">
            <path d="M 125,410 C 135,395 140,375 148,355 C 155,340 168,330 178,310 L 205,325 L 245,285 L 310,335 L 355,270 C 362,285 372,305 365,325 C 358,345 342,360 330,375 C 310,398 285,412 255,420 C 220,430 180,432 150,425 Z" fill="url(#mapGrad)" stroke="#FFFFFF" strokeWidth="3" strokeLinejoin="round" />
          </g>

          <g id="GrowthArrow">
            <path d="M 120,380 L 185,305 L 250,350 L 365,190 L 338,188 L 395,150 L 392,220 L 372,205 L 255,372 L 188,325 L 132,390 Z" fill="url(#arrowGrad)" stroke="#FFFFFF" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
          </g>
        </g>
      </svg>
      {wordmark && (
        <span className="kc-word flex flex-col justify-center min-w-0">
          <span
            className={cn(
              "font-display font-extrabold tracking-tight leading-none",
              markSize >= 44 ? "text-2xl" : markSize <= 32 ? "text-[1.05rem]" : "text-[1.35rem]",
              koshal,
            )}
          >
            Koshal<span className={karbar}>Karobar</span>
          </span>
          {tagline && (
            <span
              className={cn(
                "mt-1 text-[8.5px] font-semibold tracking-[-0.01em] leading-none",
                sub,
              )}
            >
              Connecting Homes, Empowering Business
            </span>
          )}
        </span>
      )}
    </span>
  );
}

// Alias for backwards compatibility
export { KoshalKarobarLogo as KoshalCityLogo };
