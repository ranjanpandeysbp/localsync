import { useEffect, useId, useRef, useState } from "react";

export type StatusFilterOption<T extends string> = {
  id: T;
  label: string;
  count?: number;
};

type Props<T extends string> = {
  label?: string;
  value: T;
  options: StatusFilterOption<T>[];
  onChange: (value: T) => void;
  /** Treat this id as “no active filter” for the icon badge (default: "all"). */
  defaultValue?: T;
};

function FilterIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 6h16M7 12h10M10 18h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m6 9 6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Desktop: labeled dropdown. Mobile/tablet: filter icon that opens a scrollable menu. */
export function StatusFilterSelect<T extends string>({
  label = "Status",
  value,
  options,
  onChange,
  defaultValue,
}: Props<T>) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const inactiveId = (defaultValue ?? "all") as T;
  const selected = options.find((o) => o.id === value) || options[0];
  const hasActiveFilter = value !== inactiveId;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(next: T) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div
      className={`status-filter-select${open ? " is-open" : ""}${
        hasActiveFilter ? " has-filter" : ""
      }`}
      ref={rootRef}
    >
      <span className="status-filter-select-label muted">{label}</span>

      <button
        type="button"
        className="status-filter-select-trigger status-filter-select-trigger-desktop"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="status-filter-select-value">
          {selected?.label || "All"}
          {typeof selected?.count === "number" && (
            <span className="status-filter-select-count">{selected.count}</span>
          )}
        </span>
        <ChevronIcon />
      </button>

      <button
        type="button"
        className="status-filter-select-trigger status-filter-select-trigger-icon"
        aria-label={`${label}: ${selected?.label || "All"}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <FilterIcon />
        {hasActiveFilter && <span className="status-filter-select-dot" aria-hidden="true" />}
      </button>

      {open && (
        <ul
          id={listId}
          className="status-filter-select-menu"
          role="listbox"
          aria-label={label}
        >
          {options.map((opt) => {
            const active = opt.id === value;
            return (
              <li key={opt.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`status-filter-select-option${active ? " is-active" : ""}`}
                  onClick={() => pick(opt.id)}
                >
                  <span>{opt.label}</span>
                  {typeof opt.count === "number" && (
                    <span className="status-filter-select-count">{opt.count}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
