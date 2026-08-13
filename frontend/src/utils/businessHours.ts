/** Business hours helpers — IST wall-clock, matches backend. */

function parseHhmm(value: string | null | undefined): { h: number; m: number } | null {
  if (!value) return null;
  const raw = value.trim();
  const parts = raw.split(":");
  if (parts.length !== 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

function istMinutesNow(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  // en-GB can emit "24" for midnight in some engines
  const h = hour === 24 ? 0 : hour;
  return h * 60 + minute;
}

/** True when current IST time is inside [opens, closes). */
export function isWithinBusinessHours(
  openingTime: string | null | undefined,
  closingTime: string | null | undefined,
  now = new Date(),
): boolean {
  const opens = parseHhmm(openingTime);
  const closes = parseHhmm(closingTime);
  if (!opens || !closes) return false;

  const openMins = opens.h * 60 + opens.m;
  const closeMins = closes.h * 60 + closes.m;
  const nowMins = istMinutesNow(now);

  if (openMins === closeMins) return true;
  if (openMins < closeMins) return nowMins >= openMins && nowMins < closeMins;
  // Overnight window
  return nowMins >= openMins || nowMins < closeMins;
}

/** Online tag: approved + within Opens–Closes (IST). */
export function isProviderOnlineNow(opts: {
  opening_time?: string | null;
  closing_time?: string | null;
  verification_status?: string | null;
  now?: Date;
}): boolean {
  if (opts.verification_status && opts.verification_status !== "APPROVED") {
    return false;
  }
  return isWithinBusinessHours(opts.opening_time, opts.closing_time, opts.now);
}
