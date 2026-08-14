import type { CategoryTree, OfferKind } from "../types";
import { offerKindLabel } from "./ProviderTrust";

export function CategoryMultiSelect({
  tree,
  selected,
  onChange,
}: {
  tree: CategoryTree[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  function toggleParent(parent: CategoryTree) {
    const childIds = (parent.subcategories || []).map((s) => s.id);
    const groupIds = [parent.id, ...childIds];
    const isChecked = selected.includes(parent.id);

    if (isChecked) {
      // Uncheck parent → clear all of its subcategories too.
      const drop = new Set(groupIds);
      onChange(selected.filter((id) => !drop.has(id)));
      return;
    }

    // Check parent → select parent and every subcategory under it.
    const next = new Set(selected);
    for (const id of groupIds) next.add(id);
    onChange([...next]);
  }

  function toggleSub(subId: number) {
    if (selected.includes(subId)) {
      onChange(selected.filter((x) => x !== subId));
      return;
    }
    onChange([...selected, subId]);
  }

  if (tree.length === 0) {
    return <p className="muted">No categories configured yet. Ask an admin to add some.</p>;
  }

  return (
    <div className="category-multi">
      {tree.map((parent) => (
        <div key={parent.id} className="category-group">
          <label className="check-row">
            <input
              type="checkbox"
              checked={selected.includes(parent.id)}
              onChange={() => toggleParent(parent)}
            />
            <span>
              <strong>{parent.name}</strong>
              <span className="muted"> · {offerKindLabel(parent.kind)}</span>
            </span>
          </label>
          {(parent.subcategories || []).map((sub) => (
            <label key={sub.id} className="check-row sub">
              <input
                type="checkbox"
                checked={selected.includes(sub.id)}
                onChange={() => toggleSub(sub.id)}
              />
              <span>
                {sub.name}
                <span className="muted"> · {offerKindLabel(sub.kind as OfferKind)}</span>
              </span>
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}
