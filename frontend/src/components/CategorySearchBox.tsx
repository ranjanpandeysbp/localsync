import { useEffect, useId, useMemo, useRef, useState } from "react";

type Option = { id: number; label: string };

export function CategorySearchBox({
  options,
  value,
  onChange,
  placeholder = "Search categories…",
  required = false,
  disabled = false,
}: {
  options: Option[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((o) => String(o.id) === value) || null;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHighlight(0);
    }
  }, [open]);

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
  }, [query]);

  function pick(opt: Option) {
    onChange(String(opt.id));
    setOpen(false);
    setQuery("");
  }

  function clear() {
    onChange("");
    setQuery("");
    setOpen(true);
  }

  return (
    <div className="category-search" ref={rootRef}>
      <div className={`category-search-control${open ? " is-open" : ""}`}>
        {selected && !open ? (
          <button
            type="button"
            className="category-search-value"
            disabled={disabled}
            onClick={() => setOpen(true)}
          >
            <span>{selected.label}</span>
            <span className="category-search-change">Change</span>
          </button>
        ) : (
          <input
            type="search"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-required={required || undefined}
            disabled={disabled}
            value={query}
            placeholder={selected ? selected.label : placeholder}
            autoComplete="off"
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
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
        )}
        {selected && (
          <button
            type="button"
            className="category-search-clear"
            aria-label="Clear category"
            disabled={disabled}
            onClick={clear}
          >
            ×
          </button>
        )}
      </div>

      {/* Keep a native required field for form validation when closed */}
      <input type="hidden" value={value} required={required} readOnly />

      {open && (
        <ul id={listId} className="category-search-list" role="listbox">
          {filtered.length === 0 && (
            <li className="category-search-empty muted">No categories match “{query.trim()}”</li>
          )}
          {filtered.map((opt, idx) => (
            <li key={opt.id}>
              <button
                type="button"
                role="option"
                aria-selected={String(opt.id) === value}
                className={`category-search-option${idx === highlight ? " is-active" : ""}${
                  String(opt.id) === value ? " is-selected" : ""
                }`}
                onMouseEnter={() => setHighlight(idx)}
                onClick={() => pick(opt)}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
