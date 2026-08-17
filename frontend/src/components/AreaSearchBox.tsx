import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  areasForCity,
  type ServiceArea,
} from "../utils/serviceAreas";

export type AreaPick =
  | { kind: "area"; area: ServiceArea }
  | { kind: "pincode"; pincode: string; city: string };

function optionKey(opt: AreaPick): string {
  return opt.kind === "area" ? `a:${opt.area.name}` : `p:${opt.pincode}`;
}

function optionLabel(opt: AreaPick): string {
  if (opt.kind === "area") return opt.area.name;
  return opt.pincode;
}

function optionMeta(opt: AreaPick): string {
  if (opt.kind === "area") return opt.area.pincode;
  return "Pincode";
}

export function AreaSearchBox({
  city,
  value,
  onChange,
  id,
  placeholder = "Area or pincode…",
  disabled = false,
  className,
}: {
  city: string | null;
  /** Selected area name, or a custom 6-digit pincode. */
  value: string;
  onChange: (pick: AreaPick | null) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const cityAreas = useMemo(() => areasForCity(city), [city]);

  const selected = useMemo((): AreaPick | null => {
    if (!city || !value.trim()) return null;
    const match = cityAreas.find(
      (a) => a.name === value || a.pincode === value.replace(/\D/g, ""),
    );
    if (match) return { kind: "area", area: match };
    const pin = value.replace(/\D/g, "");
    if (pin.length === 6) return { kind: "pincode", pincode: pin, city };
    return null;
  }, [city, value, cityAreas]);

  const options = useMemo((): AreaPick[] => {
    if (!city) return [];
    const q = query.trim().toLowerCase();
    const pinQ = q.replace(/\D/g, "");
    const areaOpts: AreaPick[] = cityAreas
      .filter((a) => {
        if (!q) return true;
        return (
          a.name.toLowerCase().includes(q) ||
          a.pincode.includes(pinQ || q)
        );
      })
      .map((area) => ({ kind: "area" as const, area }));

    if (pinQ.length === 6 && !cityAreas.some((a) => a.pincode === pinQ)) {
      areaOpts.unshift({ kind: "pincode", pincode: pinQ, city });
    }
    return areaOpts.slice(0, 16);
  }, [city, cityAreas, query]);

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
  }, [query, city]);

  function pick(opt: AreaPick) {
    onChange(opt);
    setOpen(false);
    setQuery("");
  }

  function clear() {
    onChange(null);
    setQuery("");
    setOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  const displayValue =
    selected?.kind === "area"
      ? selected.area.name
      : selected?.kind === "pincode"
        ? selected.pincode
        : "";

  return (
    <div
      className={`area-search${className ? ` ${className}` : ""}${open ? " is-open" : ""}${
        disabled ? " is-disabled" : ""
      }`}
      ref={rootRef}
    >
      <div className={`area-search-control${open ? " is-open" : ""}`}>
        {selected && !open ? (
          <button
            type="button"
            id={id}
            className="area-search-value"
            disabled={disabled}
            onClick={() => !disabled && setOpen(true)}
          >
            <span className="area-search-value-main">{displayValue}</span>
            {selected.kind === "area" && (
              <span className="area-search-value-pin">{selected.area.pincode}</span>
            )}
            <span className="area-search-change">Change</span>
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
            disabled={disabled}
            value={query}
            placeholder={disabled ? "Select a city first" : selected ? displayValue : placeholder}
            autoComplete="off"
            onFocus={() => !disabled && setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (disabled) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setOpen(true);
                setHighlight((h) => Math.min(h + 1, Math.max(options.length - 1, 0)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
              } else if (e.key === "Enter") {
                if (selected && !query.trim()) {
                  setOpen(false);
                  return;
                }
                if (open && options[highlight]) {
                  e.preventDefault();
                  pick(options[highlight]);
                } else {
                  const pin = query.replace(/\D/g, "");
                  if (city && pin.length === 6) {
                    e.preventDefault();
                    pick({ kind: "pincode", pincode: pin, city });
                  }
                }
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
          />
        )}
        {selected && !disabled && (
          <button type="button" className="area-search-clear" aria-label="Clear area" onClick={clear}>
            ×
          </button>
        )}
      </div>
      {open && !disabled && (
        <ul className="area-search-list" id={listId} role="listbox">
          {options.length === 0 ? (
            <li className="area-search-empty">
              {query.trim()
                ? `No areas match “${query.trim()}”. Try a 6-digit pincode.`
                : "Type an area name or pincode"}
            </li>
          ) : (
            options.map((opt, i) => (
              <li key={optionKey(opt)}>
                <button
                  type="button"
                  role="option"
                  aria-selected={optionLabel(opt) === value}
                  className={`area-search-option${i === highlight ? " is-active" : ""}`}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => pick(opt)}
                >
                  <span className="area-search-option-name">{optionLabel(opt)}</span>
                  <span className="area-search-option-meta">{optionMeta(opt)}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
