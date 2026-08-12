export type PostRequestProvider = {
  id: string;
  name: string;
  categoryId?: number | null;
};

export type PostRequestDraft = {
  providerIds: string[];
  categoryId: number | null;
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
  sessionStorage.setItem(POST_REQUEST_DRAFT_KEY, JSON.stringify(draft));
}

export function readPostRequestDraft(): PostRequestDraft | null {
  const raw = sessionStorage.getItem(POST_REQUEST_DRAFT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PostRequestDraft;
    if (!Array.isArray(parsed.providerIds) || parsed.providerIds.length === 0) return null;
    return {
      providerIds: parsed.providerIds.map(String),
      categoryId:
        parsed.categoryId == null || Number.isNaN(Number(parsed.categoryId))
          ? null
          : Number(parsed.categoryId),
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
  sessionStorage.removeItem(POST_REQUEST_DRAFT_KEY);
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
  subcategories?: { id: number }[] | null;
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
