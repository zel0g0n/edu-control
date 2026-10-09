"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3, Bell, BellRing, BookOpen, Building2, CalendarCheck, CalendarDays, ChevronLeft, FlaskConical,
  GraduationCap, Home, LayoutDashboard, LogOut, Megaphone, MessagesSquare, MoreHorizontal, NotebookPen, RotateCcw,
  Settings, Star, UserRound, Users, Wallet,
} from "lucide-react";
import type { UserRole } from "@edunazorat/shared";

import { useApp, type AppStore } from "@/lib/data/store";
import { fmt } from "@/lib/format";
import { useT } from "@/lib/i18n/react";
import { enablePush, pushState } from "@/lib/push";
import { Logo, useRun } from "./providers";
import { Avatar, btn, cx, Modal, PageSkeleton, Pill, Segmented } from "./ui";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  /** Faqat aniq mos kelganda faol (bosh sahifa uchun). */
  exact?: boolean;
  /** Telefonning pastki menyusida (qolganlari "Ko'proq" ichida). */
  primary?: boolean;
}

export function homeFor(role: UserRole): string {
  return { parent: "/parent", teacher: "/teacher", director: "/director", superAdmin: "/admin", student: "/student" }[role];
}

function navFor(app: AppStore, role: UserRole): NavItem[] {
  const u = app.currentUser;
  const msgs = u ? app.unreadMessages(u.id) : 0;
  switch (role) {
    case "parent":
      return [
        { href: "/parent", label: "Bosh sahifa", icon: Home, exact: true, primary: true },
        { href: "/parent/grades", label: "Baholar", icon: Star, primary: true },
        { href: "/parent/homework", label: "Vazifalar", icon: NotebookPen, primary: true },
        { href: "/parent/attendance", label: "Davomat", icon: CalendarCheck },
        { href: "/parent/schedule", label: "Dars jadvali", icon: CalendarDays },
        { href: "/parent/payments", label: "To'lovlar", icon: Wallet },
        { href: "/parent/messages", label: "Yozishmalar", icon: MessagesSquare, badge: msgs, primary: true },
        { href: "/parent/child", label: "Farzand profili", icon: UserRound },
      ];
    case "student":
      return [
        { href: "/student", label: "Bugun", icon: Home, exact: true, primary: true },
        { href: "/student/homework", label: "Vazifalar", icon: NotebookPen, primary: true },
        { href: "/student/grades", label: "Baholar", icon: Star, primary: true },
        { href: "/student/schedule", label: "Dars jadvali", icon: CalendarDays, primary: true },
        { href: "/student/attendance", label: "Davomat", icon: CalendarCheck },
      ];
    case "teacher":
      return [
        { href: "/teacher", label: "Bugun", icon: CalendarCheck, exact: true, primary: true },
        { href: "/teacher/classes", label: "Sinflar va jurnal", icon: BookOpen, primary: true },
        { href: "/teacher/homework", label: "Vazifalar", icon: NotebookPen, primary: true, badge: u ? app.homeworkOfTeacher(u.id).reduce((s, h) => s + app.submissionsOf(h.id).filter((x) => x.status === "submitted").length, 0) : 0 },
        { href: "/teacher/messages", label: "Yozishmalar", icon: MessagesSquare, badge: msgs, primary: true },
      ];
    case "director":
      return [
        { href: "/director", label: "Boshqaruv paneli", icon: LayoutDashboard, exact: true, primary: true },
        { href: "/director/students", label: "O'quvchilar", icon: GraduationCap, primary: true },
        { href: "/director/teachers", label: "O'qituvchilar", icon: Users },
        { href: "/director/classes", label: "Sinflar", icon: BookOpen },
        { href: "/director/schedule", label: "Dars jadvali", icon: CalendarDays },
        { href: "/director/payments", label: "To'lovlar", icon: Wallet, primary: true },
        { href: "/director/reports", label: "Hisobotlar", icon: BarChart3, primary: true },
        { href: "/director/announce", label: "E'lonlar", icon: Megaphone },
        { href: "/director/settings", label: "Sozlamalar", icon: Settings },
      ];
    case "superAdmin":
      return [{ href: "/admin", label: "Muassasalar", icon: Building2, exact: true, primary: true }];
  }
}

/** Rol tekshiruvi + chap panel (kompyuter) / pastki menyu (telefon). */
export function AppShell({ role, children }: { role: UserRole; children: React.ReactNode }) {
  const app = useApp();
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const user = app.currentUser;
  const allowed = user?.role === role;

  useEffect(() => {
    if (!user) router.replace("/login");
    else if (user.role !== role) router.replace(homeFor(user.role));
  }, [user, role, router]);

  if (!allowed) return <PageSkeleton />;

  const nav = navFor(app, role);
  const isActive = (n: NavItem) => (n.exact ? pathname === n.href : pathname === n.href || pathname.startsWith(`${n.href}/`));
  const primary = nav.filter((n) => n.primary);
  const secondary = nav.filter((n) => !n.primary);
  const moreActive = secondary.some(isActive);
  const inst = app.myInstitution;

  return (
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col bg-nav px-3 pt-5 pb-3 text-nav-ink md:flex">
        <Link href={homeFor(role)} className="mb-1 px-2.5"><Logo light /></Link>
        {inst && <div className="mb-5 truncate px-2.5 text-xs text-nav-ink/70">{inst.name}</div>}
        {!inst && <div className="mb-5" />}
        <nav className="flex flex-col gap-0.5" aria-label={t("Asosiy menyu")}>
          {nav.map((n) => {
            const active = isActive(n);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
                className={cx(
                  "relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-[14px] font-medium transition",
                  active ? "bg-nav-2 text-nav-active" : "hover:bg-nav-2/60 hover:text-nav-active",
                )}>
                {active && <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r bg-margin" aria-hidden />}
                <n.icon size={18} aria-hidden />
                <span className="flex-1 truncate">{t(n.label)}</span>
                {!!n.badge && <span className="tabular rounded-full bg-margin px-1.5 text-[11px] font-bold text-white">{n.badge}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-white/8 pt-3">
          <AccountButton dark />
        </div>
      </aside>

      <div className="min-w-0 flex-1 pb-28 md:pb-10">{children}</div>

      <nav aria-label={t("Asosiy menyu")}
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 px-1 pt-1.5 pb-[max(env(safe-area-inset-bottom),10px)] backdrop-blur md:hidden">
        {primary.map((n) => <BottomItem key={n.href} item={n} active={isActive(n)} label={t(n.label)} />)}
        {secondary.length > 0 && (
          <button type="button" onClick={() => setMore(true)}
            className={cx("flex flex-1 flex-col items-center gap-0.5 py-1 text-[11px]", moreActive ? "font-semibold text-ink" : "text-muted")}>
            <span className={cx("flex rounded-full px-4 py-1", moreActive && "bg-primary-soft text-primary-ink")}><MoreHorizontal size={21} aria-hidden /></span>
            {t("Ko'proq")}
          </button>
        )}
      </nav>
      <Modal open={more} onClose={() => setMore(false)} title={t("Bo'limlar")}>
        <div className="grid grid-cols-3 gap-2">
          {secondary.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setMore(false)}
              className={cx("flex flex-col items-center gap-2 rounded-2xl border p-3 text-center text-[13px] font-medium",
                isActive(n) ? "border-primary bg-primary-soft text-primary-ink" : "border-line")}>
              <n.icon size={22} aria-hidden />
              {t(n.label)}
            </Link>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function BottomItem({ item: n, active, label }: { item: NavItem; active: boolean; label: string }) {
  return (
    <Link href={n.href} aria-current={active ? "page" : undefined}
      className={cx("flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1 text-[11px]", active ? "font-semibold text-ink" : "text-muted")}>
      <span className={cx("relative flex rounded-full px-4 py-1", active && "bg-primary-soft text-primary-ink")}>
        <n.icon size={21} aria-hidden />
        {!!n.badge && <span className="tabular absolute -top-0.5 right-1.5 rounded-full bg-margin px-1 text-[10px] font-bold text-white">{n.badge}</span>}
      </span>
      <span className="w-full truncate text-center">{label.split(" ")[0]}</span>
    </Link>
  );
}

export function PageHeader({
  title, subtitle, actions, back, below,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  back?: string;
  /** Sarlavha ostidagi qator (tablar, filtrlar). */
  below?: React.ReactNode;
}) {
  const t = useT();
  return (
    <header className="sticky top-0 z-20 border-b border-transparent bg-bg/92 backdrop-blur supports-[backdrop-filter]:bg-bg/80">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 pt-[max(env(safe-area-inset-top),12px)] pb-2.5 md:px-8 md:pt-6 md:pb-3">
        {back && (
          <Link href={back} className={cx(btn.icon, "-ml-2")} aria-label={t("Orqaga")}>
            <ChevronLeft size={24} aria-hidden />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[21px] leading-tight font-bold tracking-tight md:text-[26px]">{title}</h1>
          {subtitle && <div className="mt-0.5 truncate text-[13px] text-muted md:text-sm">{subtitle}</div>}
        </div>
        {actions && <div className="hidden items-center gap-2 sm:flex">{actions}</div>}
        <NotificationBell />
        <div className="md:hidden"><AccountButton /></div>
      </div>
      {actions && <div className="mx-auto flex w-full max-w-6xl flex-wrap gap-2 px-4 pb-2.5 sm:hidden">{actions}</div>}
      {below && <div className="mx-auto w-full max-w-6xl px-4 pb-2.5 md:px-8">{below}</div>}
    </header>
  );
}

export function PageBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <main className={cx("mx-auto w-full max-w-6xl px-4 pt-2 md:px-8", className)}>{children}</main>;
}

function NotificationBell() {
  const app = useApp();
  const t = useT();
  const u = app.currentUser;
  if (!u || u.role === "superAdmin") return null;
  const n = app.unreadCount(u.id);
  return (
    <Link href={`${homeFor(u.role)}/notifications`} className={cx(btn.icon, "relative")} aria-label={n ? t("Bildirishnomalar: {n} ta yangi", { n }) : t("Bildirishnomalar")}>
      <Bell size={21} aria-hidden />
      {n > 0 && <span className="tabular absolute top-1 right-0.5 min-w-[18px] rounded-full bg-margin px-1 text-center text-[10px] leading-[18px] font-bold text-white">{n > 99 ? "99+" : n}</span>}
    </Link>
  );
}

export function AccountButton({ dark }: { dark?: boolean }) {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [push, setPush] = useState(pushState);
  const user = app.currentUser;
  if (!user) return null;
  const inst = app.institution(user.institutionId);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={t("Profil va sozlamalar")}
        className={cx("flex items-center gap-2.5 rounded-lg text-left", dark ? "w-full p-2 hover:bg-nav-2" : "")}>
        <Avatar name={user.name} size={dark ? 34 : 32} />
        {dark && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-nav-active">{user.name}</span>
            <span className="block truncate text-xs text-nav-ink/75">{t(`role.${user.role}`)}</span>
          </span>
        )}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("Profil")}>
        <div className="flex items-center gap-3">
          <Avatar name={user.name} size={56} />
          <div className="min-w-0">
            <div className="truncate text-lg font-bold">{user.name}</div>
            <div className="text-sm text-muted">{t(`role.${user.role}`)} · {fmt.phone(user.phone)}</div>
            {inst && <div className="truncate text-sm text-muted">{inst.name}</div>}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold">{t("Til")}</span>
            <Segmented size="sm" value={app.lang} onChange={(l) => app.setLang(l)} options={[{ value: "uz", label: "O'zbekcha" }, { value: "ru", label: "Русский" }]} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{t("Bildirishnomalar")}</span>
              <span className="block text-xs text-muted">
                {push === "granted" ? t("Yoqilgan") : push === "denied" ? t("Brauzer sozlamalarida bloklangan") : push === "unsupported" ? t("Bu brauzer qo'llamaydi") : t("Baho, davomat va xabarlar haqida darhol bilib oling")}
              </span>
            </span>
            {push === "default" && (
              <button type="button" className={btn.sm} onClick={async () => setPush(await enablePush())}>
                <BellRing size={16} aria-hidden /> {t("Yoqish")}
              </button>
            )}
          </div>
          {app.mode === "local" && <Pill tone="warn" icon={FlaskConical} className="self-start whitespace-normal">{t("Demo rejim: ma'lumotlar shu brauzerda saqlanadi")}</Pill>}
        </div>

        <div className="mt-6 flex flex-col gap-2">
          {app.mode === "local" && (
            <button type="button" className={btn.outline} onClick={async () => {
              await run(() => app.resetDemo(), t("Demo ma'lumotlar tiklandi"));
              setOpen(false);
            }}>
              <RotateCcw size={18} aria-hidden /> {t("Demo ma'lumotlarni tiklash")}
            </button>
          )}
          <button type="button" className={btn.outline} onClick={async () => {
            setOpen(false);
            await app.signOut();
            router.replace("/login");
          }}>
            <LogOut size={18} aria-hidden /> {t("Chiqish")}
          </button>
        </div>
      </Modal>
    </>
  );
}

