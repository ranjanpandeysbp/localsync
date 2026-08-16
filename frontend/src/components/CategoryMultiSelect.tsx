import { useState } from "react";
import type { CategoryTree, OfferKind } from "../types";
import { offerKindLabel } from "./ProviderTrust";

function CategoryChevron() {
  return (
    <svg
      className="category-group-chevron"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function CategoryMultiSelect({
  tree,
  selected,
  onChange,
}: {
  tree: CategoryTree[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const [openIds, setOpenIds] = useState<number[]>([]);

  function toggleOpen(id: number) {
    setOpenIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

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
      {tree.map((parent) => {
        const subs = parent.subcategories || [];
        const open = openIds.includes(parent.id);
        const selectedSubs = subs.filter((s) => selected.includes(s.id)).length;
        const panelId = `category-group-panel-${parent.id}`;
        return (
          <div key={parent.id} className={`category-group${open ? " is-open" : ""}`}>
            <div className="category-group-head">
              <button
                type="button"
                className="category-group-toggle"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => toggleOpen(parent.id)}
              >
                <CategoryChevron />
                <span className="category-group-toggle-copy">
                  <strong>{parent.name}</strong>
                  <span className="muted"> · {offerKindLabel(parent.kind)}</span>
                  {selectedSubs > 0 && (
                    <span className="category-group-count">
                      {selectedSubs} selected
                    </span>
                  )}
                </span>
              </button>
              <label className="category-group-check" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selected.includes(parent.id)}
                  onChange={() => toggleParent(parent)}
                  aria-label={`Select all in ${parent.name}`}
                />
              </label>
            </div>
            {open && (
              <div className="category-group-panel" id={panelId}>
                {subs.length === 0 ? (
                  <p className="muted category-group-empty">No subcategories</p>
                ) : (
                  subs.map((sub) => (
                    <label key={sub.id} className="check-row sub">
                      <input
                        type="checkbox"
                        checked={selected.includes(sub.id)}
                        onChange={() => toggleSub(sub.id)}
                      />
                      <span>
                        <strong>{sub.name}</strong>
                        <span className="muted"> · {offerKindLabel(sub.kind as OfferKind)}</span>
                        {sub.description &&
                          sub.description !== sub.name && (
                            <span className="category-sub-desc muted">{sub.description}</span>
                          )}
                      </span>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
