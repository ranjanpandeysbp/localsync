export type PostRequestProvider = {
  id: string;
  name: string;
  categoryId?: number | null;
};

export type PostRequestDraft = {
  providerIds: string[];
  categoryId: number | null;
  categoryLabels?: string[];
  providers?: PostRequestProvider[];
};

export const POST_REQUEST_DRAFT_KEY = "ls_post_draft";

export function normalizeDraftProviders(draft: PostRequestDraft): PostRequestProvider[] {
  if (draft.providers?.length) {
    return draft.providers.map((p) => ({
      id: String(p.id),
      name: p.name,
      categoryId: p.categoryId ?? null,
    }));
  }
  return (draft.providerIds || []).map((id) => ({ id: String(id), name: String(id) }));
}

export function savePostRequestDraft(draft: PostRequestDraft): void {
  const payload = {
    draft,
    timestamp: Date.now(),
  };
  localStorage.setItem(POST_REQUEST_DRAFT_KEY, JSON.stringify(payload));
}

export function readPostRequestDraft(): PostRequestDraft | null {
  const raw = localStorage.getItem(POST_REQUEST_DRAFT_KEY);
  if (!raw) return null;
  try {
    const parsedObj = JSON.parse(raw);
    const parsed = parsedObj.draft as PostRequestDraft;
    const timestamp = parsedObj.timestamp as number;
    
    // Auto-expire after 24 hours (24 * 60 * 60 * 1000)
    if (!timestamp || Date.now() - timestamp > 86400000) {
      clearPostRequestDraft();
      return null;
    }

    if (!Array.isArray(parsed.providerIds) || parsed.providerIds.length === 0) return null;
    return {
      providerIds: parsed.providerIds.map(String),
      categoryId:
        parsed.categoryId == null || Number.isNaN(Number(parsed.categoryId))
          ? null
          : Number(parsed.categoryId),
      categoryLabels: Array.isArray(parsed.categoryLabels)
        ? parsed.categoryLabels.map(String)
        : undefined,
      providers: parsed.providers?.map((p) => ({
        id: String(p.id),
        name: p.name,
        categoryId: p.categoryId ?? null,
      })),
    };
  } catch {
    return null;
  }
}

export function clearPostRequestDraft(): void {
  localStorage.removeItem(POST_REQUEST_DRAFT_KEY);
}

/** Most common category among selected providers. */
export function majorityCategoryId(
  providers: { user_id: string; category_id: number | null }[],
  selectedIds: string[],
): number | null {
  const selected = new Set(selectedIds);
  const counts = new Map<number, number>();
  for (const p of providers) {
    if (!selected.has(p.user_id) || p.category_id == null) continue;
    counts.set(p.category_id, (counts.get(p.category_id) || 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [id, count] of counts) {
    if (count > bestCount) {
      best = id;
      bestCount = count;
    }
  }
  return best;
}

type CategoryNode = {
  id: number;
  name?: string;
  subcategories?: { id: number; name?: string }[] | null;
};

/** Resolve a category (or subcategory) id to its top-level parent id. */
export function topLevelCategoryId(
  tree: CategoryNode[],
  categoryId: number | null | undefined,
): number | null {
  if (categoryId == null || Number.isNaN(Number(categoryId))) return null;
  const id = Number(categoryId);
  for (const parent of tree) {
    if (parent.id === id) return parent.id;
    for (const sub of parent.subcategories || []) {
      if (sub.id === id) return parent.id;
    }
  }
  return id;
}

function categoryOptionsFromTree(
  tree: CategoryNode[],
): { id: number; label: string }[] {
  const opts: { id: number; label: string }[] = [];
  for (const parent of tree) {
    const parentName = parent.name || String(parent.id);
    opts.push({ id: parent.id, label: parentName });
    for (const sub of parent.subcategories || []) {
      const subName = sub.name || String(sub.id);
      opts.push({ id: sub.id, label: `${parentName} › ${subName}` });
    }
  }
  return opts;
}

/** Pick the draft category id, matching the provider's category once the tree is loaded. */
export function resolveDraftCategoryId(
  draft: PostRequestDraft | null | undefined,
  tree: CategoryNode[],
): number | null {
  if (!draft) return null;
  const opts = categoryOptionsFromTree(tree);
  const candidates = [
    draft.categoryId,
    ...(draft.providers || []).map((p) => p.categoryId ?? null),
  ].filter((id): id is number => id != null && !Number.isNaN(Number(id)));

  for (const id of candidates) {
    if (opts.some((o) => o.id === id)) return id;
  }
  if (tree.length === 0 && candidates[0] != null) return candidates[0];

  const labels = [
    ...(draft.categoryLabels || []),
    ...candidates.map((id) => opts.find((o) => o.id === id)?.label || ""),
  ].filter(Boolean);

  for (const raw of labels) {
    const text = raw.trim().toLowerCase();
    const exact = opts.find((o) => o.label.toLowerCase() === text);
    if (exact) return exact.id;
    const parentName = text.split(" › ")[0]?.trim();
    const parent = opts.find((o) => o.label.toLowerCase() === parentName);
    if (parent) return parent.id;
  }

  const fallback = candidates[0];
  if (fallback == null) return null;
  return topLevelCategoryId(tree, fallback);
}

/** True when every provider shares the same top-level category. */
export function providersShareTopLevelCategory(
  tree: CategoryNode[],
  providers: { category_id?: number | null; categoryId?: number | null }[],
): boolean {
  if (providers.length === 0) return true;
  const tops = new Set<number>();
  for (const p of providers) {
    const top = topLevelCategoryId(tree, p.category_id ?? p.categoryId ?? null);
    if (top == null) return false;
    tops.add(top);
  }
  return tops.size === 1;
}

export const SAME_CATEGORY_REQUEST_MESSAGE =
  "Messages can be sent only to the same category.";
