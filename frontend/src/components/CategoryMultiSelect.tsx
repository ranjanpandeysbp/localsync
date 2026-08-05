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
  function toggle(id: number) {
    if (selected.includes(id)) {
      onChange(selected.filter((x) => x !== id));
    } else {
      onChange([...selected, id]);
    }
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
              onChange={() => toggle(parent.id)}
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
                onChange={() => toggle(sub.id)}
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
