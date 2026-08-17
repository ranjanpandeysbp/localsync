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
    sessionStorage.setItem(BROADCAST_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

export function readBroadcastDraft(): BroadcastRequestDraft | null {
  try {
    const raw = sessionStorage.getItem(BROADCAST_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BroadcastRequestDraft;
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
    sessionStorage.removeItem(BROADCAST_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
