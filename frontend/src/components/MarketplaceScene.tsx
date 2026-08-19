type MarketplaceSceneProps = {
  className?: string;
  /** Unique prefix so gradient IDs stay unique if multiple scenes mount. */
  idPrefix?: string;
};

/** High-aesthetic local-marketplace/craft bazaar illustration shared by login + landing. */
export function MarketplaceScene({
  className = "marketplace-scene",
  idPrefix = "mkt",
}: MarketplaceSceneProps) {
  const skyGrad = `${idPrefix}-sky`;
  const glowGrad = `${idPrefix}-glow`;
  const clay1Grad = `${idPrefix}-clay1`;
  const clay2Grad = `${idPrefix}-clay2`;
  const basketGrad = `${idPrefix}-basket`;

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
        {/* Deep teal to dark green gradient for sky/ambient */}
        <linearGradient id={skyGrad} x1="80" y1="40" x2="560" y2="680" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1A6B5F" />
          <stop offset="0.55" stopColor="#0F4C43" />
          <stop offset="1" stopColor="#0A3A34" />
        </linearGradient>
        {/* Warm golden light glow */}
        <radialGradient id={glowGrad} cx="320" cy="180" r="280" fx="320" fy="180" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EAA11D" stopOpacity="0.45" />
          <stop offset="1" stopColor="#EAA11D" stopOpacity="0" />
        </radialGradient>
        {/* Terracotta Clay Gradients */}
        <linearGradient id={clay1Grad} x1="105" y1="558" x2="175" y2="622" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E57373" />
          <stop offset="0.4" stopColor="#D84315" />
          <stop offset="1" stopColor="#5D4037" />
        </linearGradient>
        <linearGradient id={clay2Grad} x1="180" y1="490" x2="245" y2="595" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF8A65" />
          <stop offset="0.5" stopColor="#C25A27" />
          <stop offset="1" stopColor="#3E2723" />
        </linearGradient>
        {/* Woven Basket Gradient */}
        <linearGradient id={basketGrad} x1="425" y1="560" x2="535" y2="620" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D7CCC8" />
          <stop offset="0.3" stopColor="#BCAAA4" />
          <stop offset="0.7" stopColor="#8D6E63" />
          <stop offset="1" stopColor="#4E342E" />
        </linearGradient>
      </defs>

      {/* Background & Golden Light */}
      <rect width="640" height="720" fill={`url(#${skyGrad})`} />
      <circle cx="320" cy="180" r="280" fill={`url(#${glowGrad})`} />

      {/* Bokeh lights */}
      <circle cx="280" cy="300" r="15" fill="#EAA11D" opacity="0.15" />
      <circle cx="380" cy="260" r="25" fill="#EAA11D" opacity="0.12" />
      <circle cx="200" cy="220" r="30" fill="#EAA11D" opacity="0.08" />
      <circle cx="480" cy="350" r="20" fill="#EAA11D" opacity="0.1" />

      {/* Wooden Beam (Stall Top structure) */}
      <rect x="20" y="80" width="600" height="15" rx="3" fill="#3E2723" />

      {/* Roof fabrics / textiles hanging down on Left */}
      <g className="left-fabrics">
        {/* Rust Fabric */}
        <path d="M 0,95 C 40,110 50,150 50,280 L 15,280 L 0,95 Z" fill="#C25A27" />
        <path d="M 10,98 C 45,115 50,155 45,280" stroke="#FAF9F5" strokeWidth="1.5" strokeDasharray="6 8" fill="none" opacity="0.7" />
        
        {/* Gold Fabric */}
        <path d="M 50,95 C 90,115 100,160 100,320 L 60,320 L 50,95 Z" fill="#EAA11D" fillOpacity="0.9" />
        <path d="M 60,98 C 95,118 100,165 92,320" stroke="#FAF9F5" strokeWidth="1.5" strokeDasharray="6 8" fill="none" opacity="0.7" />
        
        {/* Teal Fabric */}
        <path d="M 100,95 C 130,110 140,140 140,240 L 110,240 L 100,95 Z" fill="#0A3A34" />
      </g>

      {/* Roof fabrics / textiles hanging down on Right */}
      <g className="right-fabrics">
        {/* Rust Fabric */}
        <path d="M 640,95 C 600,110 590,150 590,280 L 625,280 L 640,95 Z" fill="#C25A27" />
        <path d="M 630,98 C 595,115 590,155 595,280" stroke="#FAF9F5" strokeWidth="1.5" strokeDasharray="6 8" fill="none" opacity="0.7" />
        
        {/* Gold Fabric */}
        <path d="M 590,95 C 550,115 540,160 540,320 L 580,320 L 590,95 Z" fill="#EAA11D" fillOpacity="0.9" />
        <path d="M 580,98 C 545,118 540,165 548,320" stroke="#FAF9F5" strokeWidth="1.5" strokeDasharray="6 8" fill="none" opacity="0.7" />
        
        {/* Teal Fabric */}
        <path d="M 540,95 C 510,110 500,140 500,240 L 530,240 L 540,95 Z" fill="#0A3A34" />
      </g>

      {/* Wooden supporting pillars */}
      <rect x="50" y="90" width="12" height="560" fill="#4E342E" />
      <rect x="578" y="90" width="12" height="560" fill="#4E342E" />

      {/* Lower Stall / Floor Platform */}
      <path d="M 0,580 Q 320,550 640,580 L 640,720 L 0,720 Z" fill="#122521" />
      <path d="M 0,630 L 640,630 L 640,720 L 0,720 Z" fill="#2E1C0C" />
      <line x1="0" y1="630" x2="640" y2="630" stroke="#8D6E63" strokeWidth="3" opacity="0.8" />

      {/* Pottery on the Left side of the table */}
      <g className="pottery-left">
        {/* Taller Vase */}
        <path d="M 185,595 C 180,550 205,530 205,505 C 205,490 225,490 225,505 C 225,530 250,550 245,595 Z" fill={`url(#${clay2Grad})`} />
        <ellipse cx="215" cy="505" rx="10" ry="3" fill="#5D4037" />
        <ellipse cx="215" cy="595" rx="30" ry="12" fill="#4E342E" opacity="0.5" />

        {/* Round Clay Pot */}
        <ellipse cx="140" cy="590" rx="35" ry="32" fill={`url(#${clay1Grad})`} />
        <ellipse cx="140" cy="558" rx="16" ry="5" fill="#8D4F2A" />
        <path d="M 124,558 C 124,550 156,550 156,558 L 150,564 L 130,564 Z" fill="#A75D33" />
        
        {/* Small accent pot */}
        <circle cx="95" cy="610" r="18" fill="#B05B2E" />
        <ellipse cx="95" cy="592" rx="8" ry="2" fill="#8A401A" />
      </g>

      {/* Woven baskets and handicrafts on the Right side of the table */}
      <g className="basketry-right">
        {/* Woven Wicker Basket */}
        <ellipse cx="480" cy="590" rx="55" ry="30" fill={`url(#${basketGrad})`} />
        <ellipse cx="480" cy="570" rx="55" ry="12" fill="#A87532" stroke="#FAF9F5" strokeWidth="0.8" strokeDasharray="3 4" />
        {/* Weave texture lines */}
        <path d="M 430,585 Q 480,615 530,585 M 440,595 Q 480,622 520,595 M 450,605 Q 480,628 510,605" stroke="#5D4037" strokeWidth="1.5" fill="none" opacity="0.8" />
        <path d="M 445,580 L 445,600 M 465,580 L 465,615 M 485,580 L 485,620 M 505,580 L 505,615 M 520,580 L 520,600" stroke="#5D4037" strokeWidth="1.5" fill="none" opacity="0.8" />

        {/* Small orange handicraft pot */}
        <path d="M 550,580 C 540,540 570,520 570,490 C 570,480 585,480 585,490 C 585,520 615,540 605,580 Z" fill="#D46E33" />
        <ellipse cx="577" cy="490" rx="8" ry="2" fill="#A75225" />
      </g>
    </svg>
  );
}
