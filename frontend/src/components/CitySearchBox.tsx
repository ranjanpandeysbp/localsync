import { useEffect, useId, useMemo, useRef, useState } from "react";
import { SERVICE_CITIES, type ServiceCity } from "../utils/serviceCities";
import { cn, comboEmpty, comboList, comboOption } from "../ui";

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

  const pad = variant === "pad";
  const inputCls = pad
    ? "w-full border-0 bg-transparent py-[0.15rem] px-0 font-inherit text-[1.02rem] font-semibold text-ink outline-none"
    : "w-full border-0 bg-transparent py-[0.35rem] px-[0.2rem] font-inherit text-[0.95rem] font-medium text-ink outline-none";

  return (
    <div className={cn("relative w-full", className, open && "z-20")} ref={rootRef}>
      <div
        className={cn(
          "flex items-center gap-1 min-h-6",
          !pad && "min-h-[2.6rem] py-[0.15rem] px-[0.55rem] rounded-xl border border-solid border-[rgba(29,36,43,0.12)] bg-card",
          !pad && open && "border-primary/45 shadow-[0_0_0_3px_rgba(15,76,67,0.12)]",
        )}
      >
        {selected && !open ? (
          <button
            type="button"
            id={id}
            className={cn(
              "flex-1 flex items-center justify-between gap-2 min-w-0 border-0 bg-transparent py-[0.15rem] px-0 font-inherit font-semibold text-ink text-left cursor-pointer",
              pad ? "text-[1.02rem]" : "text-[0.95rem] font-medium py-[0.35rem] px-[0.2rem]",
            )}
            onClick={() => setOpen(true)}
          >
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">{selected.name}</span>
            <span className="shrink-0 text-[0.72rem] font-bold tracking-[0.04em] uppercase text-brand">
              Change
            </span>
          </button>
        ) : (
          <input
            ref={inputRef}
            id={id}
            className={inputCls}
            type="text"
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
              } else if (e.key === "Enter") {
                if (selected && !query.trim()) {
                  setOpen(false);
                  return;
                }
                if (open && filtered[highlight]) {
                  e.preventDefault();
                  pick(filtered[highlight]);
                }
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
          />
        )}
        {selected && (
          <button
            type="button"
            className="shrink-0 w-[1.4rem] h-[1.4rem] grid place-items-center border-0 rounded-full bg-[rgba(29,36,43,0.06)] text-[rgba(29,36,43,0.65)] text-base leading-none cursor-pointer hover:bg-[rgba(29,36,43,0.12)] hover:text-ink"
            aria-label="Clear city"
            onClick={clear}
          >
            ×
          </button>
        )}
      </div>
      {open && (
        <ul className={cn(comboList, pad && "min-w-[min(12rem,100%)]")} id={listId} role="listbox">
          {filtered.length === 0 && (
            <li className={comboEmpty}>No cities match “{query.trim()}”</li>
          )}
          {filtered.map((city, i) => (
            <li key={city.name}>
              <button
                type="button"
                role="option"
                aria-selected={city.name === value}
                className={cn(comboOption, i === highlight && "bg-primary/8", city.name === value && "text-brand")}
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
