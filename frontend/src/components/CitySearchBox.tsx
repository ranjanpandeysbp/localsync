import { useEffect, useId, useMemo, useRef, useState } from "react";
import { SERVICE_CITIES, type ServiceCity } from "../utils/serviceCities";

export function CitySearchBox({
  value,
  onChange,
  placeholder = "Search city…",
  id,
  autoFocus = false,
  className,
  variant = "default",
}: {
  value: string;
  onChange: (cityName: string) => void;
  placeholder?: string;
  id?: string;
  autoFocus?: boolean;
  className?: string;
  /** pad = compact landing search bar; default = form/popup */
  variant?: "default" | "pad";
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selected = SERVICE_CITIES.find((c) => c.name === value) || null;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SERVICE_CITIES;
    return SERVICE_CITIES.filter((c) => c.name.toLowerCase().includes(q));
  }, [query]);

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

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  function pick(city: ServiceCity) {
    onChange(city.name);
    setOpen(false);
    setQuery("");
  }

  function clear() {
    onChange("");
    setQuery("");
    setOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <div
      className={`city-search city-search-${variant}${className ? ` ${className}` : ""}${
        open ? " is-open" : ""
      }`}
      ref={rootRef}
    >
      <div className={`city-search-control${open ? " is-open" : ""}`}>
        {selected && !open ? (
          <button
            type="button"
            id={id}
            className="city-search-value"
            onClick={() => setOpen(true)}
          >
            <span>{selected.name}</span>
            <span className="city-search-change">Change</span>
          </button>
        ) : (
          <input
            ref={inputRef}
            id={id}
            type="search"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            value={query}
            placeholder={selected ? selected.name : placeholder}
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
            className="city-search-clear"
            aria-label="Clear city"
            onClick={clear}
          >
            ×
          </button>
        )}
      </div>
      {open && (
        <ul className="city-search-list" id={listId} role="listbox">
          {filtered.length === 0 && (
            <li className="city-search-empty">No cities match “{query.trim()}”</li>
          )}
          {filtered.map((city, i) => (
            <li key={city.name}>
              <button
                type="button"
                role="option"
                aria-selected={city.name === value}
                className={`city-search-option${i === highlight ? " is-active" : ""}${
                  city.name === value ? " is-selected" : ""
                }`}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(city)}
              >
                {city.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
