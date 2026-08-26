export type BroadcastRequestDraft = {
  categoryId: number;
  categoryLabel: string;
  city: string;
  areaName?: string;
  pincode: string;
  latitude: number;
  longitude: number;
};

export const BROADCAST_DRAFT_KEY = "ls_broadcast_draft";

export function saveBroadcastDraft(draft: BroadcastRequestDraft): void {
  try {
    const payload = {
      draft,
      timestamp: Date.now(),
    };
    localStorage.setItem(BROADCAST_DRAFT_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function readBroadcastDraft(): BroadcastRequestDraft | null {
  try {
    const raw = localStorage.getItem(BROADCAST_DRAFT_KEY);
    if (!raw) return null;
    const parsedObj = JSON.parse(raw);
    const parsed = parsedObj.draft as BroadcastRequestDraft;
    const timestamp = parsedObj.timestamp as number;
    
    // Auto-expire after 24 hours (24 * 60 * 60 * 1000)
    if (!timestamp || Date.now() - timestamp > 86400000) {
      clearBroadcastDraft();
      return null;
    }
    if (
      parsed == null ||
      typeof parsed.categoryId !== "number" ||
      !parsed.city ||
      parsed.latitude == null ||
      parsed.longitude == null
    ) {
      return null;
    }
    return {
      categoryId: Number(parsed.categoryId),
      categoryLabel: String(parsed.categoryLabel || ""),
      city: String(parsed.city),
      areaName: parsed.areaName ? String(parsed.areaName) : undefined,
      pincode: String(parsed.pincode || ""),
      latitude: Number(parsed.latitude),
      longitude: Number(parsed.longitude),
    };
  } catch {
    return null;
  }
}

export function clearBroadcastDraft(): void {
  try {
    localStorage.removeItem(BROADCAST_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
