/** Shared Tailwind class strings matching KoshalHaat’s existing visual design. */

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export const btn =
  "inline-flex items-center justify-center border-0 rounded-full px-[1.1rem] py-[0.65rem] bg-accent text-on-accent cursor-pointer font-semibold tracking-[-0.015em] hover:bg-accent-deep hover:text-on-accent disabled:opacity-60 disabled:cursor-not-allowed";

export const btnSecondary =
  "inline-flex items-center justify-center rounded-full px-[1.1rem] py-[0.65rem] bg-transparent text-ink border border-solid border-line cursor-pointer font-semibold tracking-[-0.015em] hover:border-brand hover:text-brand hover:bg-primary/6 disabled:opacity-60 disabled:cursor-not-allowed";

export const btnDanger =
  "inline-flex items-center justify-center border-0 rounded-full px-[1.1rem] py-[0.65rem] bg-danger text-white cursor-pointer font-semibold tracking-[-0.015em] hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed";

export const field = "flex flex-col gap-[0.35rem] mb-[0.9rem]";

export const fieldLabel = "text-[0.9rem] text-muted font-semibold";

export const fieldInput =
  "border border-solid border-line rounded-xl py-[0.7rem] px-[0.85rem] bg-white w-full max-w-full min-w-0 font-inherit";

export const fieldSelect = fieldInput;

export const fieldTextarea = fieldInput;

export const muted = "text-muted font-medium";

export const errorText = "text-danger mt-2 mb-0 text-[0.9rem]";

export const brand =
  "font-display text-[1.5rem] font-bold tracking-[-0.04em] text-brand-dark";

export const card =
  "bg-card border border-solid border-[rgba(29,36,43,0.08)] rounded-[18px] p-5 shadow-card max-[560px]:p-4 max-[560px]:rounded-[14px]";

export const pill =
  "inline-flex items-center gap-[0.35rem] rounded-full py-[0.2rem] px-[0.7rem] text-[0.8rem] bg-bg-deep";

export const pillOnline =
  "inline-flex items-center gap-[0.35rem] rounded-full py-[0.2rem] px-[0.7rem] text-[0.8rem] bg-primary/14 text-primary";

export const pillOffline =
  "inline-flex items-center gap-[0.35rem] rounded-full py-[0.2rem] px-[0.7rem] text-[0.8rem] bg-danger/10 text-danger";

export const pillPending =
  "inline-flex items-center gap-[0.35rem] rounded-full py-[0.2rem] px-[0.7rem] text-[0.8rem] bg-accent/18 text-[#9a6a0a]";

export const pillKindService =
  "inline-flex items-center gap-[0.35rem] rounded-full py-[0.2rem] px-[0.7rem] text-[0.8rem] bg-blue-600/12 text-blue-700";

export const pillKindProduct =
  "inline-flex items-center gap-[0.35rem] rounded-full py-[0.2rem] px-[0.7rem] text-[0.8rem] bg-accent/18 text-[#9a6a0a]";

export const pillKindBoth =
  "inline-flex items-center gap-[0.35rem] rounded-full py-[0.2rem] px-[0.7rem] text-[0.8rem] bg-primary/14 text-primary";

export const navBadge =
  "shrink-0 min-w-5 h-5 px-[0.35rem] rounded-full bg-rose-600 text-white text-[0.72rem] font-bold leading-5 text-center shadow-[0_0_0_2px_rgba(29,36,43,0.35)]";

export const iconBtn =
  "shrink-0 inline-flex items-center justify-center w-8 h-8 p-0 border border-solid border-line rounded-lg bg-card text-ink cursor-pointer hover:border-brand hover:text-brand-dark";

export const modalBackdrop =
  "fixed inset-0 z-[80] grid place-items-center p-4 bg-[rgba(15,23,42,0.45)]";

export const loginModalBackdrop =
  "fixed inset-0 z-[100] grid place-items-center p-5 bg-[rgba(12,18,28,0.55)] backdrop-blur-[6px] animate-login-modal-fade";

export const loginModal =
  "relative w-[min(420px,100%)] pt-7 px-6 pb-6 rounded-[18px] bg-[rgba(250,249,245,0.96)] border border-solid border-white/55 shadow-[0_24px_60px_rgba(12,18,28,0.28)] animate-login-modal-rise";

export const loginModalClose =
  "absolute top-[0.65rem] right-3 w-8 h-8 border-0 rounded-full bg-transparent text-muted text-2xl leading-none cursor-pointer hover:bg-[rgba(15,23,42,0.06)] hover:text-ink";

export const loginModalTitle =
  "mt-[0.15rem] mb-[0.35rem] font-display text-[clamp(1.35rem,3vw,1.65rem)] tracking-[-0.02em] font-bold text-brand-dark";

export const eyebrow =
  "m-0 mb-1 font-display text-[0.72rem] font-bold tracking-[0.08em] uppercase text-brand";

export const linkBlue = "text-blue-600 font-semibold no-underline hover:text-blue-700 hover:underline";

export const linkBtn =
  "inline p-0 border-0 bg-transparent font-inherit cursor-pointer";

export const authWrap = "min-h-screen grid place-items-center p-4 relative";

export const pageActions = "flex flex-wrap gap-[0.55rem] pt-[0.15rem]";

export const comboList =
  "absolute left-0 right-0 top-[calc(100%+0.35rem)] z-40 m-0 p-[0.35rem] list-none max-h-56 overflow-auto rounded-[14px] border border-solid border-[rgba(29,36,43,0.1)] bg-card shadow-[0_16px_36px_rgba(12,18,28,0.18)]";

export const comboOption =
  "block w-full border-0 rounded-[10px] bg-transparent py-[0.65rem] px-3 font-inherit text-[0.95rem] font-semibold text-ink text-left cursor-pointer hover:bg-primary/8";

export const comboEmpty = "py-[0.65rem] px-3 text-[0.88rem] text-[rgba(29,36,43,0.55)]";
