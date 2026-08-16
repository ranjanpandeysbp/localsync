import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CategoryTree } from "../types";

export type CategoryNeedOption = {
  id: number;
  isParent: boolean;
  name: string;
  parentName: string | null;
  label: string;
  haystack: string;
};

export function categoryNeedOptions(tree: CategoryTree[]): CategoryNeedOption[] {
  const opts: CategoryNeedOption[] = [];
  for (const parent of tree) {
    opts.push({
      id: parent.id,
      isParent: true,
      name: parent.name,
      parentName: null,
      label: parent.name,
      haystack: [parent.name, parent.description || "", parent.slug].join(" ").toLowerCase(),
    });
    for (const sub of parent.subcategories || []) {
      opts.push({
        id: sub.id,
        isParent: false,
        name: sub.name,
        parentName: parent.name,
        label: `${parent.name} › ${sub.name}`,
        haystack: [parent.name, sub.name, sub.description || "", sub.slug].join(" ").toLowerCase(),
      });
    }
  }
  return opts;
}

function matchesQuery(opt: CategoryNeedOption, query: string): boolean {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return opt.isParent;
  return tokens.every((t) => opt.haystack.includes(t));
}

export function CategoryNeedSearch({
  tree,
  value,
  onChange,
  onPick,
  id,
  placeholder = "Type a category or need…",
}: {
  tree: CategoryTree[];
  value: string;
  onChange: (value: string) => void;
  onPick: (opt: CategoryNeedOption) => void;
  id?: string;
  placeholder?: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const options = useMemo(() => categoryNeedOptions(tree), [tree]);
  const filtered = useMemo(() => {
    const q = value.trim();
    const next = options.filter((opt) => matchesQuery(opt, q));
    return next.slice(0, 12);
  }, [options, value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    setHighlight(0);
  }, [value, open]);

  function pick(opt: CategoryNeedOption) {
    onChange(opt.name);
    setOpen(false);
    onPick(opt);
  }

  return (
    <div className={`need-search${open ? " is-open" : ""}`} ref={rootRef}>
      <input
        id={id}
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter" && open && filtered[highlight]) {
            e.preventDefault();
            pick(filtered[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && (
        <ul className="need-search-list" id={listId} role="listbox">
          {filtered.length === 0 ? (
            <li className="need-search-empty">No matching categories</li>
          ) : (
            filtered.map((opt, i) => (
              <li key={`${opt.isParent ? "p" : "s"}-${opt.id}`} role="option" aria-selected={i === highlight}>
                <button
                  type="button"
                  className={`need-search-option${i === highlight ? " is-active" : ""}`}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => pick(opt)}
                >
                  <span className="need-search-option-name">{opt.name}</span>
                  <span className="need-search-option-meta">
                    {opt.isParent ? "Category" : opt.parentName}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
