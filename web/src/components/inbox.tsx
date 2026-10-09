"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell, CalendarCheck, CheckCheck, MessageSquarePlus, MessagesSquare, Megaphone, NotebookPen, Send, Star, Wallet, type LucideIcon,
} from "lucide-react";
import { dayKey, type AppNotification, type NotificationType } from "@edunazorat/shared";

import { useApp } from "@/lib/data/store";
import { fmt } from "@/lib/format";
import { useT } from "@/lib/i18n/react";
import { notificationHref, notificationText } from "@/lib/notif";
import { useRun } from "./providers";
import { homeFor } from "./shell";
import { Avatar, btn, Card, cx, EmptyState, Field, ListCard, ListRow, Modal, Select, textareaCls, toneSoft, type Tone } from "./ui";

const TYPE_ICON: Record<NotificationType, [LucideIcon, Tone]> = {
  attendance: [CalendarCheck, "ok"],
  grade: [Star, "info"],
  homework: [NotebookPen, "primary"],
  payment: [Wallet, "warn"],
  announcement: [Megaphone, "bad"],
  message: [MessagesSquare, "primary"],
  submission: [NotebookPen, "info"],
};

export function NotificationsView() {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const router = useRouter();
  const u = app.currentUser!;
  const [filter, setFilter] = useState<NotificationType | "all">("all");
  const list = app.notificationsOf(u.id).filter((n) => filter === "all" || n.type === filter);
  const unread = app.unreadCount(u.id);
  const types = [...new Set(app.notificationsOf(u.id).map((n) => n.type))];

  const groups = useMemo(() => {
    const out: { day: string; items: AppNotification[] }[] = [];
    for (const n of list) {
      const d = dayKey(n.time);
      if (out[out.length - 1]?.day !== d) out.push({ day: d, items: [] });
      out[out.length - 1].items.push(n);
    }
    return out;
  }, [list]);

  const open = async (n: AppNotification) => {
    if (!n.read) await run(() => app.run("notification.read", { id: n.id }));
    const href = notificationHref(n, u.role);
    if (href) {
      const child = /[?&]child=([^&]+)/.exec(href)?.[1];
      if (child) app.selectChild(child);
      router.push(href.replace(/\?.*$/, ""));
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filter} onChange={(v) => setFilter(v as NotificationType | "all")} className="h-10 !w-auto min-w-44" aria-label={t("Turi")}>
          <option value="all">{t("Barchasi")}</option>
          {types.map((x) => <option key={x} value={x}>{t(`ntype.${x}`)}</option>)}
        </Select>
        <span className="flex-1" />
        {unread > 0 && (
          <button type="button" className={btn.sm} onClick={() => run(() => app.run("notification.read", { all: true }))}>
            <CheckCheck size={16} aria-hidden /> {t("Hammasini o'qilgan qilish")}
          </button>
        )}
      </div>
      {list.length === 0 ? (
        <Card className="mt-4"><EmptyState icon={Bell} title={t("Bildirishnoma yo'q")} text={t("Baho, davomat, vazifa va to'lovlar haqidagi xabarlar shu yerda chiqadi")} /></Card>
      ) : (
        groups.map((g) => (
          <section key={g.day} className="mt-5">
            <h2 className="mb-2 px-1 text-[13px] font-semibold text-muted">
              {g.day === app.today ? t("Bugun") : fmt.weekday(g.day)}, {fmt.date(g.day)}
            </h2>
            <ListCard>
              {g.items.map((n) => {
                const [Icon, tone] = TYPE_ICON[n.type];
                return (
                  <button key={n.id} type="button" onClick={() => open(n)} className={cx("flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-surface-2/70", !n.read && "bg-primary-soft/40")}>
                    {n.image ? (
                      <Avatar name="" image={n.image} size={44} />
                    ) : (
                      <span className={cx("flex size-11 shrink-0 items-center justify-center rounded-full", toneSoft(tone))}><Icon size={20} aria-hidden /></span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className={cx("block text-[14.5px] leading-snug", !n.read && "font-semibold")}>{notificationText(app.lang, n)}</span>
                      <span className="tabular mt-0.5 block text-xs text-muted">{fmt.relative(n.time, app.now)}</span>
                    </span>
                    {!n.read && <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-margin" aria-label={t("Yangi")} />}
                  </button>
                );
              })}
            </ListCard>
          </section>
        ))
      )}
    </>
  );
}

// ------------------------------------------------------------------ yozishmalar

export function ThreadsView() {
  const app = useApp();
  const t = useT();
  const u = app.currentUser!;
  const base = `${homeFor(u.role)}/messages`;
  const threads = app.threadsOf(u.id);
  const [compose, setCompose] = useState(false);
  return (
    <>
      <div className="flex justify-end">
        <button type="button" className={btn.smPrimary} onClick={() => setCompose(true)}>
          <MessageSquarePlus size={16} aria-hidden /> {t("Yangi xabar")}
        </button>
      </div>
      {threads.length === 0 ? (
        <Card className="mt-3"><EmptyState icon={MessagesSquare} title={t("Yozishmalar yo'q")}
          text={u.role === "parent" ? t("Farzandingiz o'qituvchisiga savol yozing") : t("Ota-onalar yozgan xabarlar shu yerda chiqadi")} /></Card>
      ) : (
        <ListCard className="mt-3">
          {threads.map((th) => {
            const other = app.userById(u.role === "parent" ? th.teacherId : th.parentId);
            const last = app.messagesOf(th.id).at(-1);
            const unread = app.unreadInThread(th.id, u.id);
            const student = app.student(th.studentId);
            return (
              <ListRow key={th.id} href={`${base}/${th.id}`}
                leading={<Avatar name={other?.name ?? "?"} />}
                title={<span className="flex items-center gap-2"><span className="truncate">{other?.name}</span>{u.role === "parent" && other && <span className="shrink-0 text-xs font-normal text-muted">{other.subjects.join(", ")}</span>}</span>}
                subtitle={<span className={cx(unread > 0 && "font-semibold text-ink")}>{student?.name}: {last?.text}</span>}
                trailing={
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="tabular text-xs text-muted">{last ? fmt.relative(last.time, app.now) : ""}</span>
                    {unread > 0 && <span className="tabular rounded-full bg-margin px-1.5 text-[11px] font-bold text-white">{unread}</span>}
                  </span>
                }
              />
            );
          })}
        </ListCard>
      )}
      <ComposeModal open={compose} onClose={() => setCompose(false)} />
    </>
  );
}

/** Yangi yozishma: ota-ona o'qituvchini, o'qituvchi o'quvchi (ota-onasi)ni tanlaydi. */
function ComposeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const router = useRouter();
  const u = app.currentUser!;
  const isParent = u.role === "parent";
  const children = isParent ? u.childIds.map((id) => app.student(id)).filter((s) => !!s) : [];
  const [studentId, setStudentId] = useState(isParent ? (app.child?.id ?? children[0]?.id ?? "") : "");
  const [teacherId, setTeacherId] = useState("");
  const [parentId, setParentId] = useState("");
  const [text, setText] = useState("");
  const student = app.student(studentId);
  const teachers = student ? app.teachersOfClass(student.classId) : [];
  const myStudents = !isParent ? app.classesOfTeacher(u.id).flatMap((c) => app.studentsOfClass(c.id)) : [];
  const parents = student ? app.parentsOfStudent(student.id) : [];

  const send = async () => {
    const p = await run(() => app.run("message.send", { studentId, teacherId: isParent ? teacherId : u.id, parentId: isParent ? undefined : parentId || parents[0]?.id, text }));
    const th = p?.upsert?.threads?.[0];
    if (th) {
      onClose();
      setText("");
      router.push(`${homeFor(u.role)}/messages/${th.id}`);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("Yangi xabar")}
      footer={<><button type="button" className={btn.outline} onClick={onClose}>{t("Bekor qilish")}</button>
        <button type="button" className={btn.primary} disabled={!studentId || (isParent && !teacherId) || !text.trim()} onClick={send}><Send size={16} aria-hidden /> {t("Yuborish")}</button></>}>
      <div className="flex flex-col gap-3">
        {isParent ? (
          <>
            {children.length > 1 && (
              <Field label={t("Farzand")}>
                <Select value={studentId} onChange={(v) => { setStudentId(v); setTeacherId(""); }}>
                  {children.map((s) => <option key={s!.id} value={s!.id}>{s!.name}</option>)}
                </Select>
              </Field>
            )}
            <Field label={t("O'qituvchi")}>
              <Select value={teacherId} onChange={setTeacherId}>
                <option value="">{t("Tanlang")}</option>
                {teachers.map(({ teacher, subjects }) => <option key={teacher.id} value={teacher.id}>{teacher.name}{subjects.length ? ` — ${subjects.join(", ")}` : ` — ${t("sinf rahbari")}`}</option>)}
              </Select>
            </Field>
          </>
        ) : (
          <>
            <Field label={t("O'quvchi")}>
              <Select value={studentId} onChange={(v) => { setStudentId(v); setParentId(""); }}>
                <option value="">{t("Tanlang")}</option>
                {myStudents.map((s) => <option key={s.id} value={s.id}>{s.name} ({app.schoolClass(s.classId)?.name})</option>)}
              </Select>
            </Field>
            {parents.length > 1 && (
              <Field label={t("Ota-ona")}>
                <Select value={parentId || parents[0].id} onChange={setParentId}>
                  {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </Field>
            )}
            {student && parents.length === 0 && <p className="text-sm text-bad">{t("Bu o'quvchiga ota-ona biriktirilmagan")}</p>}
          </>
        )}
        <Field label={t("Xabar")}>
          <textarea className={textareaCls} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} />
        </Field>
      </div>
    </Modal>
  );
}

export function ThreadView({ threadId }: { threadId: string }) {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const u = app.currentUser!;
  const th = app.thread(threadId);
  const messages = th ? app.messagesOf(th.id) : [];
  const unread = th ? app.unreadInThread(th.id, u.id) : 0;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (th && unread > 0) void run(() => app.run("thread.read", { threadId: th.id }));
  }, [th, unread, app, run]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  if (!th) return <Card><EmptyState icon={MessagesSquare} title={t("Yozishma topilmadi")} /></Card>;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    const ok = await run(() => app.run("message.send", { studentId: th.studentId, teacherId: th.teacherId, parentId: th.parentId, text }));
    if (ok) setText("");
    setBusy(false);
  };

  return (
    <div className="flex min-h-[calc(100dvh-170px)] flex-col">
      <div className="flex flex-1 flex-col gap-1.5 pb-4">
        {messages.map((m, i) => {
          const mine = m.senderId === u.id;
          const d = dayKey(m.time);
          const showDay = i === 0 || d !== dayKey(messages[i - 1].time);
          return (
            <div key={m.id} className="flex flex-col">
              {showDay && <div className="my-3 self-center rounded-full bg-surface-2 px-3 py-1 text-xs text-muted">{d === app.today ? t("Bugun") : fmt.date(d)}</div>}
              <div className={cx("max-w-[82%] rounded-2xl px-3.5 py-2 text-[15px] leading-snug whitespace-pre-wrap", mine ? "self-end rounded-br-md bg-primary text-white dark:text-nav" : "self-start rounded-bl-md border border-line bg-surface")}>
                {m.text}
                <span className={cx("tabular mt-0.5 block text-right text-[11px]", mine ? "text-white/70 dark:text-nav/70" : "text-muted")}>
                  {fmt.time(m.time)}{mine && m.readBy.length > 1 && " ✓✓"}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <form onSubmit={send} className="sticky bottom-24 flex items-end gap-2 rounded-2xl border border-line bg-surface p-2 md:bottom-4">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={2000} placeholder={t("Xabar yozing…")} aria-label={t("Xabar")}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none" />
        <button type="submit" disabled={busy || !text.trim()} className={cx(btn.primary, "size-10 shrink-0 rounded-xl px-0")} aria-label={t("Yuborish")}>
          <Send size={18} aria-hidden />
        </button>
      </form>
    </div>
  );
}

export function useThreadTitle({ threadId }: { threadId: string }) {
  const app = useApp();
  const t = useT();
  const u = app.currentUser;
  const th = app.thread(threadId);
  if (!th || !u) return { title: t("Yozishma"), subtitle: undefined };
  const other = app.userById(u.role === "parent" ? th.teacherId : th.parentId);
  const s = app.student(th.studentId);
  return {
    title: other?.name ?? t("Yozishma"),
    subtitle: u.role === "parent" ? `${other?.subjects.join(", ") || t("sinf rahbari")} · ${s?.name}` : `${s?.name}, ${app.schoolClass(s?.classId ?? "")?.name} · ${other?.phone ? fmt.phone(other.phone) : ""}`,
  };
}

