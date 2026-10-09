"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp, ChevronRight, Search, X } from "lucide-react";
import type { AttendanceStatus, GradeType } from "@edunazorat/shared";

import { fmt } from "@/lib/format";
import { useT } from "@/lib/i18n/react";

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(" ");
}

// ------------------------------------------------------------------ ranglar

export type Tone = "primary" | "ok" | "info" | "warn" | "bad" | "slate";

const TONE_TEXT: Record<Tone, string> = {
  primary: "text-primary", ok: "text-ok", info: "text-info", warn: "text-warn", bad: "text-bad", slate: "text-slate",
};
const TONE_SOFT: Record<Tone, string> = {
  primary: "bg-primary/12 text-primary",
  ok: "bg-ok/12 text-ok",
  info: "bg-info/12 text-info",
  warn: "bg-warn/14 text-warn",
  bad: "bg-bad/12 text-bad",
  slate: "bg-slate/12 text-slate",
};
const TONE_SOLID: Record<Tone, string> = {
  primary: "bg-primary text-white dark:text-nav",
  ok: "bg-ok text-white dark:text-nav",
  info: "bg-info text-white dark:text-nav",
  warn: "bg-warn text-white dark:text-nav",
  bad: "bg-bad text-white dark:text-nav",
  slate: "bg-slate text-white dark:text-nav",
};
const TONE_BG: Record<Tone, string> = {
  primary: "bg-primary", ok: "bg-ok", info: "bg-info", warn: "bg-warn", bad: "bg-bad", slate: "bg-slate",
};
const TONE_BORDER: Record<Tone, string> = {
  primary: "border-primary", ok: "border-ok", info: "border-info", warn: "border-warn", bad: "border-bad", slate: "border-slate",
};
export const toneText = (t: Tone) => TONE_TEXT[t];
export const toneSoft = (t: Tone) => TONE_SOFT[t];
export const toneSolid = (t: Tone) => TONE_SOLID[t];
export const toneBg = (t: Tone) => TONE_BG[t];
export const toneBorder = (t: Tone) => TONE_BORDER[t];

export const ATT_TONE: Record<AttendanceStatus, Tone> = { present: "ok", late: "warn", absent: "bad", excused: "slate" };

export function gradeTone(v: number): Tone {
  return v >= 5 ? "ok" : v >= 4 ? "info" : v >= 3 ? "warn" : "bad";
}
export function avgTone(v: number | null): Tone {
  if (v === null) return "slate";
  return v >= 4.5 ? "ok" : v >= 3.5 ? "info" : v >= 2.75 ? "warn" : "bad";
}

// ------------------------------------------------------------------ bloklar

export function Card({ className, children, as: As = "div" }: { className?: string; children: React.ReactNode; as?: "div" | "section" | "article" }) {
  return <As className={cx("rounded-2xl border border-line bg-surface", className)}>{children}</As>;
}

export function Section({
  title, action, children, className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("mt-6", className)}>
      <div className="mb-2.5 flex min-h-8 items-center gap-2 px-1">
        <h2 className="flex-1 text-[15px] font-bold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function SectionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-0.5 text-sm font-semibold text-primary hover:underline">
      {children}
      <ChevronRight size={16} aria-hidden />
    </Link>
  );
}

export function StatCard({
  label, value, icon: Icon, tone = "primary", caption, href,
}: {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  caption?: React.ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-muted">{label}</span>
        <span className={cx("flex size-8 shrink-0 items-center justify-center rounded-lg", toneSoft(tone))}>
          <Icon size={17} aria-hidden />
        </span>
      </div>
      <div className="tabular mt-2 text-[22px] leading-tight font-bold tracking-tight break-words md:text-2xl">{value}</div>
      {caption && <div className="mt-1 text-xs font-medium text-muted">{caption}</div>}
    </>
  );
  const cls = "flex flex-col rounded-2xl border border-line bg-surface p-4 text-left";
  return href ? (
    <Link href={href} className={cx(cls, "transition hover:border-primary/50")}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Pill({ tone, children, icon: Icon, className }: { tone: Tone; children: React.ReactNode; icon?: LucideIcon; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", toneSoft(tone), className)}>
      {Icon && <Icon size={13} aria-hidden />}
      {children}
    </span>
  );
}

export function AttendancePill({ status }: { status: AttendanceStatus }) {
  const t = useT();
  return <Pill tone={ATT_TONE[status]}>{t(`att.${status}`)}</Pill>;
}

/** Baho: rangli kvadrat. Nazorat ishi qalin hoshiyali, izoh bo'lsa nuqta. */
export function GradeBadge({
  value, size = 34, type, comment, title,
}: {
  value: number;
  size?: number;
  type?: GradeType;
  comment?: string;
  title?: string;
}) {
  const tone = gradeTone(value);
  const strong = type === "control" || type === "term" || type === "year";
  return (
    <span
      title={title}
      className={cx(
        "tabular relative inline-flex shrink-0 items-center justify-center font-bold",
        strong ? cx(toneSolid(tone)) : toneSoft(tone),
      )}
      style={{ width: size, height: size, borderRadius: size * 0.28, fontSize: size * 0.46 }}
    >
      {value}
      {comment && <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full border border-surface bg-margin" aria-hidden />}
    </span>
  );
}

export function Avatar({
  name, size = 40, tone = "primary", image, ring,
}: {
  name: string;
  size?: number;
  tone?: Tone;
  image?: string;
  ring?: Tone;
}) {
  const ringCls = ring ? cx("ring-2 ring-offset-2 ring-offset-surface", ring === "ok" ? "ring-ok" : ring === "warn" ? "ring-warn" : ring === "bad" ? "ring-bad" : "ring-primary") : "";
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt={name} width={size} height={size} className={cx("shrink-0 rounded-full object-cover", ringCls)} style={{ width: size, height: size }} />
    );
  }
  return (
    <span
      aria-hidden
      className={cx("flex shrink-0 items-center justify-center rounded-full font-semibold", toneSoft(tone), ringCls)}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {fmt.initials(name)}
    </span>
  );
}

export function EmptyState({
  icon: Icon, title, text, action, compact,
}: {
  icon: LucideIcon;
  title?: string;
  text?: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cx("flex flex-col items-center gap-2 px-6 text-center", compact ? "py-6" : "py-12")}>
      <span className="mb-1 flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-muted">
        <Icon size={24} aria-hidden />
      </span>
      {title && <p className="font-semibold">{title}</p>}
      {text && <p className="max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton rounded-lg", className)} aria-hidden />;
}

/** Sahifa yuklanayotganda: sarlavha + kartalar skeleti. */
export function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-6 md:px-8" aria-busy="true" aria-label="Yuklanmoqda">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="mt-2 h-4 w-32" />
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <Skeleton className="mt-6 h-48 rounded-2xl" />
      <Skeleton className="mt-3 h-32 rounded-2xl" />
    </div>
  );
}

export function Spinner({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <div className={cx("flex justify-center py-12", className)}>
      <div className="animate-spin rounded-full border-[3px] border-primary border-t-transparent" style={{ width: size, height: size }} />
    </div>
  );
}

// ------------------------------------------------------------------ tugmalar, maydonlar

const BTN = "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap";
export const btn = {
  primary: cx(BTN, "h-11 bg-primary px-4 text-white hover:brightness-110 active:brightness-95 dark:text-nav"),
  tonal: cx(BTN, "h-11 bg-primary-soft px-4 text-primary-ink hover:brightness-95"),
  outline: cx(BTN, "h-11 border border-line bg-surface px-4 hover:bg-surface-2"),
  danger: cx(BTN, "h-11 bg-bad px-4 text-white hover:brightness-110 dark:text-nav"),
  ghost: cx(BTN, "h-9 rounded-lg px-2.5 text-sm text-primary hover:bg-primary/8"),
  sm: cx(BTN, "h-9 rounded-lg border border-line bg-surface px-3 text-sm hover:bg-surface-2"),
  smPrimary: cx(BTN, "h-9 rounded-lg bg-primary px-3 text-sm text-white hover:brightness-110 dark:text-nav"),
  icon: "inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface-2 transition",
};

export const inputCls =
  "h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] outline-none transition placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-primary/20";
export const selectCls = cx(inputCls, "appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9");
export const textareaCls =
  "min-h-24 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] outline-none transition placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-primary/20";

/**
 * Forma maydoni. group: ichida bir nechta tugma (segment, fayl tanlash) bo'lsa
 * <label> o'rniga guruh ishlatiladi, aks holda yorliq birinchi tugmaga bog'lanib qoladi.
 */
export function Field({ label, hint, error, children, className, group }: { label: string; hint?: string; error?: string; children: React.ReactNode; className?: string; group?: boolean }) {
  const body = (
    <>
      <span className="text-[13px] font-semibold text-muted">{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-muted">{hint}</span>}
      {error && <span className="text-sm font-medium text-bad">{error}</span>}
    </>
  );
  const cls = cx("flex min-w-0 flex-col gap-1.5", className);
  return group ? <div role="group" aria-label={label} className={cls}>{body}</div> : <label className={cls}>{body}</label>;
}

/** Oddiy <select> o'qcha bilan. */
export function Select({ value, onChange, children, className, ...rest }: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange"> & { onChange: (v: string) => void }) {
  return (
    <select
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cx(selectCls, className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238a90a6' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
    >
      {children}
    </select>
  );
}

export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  return (
    <div className={cx("relative", className)}>
      <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cx(inputCls, "pl-10")} aria-label={placeholder} />
    </div>
  );
}

export function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        "h-9 shrink-0 rounded-full border px-3.5 text-[13px] whitespace-nowrap transition",
        selected ? "border-ink bg-ink font-semibold text-bg" : "border-line bg-surface hover:bg-surface-2",
      )}
    >
      {children}
    </button>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return <div className="scroll-x -mx-4 flex gap-2 px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">{children}</div>;
}

export function Segmented<T extends string>({
  value, options, onChange, size = "md",
}: {
  value: T;
  options: { value: T; label: React.ReactNode }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex max-w-full rounded-xl bg-surface-2 p-1" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "flex-1 rounded-lg px-3 whitespace-nowrap transition",
            size === "sm" ? "h-8 text-[13px]" : "h-9 text-sm",
            value === o.value ? "bg-surface font-semibold shadow-sm" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ value, tone = "primary", className }: { value: number; tone?: Tone; className?: string }) {
  return (
    <div className={cx("h-1.5 overflow-hidden rounded-full bg-surface-2", className)}>
      <div className={cx("h-full rounded-full", toneBg(tone))} style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }} />
    </div>
  );
}

// ------------------------------------------------------------------ oyna

/** Native <dialog>: telefonda pastdan chiqadi, kompyuterda markazda. */
export function Modal({
  open, onClose, title, children, footer, wide,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    const d = ref.current;
    return () => {
      if (d?.open) d.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cx(
        "m-0 mt-auto max-h-[92dvh] w-full max-w-none rounded-t-3xl bg-surface p-0 text-ink shadow-2xl md:m-auto md:rounded-3xl",
        wide ? "md:max-w-2xl" : "md:max-w-lg",
      )}
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col">
          <div className="flex items-center gap-2 px-5 pt-4 pb-2">
            <h2 className="min-w-0 flex-1 text-lg font-bold">{title}</h2>
            <button type="button" className={btn.icon} onClick={onClose} aria-label={t("Yopish")}>
              <X size={20} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
          {footer && <div className="flex gap-2 border-t border-line px-5 pt-3 pb-[max(env(safe-area-inset-bottom),16px)] [&>*]:flex-1">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/** Tasdiqlash oynasi (brauzerning confirm() o'rniga). */
export function useConfirm() {
  const t = useT();
  const [state, setState] = useState<{ text: string; danger?: boolean; ok: string; resolve: (v: boolean) => void } | null>(null);
  const ask = (text: string, opts: { danger?: boolean; ok?: string } = {}) =>
    new Promise<boolean>((resolve) => setState({ text, danger: opts.danger, ok: opts.ok ?? t("Tasdiqlash"), resolve }));
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  const dialog = (
    <Modal
      open={!!state}
      onClose={() => close(false)}
      title={t("Ishonchingiz komilmi?")}
      footer={
        <>
          <button type="button" className={btn.outline} onClick={() => close(false)}>{t("Bekor qilish")}</button>
          <button type="button" className={state?.danger ? btn.danger : btn.primary} onClick={() => close(true)}>{state?.ok}</button>
        </>
      }
    >
      <p className="text-[15px] text-muted">{state?.text}</p>
    </Modal>
  );
  return { ask, dialog };
}

// ------------------------------------------------------------------ jadval

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Saralash qiymati (berilsa ustun saralanadi). */
  sort?: (row: T) => string | number;
  align?: "left" | "right" | "center";
  className?: string;
  /** Telefonda kartochkada ko'rsatilmaydi. */
  hideOnMobile?: boolean;
}

/**
 * Kompyuterda jadval, telefonda kartochkalar ro'yxati.
 * Birinchi ustun kartochka sarlavhasi bo'ladi.
 */
export function DataTable<T>({
  rows, columns, rowKey, onRowClick, empty, initialSort, rowHref,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  rowHref?: (row: T) => string;
  empty?: React.ReactNode;
  initialSort?: { key: string; dir: 1 | -1 };
}) {
  const [sort, setSort] = useState(initialSort);
  const sorted = useMemo(() => {
    const col = sort && columns.find((c) => c.key === sort.key);
    if (!col?.sort || !sort) return rows;
    const get = col.sort;
    return [...rows].sort((a, b) => {
      const x = get(a), y = get(b);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir;
    });
  }, [rows, columns, sort]);

  if (rows.length === 0) return <>{empty}</>;

  const alignCls = (a?: Column<T>["align"]) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");
  const clickable = !!(onRowClick || rowHref);
  const wrap = (row: T, className: string, children: React.ReactNode) =>
    rowHref ? <Link key={rowKey(row)} href={rowHref(row)} className={className}>{children}</Link>
      : onRowClick ? <button key={rowKey(row)} type="button" onClick={() => onRowClick(row)} className={cx(className, "w-full text-left")}>{children}</button>
        : <div key={rowKey(row)} className={className}>{children}</div>;
  const [first, ...rest] = columns;

  return (
    <>
      {/* Kompyuter */}
      <div className="scroll-x hidden rounded-2xl border border-line bg-surface md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-[12px] font-semibold tracking-wide text-muted uppercase">
              {columns.map((c) => (
                <th key={c.key} className={cx("px-4 py-3 font-semibold whitespace-nowrap", alignCls(c.align), c.className)} scope="col"
                  aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
                  {c.sort ? (
                    <button type="button" className="inline-flex items-center gap-1 uppercase hover:text-ink"
                      onClick={() => setSort((s) => ({ key: c.key, dir: s?.key === c.key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
                      {c.header}
                      {sort?.key === c.key && (sort.dir === 1 ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}
                    </button>
                  ) : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular">
            {sorted.map((row) => (
              <tr
                key={rowKey(row)}
                className={cx("border-b border-line last:border-0", clickable && "cursor-pointer hover:bg-surface-2/60")}
                onClick={rowHref ? undefined : onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c, i) => (
                  <td key={c.key} className={cx("px-4 py-3", alignCls(c.align), c.className)}>
                    {i === 0 && rowHref ? <Link href={rowHref(row)} className="hover:underline">{c.cell(row)}</Link> : c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Telefon */}
      <div className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface md:hidden">
        {sorted.map((row) => wrap(row, cx("block px-4 py-3", clickable && "active:bg-surface-2"), (
          <>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">{first.cell(row)}</div>
              {clickable && <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden />}
            </div>
            <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
              {rest.filter((c) => !c.hideOnMobile).map((c) => (
                <div key={c.key} className="flex min-w-0 flex-col">
                  <dt className="text-[11px] text-muted">{c.header}</dt>
                  <dd className="tabular min-w-0 truncate">{c.cell(row)}</dd>
                </div>
              ))}
            </dl>
          </>
        )))}
      </div>
    </>
  );
}

/** Ro'yxat elementi (havola yoki tugma). */
export function ListRow({
  href, onClick, leading, title, subtitle, trailing, className,
}: {
  href?: string;
  onClick?: () => void;
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}) {
  const inner = (
    <>
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{title}</div>
        {subtitle && <div className="truncate text-[13px] text-muted">{subtitle}</div>}
      </div>
      {trailing}
      {(href || onClick) && !trailing && <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden />}
    </>
  );
  const cls = cx("flex w-full items-center gap-3 px-4 py-3 text-left", (href || onClick) && "transition hover:bg-surface-2/70", className);
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

export function ListCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface", className)}>{children}</div>;
}
