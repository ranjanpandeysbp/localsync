import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  areasForCity,
  type ServiceArea,
} from "../utils/serviceAreas";
import { cn, comboEmpty, comboList } from "../ui";

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
      className={cn("relative w-full", className, open && "z-20", disabled && "opacity-55")}
      ref={rootRef}
    >
      <div className="flex items-center gap-1 min-h-6">
        {selected && !open ? (
          <button
            type="button"
            id={id}
            className="flex items-baseline gap-[0.4rem] flex-1 min-w-0 m-0 p-0 border-0 bg-transparent font-inherit text-[1.02rem] font-semibold text-ink text-left cursor-pointer"
            disabled={disabled}
            onClick={() => !disabled && setOpen(true)}
          >
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">{displayValue}</span>
            {selected.kind === "area" && (
              <span className="shrink-0 text-[0.75rem] font-semibold text-muted">{selected.area.pincode}</span>
            )}
            <span className="shrink-0 ml-auto text-[0.72rem] font-bold tracking-[0.04em] uppercase text-brand max-[560px]:hidden">
              Change
            </span>
          </button>
        ) : (
          <input
            ref={inputRef}
            id={id}
            className="w-full border-0 bg-transparent py-[0.15rem] px-0 font-inherit text-[1.02rem] font-semibold text-ink outline-none"
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
          <button
            type="button"
            className="shrink-0 w-[1.4rem] h-[1.4rem] border-0 rounded-full bg-[rgba(29,36,43,0.06)] text-muted cursor-pointer leading-none hover:bg-[rgba(29,36,43,0.12)] hover:text-ink"
            aria-label="Clear area"
            onClick={clear}
          >
            ×
          </button>
        )}
      </div>
      {open && !disabled && (
        <ul className={`${comboList} z-50 min-w-56 max-[820px]:min-w-0`} id={listId} role="listbox">
          {options.length === 0 ? (
            <li className={comboEmpty}>
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
                  className={cn(
                    "flex items-baseline justify-between gap-[0.65rem] w-full border-0 rounded-[10px] bg-transparent py-[0.6rem] px-3 font-inherit text-left cursor-pointer text-inherit hover:bg-primary/8",
                    i === highlight && "bg-primary/8",
                  )}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => pick(opt)}
                >
                  <span className="text-[0.92rem] font-semibold text-ink">{optionLabel(opt)}</span>
                  <span className="shrink-0 text-[0.75rem] text-muted">{optionMeta(opt)}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
