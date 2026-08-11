type MarketplaceSceneProps = {
  className?: string;
  /** Unique prefix so gradient IDs stay unique if multiple scenes mount. */
  idPrefix?: string;
};

/** Animated local-marketplace illustration shared by login + landing. */
export function MarketplaceScene({
  className = "marketplace-scene",
  idPrefix = "mkt",
}: MarketplaceSceneProps) {
  const sky = `${idPrefix}-sky`;
  const glow = `${idPrefix}-glow`;

  return (
    <svg
      className={className}
      viewBox="0 0 640 720"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={sky} x1="80" y1="40" x2="560" y2="680" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1A6B5F" />
          <stop offset="0.55" stopColor="#0F4C43" />
          <stop offset="1" stopColor="#0A3A34" />
        </linearGradient>
        <linearGradient id={glow} x1="320" y1="120" x2="320" y2="520" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EAA11D" stopOpacity="0.45" />
          <stop offset="1" stopColor="#EAA11D" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="640" height="720" fill={`url(#${sky})`} />
      <circle cx="470" cy="140" r="90" fill={`url(#${glow})`} />
      <circle cx="120" cy="520" r="140" fill="#EAA11D" fillOpacity="0.08" />

      <path
        d="M0 520C90 470 170 490 250 520C360 565 430 545 520 500C580 470 620 475 640 485V720H0V520Z"
        fill="#0A3A34"
        fillOpacity="0.55"
      />
      <path
        d="M0 560C110 520 190 545 280 575C390 615 470 590 560 545C600 525 625 525 640 530V720H0V560Z"
        fill="#FAF9F5"
        fillOpacity="0.08"
      />

      <g className="marketplace-scene-shop">
        <rect x="168" y="268" width="198" height="168" rx="18" fill="#FAF9F5" />
        <rect x="168" y="268" width="198" height="42" rx="18" fill="#EAA11D" />
        <rect x="168" y="292" width="198" height="18" fill="#EAA11D" />
        <text
          x="267"
          y="296"
          textAnchor="middle"
          fill="#1D242B"
          fontSize="18"
          fontWeight="700"
          fontFamily="Sora, sans-serif"
        >
          Local shop
        </text>
        <rect x="196" y="332" width="58" height="58" rx="10" fill="#0F4C43" fillOpacity="0.12" />
        <rect x="274" y="332" width="58" height="58" rx="10" fill="#0F4C43" fillOpacity="0.12" />
        <rect x="232" y="408" width="70" height="28" rx="8" fill="#0F4C43" />
      </g>

      <g className="marketplace-scene-pin">
        <path
          d="M430 250c0-36 28-65 64-65s64 29 64 65c0 48-64 110-64 110S430 298 430 250Z"
          fill="#EAA11D"
        />
        <circle cx="494" cy="248" r="22" fill="#FAF9F5" />
        <circle cx="494" cy="248" r="10" fill="#0F4C43" />
      </g>

      <path
        className="marketplace-scene-path"
        d="M250 436C290 470 340 500 390 470C430 445 455 430 494 360"
        stroke="#FAF9F5"
        strokeOpacity="0.55"
        strokeWidth="4"
        strokeDasharray="10 12"
        strokeLinecap="round"
      />

      <g className="marketplace-scene-people">
        <circle cx="214" cy="470" r="16" fill="#FAF9F5" />
        <rect x="198" y="490" width="32" height="38" rx="14" fill="#FAF9F5" />
        <circle cx="268" cy="486" r="14" fill="#EAA11D" />
        <rect x="254" y="504" width="28" height="34" rx="12" fill="#EAA11D" />
      </g>

      <g className="marketplace-scene-chip marketplace-scene-chip-a">
        <rect x="72" y="210" width="118" height="40" rx="20" fill="#FAF9F5" fillOpacity="0.92" />
        <circle cx="94" cy="230" r="8" fill="#0F4C43" />
        <rect x="112" y="222" width="58" height="8" rx="4" fill="#0F4C43" fillOpacity="0.35" />
        <rect x="112" y="236" width="40" height="6" rx="3" fill="#0F4C43" fillOpacity="0.2" />
      </g>
      <g className="marketplace-scene-chip marketplace-scene-chip-b">
        <rect x="440" y="420" width="132" height="40" rx="20" fill="#FAF9F5" fillOpacity="0.92" />
        <circle cx="462" cy="440" r="8" fill="#EAA11D" />
        <rect x="480" y="432" width="70" height="8" rx="4" fill="#0F4C43" fillOpacity="0.35" />
        <rect x="480" y="446" width="48" height="6" rx="3" fill="#0F4C43" fillOpacity="0.2" />
      </g>
    </svg>
  );
}
