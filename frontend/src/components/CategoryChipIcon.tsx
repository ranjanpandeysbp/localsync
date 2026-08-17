function iconKey(name: string, slug?: string | null): string {
  return `${name} ${slug || ""}`.toLowerCase();
}

function matchIcon(key: string): string {
  const rules: [string[], string][] = [
    [["plumb", "pipe", "tap", "sanitar"], "plumb"],
    [["electric", "wire", "light"], "bolt"],
    [["clean", "maid", "laundry"], "spark"],
    [["grocer", "kirana", "food", "vegetable", "fruit"], "bag"],
    [["beauty", "salon", "spa", "groom"], "spark"],
    [["carpenter", "wood", "furniture"], "tool"],
    [["paint", "wall"], "brush"],
    [["ac ", " a/c", "cool", "hvac", "refriger"], "snow"],
    [["pest"], "bug"],
    [["tutor", "coach", "school", "educat"], "book"],
    [["doctor", "clinic", "health", "pharma", "hospital"], "plus"],
    [["car", "bike", "auto", "vehicle", "garage"], "wheel"],
    [["tailor", "cloth", "garment", "boutique"], "shirt"],
    [["phone", "mobile", "computer", "laptop", "electronic"], "device"],
    [["pack", "mover", "shifting"], "box"],
    [["flower", "gift", "decor"], "gift"],
  ];
  for (const [needles, icon] of rules) {
    if (needles.some((n) => key.includes(n.trim()))) return icon;
  }
  return "tag";
}

function IconPaths({ kind }: { kind: string }) {
  switch (kind) {
    case "plumb":
      return <path d="M8 12h8M10 12v6a2 2 0 0 0 4 0v-6M12 4v4M9 8h6" />;
    case "bolt":
      return <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />;
    case "spark":
      return (
        <>
          <path d="M5 12h3M16 12h3M12 5v3M12 16v3" />
          <circle cx="12" cy="12" r="3" />
        </>
      );
    case "bag":
      return (
        <>
          <path d="M6 8h12l-1 12H7L6 8Z" />
          <path d="M9 8V7a3 3 0 0 1 6 0v1" />
        </>
      );
    case "tool":
      return <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4L15 12l-3-3 2.7-2.7Z" />;
    case "brush":
      return <path d="M14 4h6v4l-6 1-4 10a3 3 0 0 1-6 0c0-4 6-8 10-15Z" />;
    case "snow":
      return <path d="M12 3v18M5 7l14 10M19 7 5 17M7 12h10" />;
    case "bug":
      return (
        <>
          <path d="M8 9h8v6a4 4 0 0 1-8 0V9Z" />
          <path d="M12 9V6M8 12H5M19 12h-3M7 7 5 5M17 7l2-2" />
        </>
      );
    case "book":
      return <path d="M4 5h7a3 3 0 0 1 3 3v12H7a3 3 0 0 0-3 3V5Zm9 0h7v15a3 3 0 0 0-3-3h-4" />;
    case "plus":
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v8M8 12h8" />
        </>
      );
    case "wheel":
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="2" />
          <path d="M12 4v4M12 16v4M4 12h4M16 12h4" />
        </>
      );
    case "shirt":
      return <path d="M8 5 12 8l4-3 3 2-2 3v10H7V10L5 7l3-2Z" />;
    case "device":
      return (
        <>
          <rect x="6" y="3" width="12" height="18" rx="2" />
          <path d="M10 18h4" />
        </>
      );
    case "box":
      return <path d="M4 8h16v12H4V8Zm0 0 8 4 8-4M12 12v8M4 8l8-4 8 4" />;
    case "gift":
      return (
        <>
          <path d="M4 11h16v9H4v-9Zm0 0V8h16v3M12 8v12" />
          <path d="M12 8c-2-3-5-3-5 0 2 0 5 0 5 0Zm0 0c2-3 5-3 5 0-2 0-5 0-5 0Z" />
        </>
      );
    default:
      return (
        <>
          <path d="M7 7h4v4H7V7Zm6 0h4v4h-4V7ZM7 13h4v4H7v-4Zm6 0h4v4h-4v-4Z" />
        </>
      );
  }
}

export function CategoryChipIcon({
  name,
  slug,
}: {
  name: string;
  slug?: string | null;
}) {
  const kind = matchIcon(iconKey(name, slug));
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <IconPaths kind={kind} />
    </svg>
  );
}
