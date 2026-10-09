"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, ChevronLeft, ChevronRight, List, ScanFace, User } from "lucide-react";
import { isPresent, type AttendanceStatus, type Student } from "@edunazorat/shared";

import { useRun, useToast } from "@/components/providers";
import { useQueryParam } from "@/components/query";
import { useRouteParam } from "@/components/route-param";
import { PageBody, PageHeader } from "@/components/shell";
import { ATT_TONE, Avatar, btn, Card, cx, EmptyState, Modal, Pill, toneSolid } from "@/components/ui";
import { clearAttendanceDraft, getAttendanceDraft, type PendingMark } from "@/lib/attendance-draft";
import { useApp } from "@/lib/data/store";
import { useT } from "@/lib/i18n/react";

const STATUSES: AttendanceStatus[] = ["present", "absent", "late", "excused"];

export function RollCallClient() {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const toast = useToast();
  const router = useRouter();
  const lessonId = useRouteParam("id");
  const day = useQueryParam("day") ?? app.today;
  const lesson = app.lesson(lessonId);

  // Bir martalik boshlang'ich holat: shu darsdagi yozuvlar + kamera natijalari.
  const [init] = useState(() => {
    const draft = day === app.today ? getAttendanceDraft(lessonId) : undefined;
    const students = lesson ? app.studentsOfClass(lesson.classId) : [];
    const marks: Record<string, PendingMark> = {};
    for (const s of students) {
      const rec = lesson ? app.attendanceRecord(s.id, lesson.id, day) : undefined;
      if (rec) marks[s.id] = { status: rec.status, source: rec.source, snapshot: rec.snapshot, score: rec.matchScore };
    }
    Object.assign(marks, draft ?? {});
    // Kameradan kelganda: tanilmaganlar oldinda.
    if (draft) students.sort((a, b) => Number(!!draft[a.id]) - Number(!!draft[b.id]) || a.name.localeCompare(b.name));
    const first = students.findIndex((s) => !marks[s.id]);
    return { students, marks, fromCamera: !!draft, first: first < 0 ? 0 : first };
  });
  const students = init.students;
  const [marks, setMarks] = useState(init.marks);
  const [index, setIndex] = useState(init.first);
  const [oneByOne, setOneByOne] = useState(!init.fromCamera || students.length - Object.keys(init.marks).length <= 8);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!lesson) return <EmptyState icon={User} title={t("Dars topilmadi")} />;
  const markedCount = students.filter((s) => marks[s.id]).length;
  const faceCount = Object.values(marks).filter((m) => m.source === "face").length;

  const mark = (s: Student, status: AttendanceStatus) => {
    const prev = marks[s.id];
    // Qo'lda o'zgartirilsa manba "qo'lda" bo'ladi; kelmagan o'quvchiga yuz kesimi yuborilmaydi
    const changed = !prev || prev.status !== status;
    const keepFace = prev && !changed;
    const snapshot = isPresent(status) ? prev?.snapshot : undefined;
    const next = { ...marks, [s.id]: keepFace ? prev : { status, source: "manual" as const, snapshot } };
    setMarks(next);
    if (oneByOne && s.id === students[index]?.id) {
      // Keyingi belgilanmaganga; hammasi belgilangan bo'lsa (tuzatish) shunchaki keyingisiga
      for (let i = 1; i < students.length; i++) {
        const k = (index + i) % students.length;
        if (!next[students[k].id]) return setIndex(k);
      }
      if (index < students.length - 1) setIndex(index + 1);
    }
  };

  const allPresent = () => {
    const next = { ...marks };
    for (const s of students) if (!next[s.id]) next[s.id] = { status: "present", source: "manual" };
    setMarks(next);
  };

  const save = async (fillAbsent: boolean) => {
    const final = { ...marks };
    if (fillAbsent) for (const s of students) if (!final[s.id]) final[s.id] = { status: "absent", source: "manual" };
    const list = students.filter((s) => final[s.id]);
    setBusy(true);
    const ok = await run(() => app.run("attendance.mark", {
      lessonId: lesson.id, day,
      marks: list.map((s) => ({ studentId: s.id, status: final[s.id].status, source: final[s.id].source, snapshot: final[s.id].snapshot, score: final[s.id].score })),
    }));
    setBusy(false);
    if (!ok) return;
    const present = list.filter((s) => isPresent(final[s.id].status)).length;
    clearAttendanceDraft(lessonId);
    toast(t("Davomat saqlandi: {p}/{n} keldi. Ota-onalarga xabar yuborildi", { p: present, n: students.length }), "ok");
    router.replace(`/teacher/lesson/${lessonId}${day === app.today ? "" : `?day=${day}`}`);
  };

  const s = students[index];
  const m = s ? marks[s.id] : undefined;
  const face = (st: Student, size: number) => {
    const img = marks[st.id]?.snapshot ?? st.facePhoto;
    const ring = marks[st.id] ? ATT_TONE[marks[st.id].status] : undefined;
    return <Avatar name={st.name} image={img} size={size} ring={ring === "slate" || ring === "info" ? "primary" : ring} />;
  };
  const statusLabel = (st: AttendanceStatus) => t(`att.${st}`);

  return (
    <>
      <PageHeader
        back={`/teacher/lesson/${lessonId}${day === app.today ? "" : `?day=${day}`}`}
        title={init.fromCamera ? t("Davomatni yakunlash") : t("Yo'qlama")}
        subtitle={`${app.schoolClass(lesson.classId)?.name} · ${lesson.subject} · ${lesson.start}`}
        actions={
          <>
            <button type="button" className={btn.sm} onClick={allPresent}><CheckCheck size={16} aria-hidden /> {t("Qolganlar keldi")}</button>
            <button type="button" className={btn.icon} onClick={() => setOneByOne(!oneByOne)} aria-label={oneByOne ? t("Ro'yxat ko'rinishi") : t("Birma-bir")}>
              {oneByOne ? <List size={21} /> : <User size={21} />}
            </button>
          </>
        }
      />
      <div className="h-1 bg-surface-2">
        <div className="h-full bg-primary transition-all" style={{ width: `${(markedCount / Math.max(1, students.length)) * 100}%` }} />
      </div>
      <PageBody className="pt-5 pb-32">
        {students.length === 0 ? <Card><EmptyState icon={User} title={t("Sinfda o'quvchi yo'q")} /></Card> : oneByOne && s ? (
          <div className="mx-auto max-w-md">
            <div className="flex items-center gap-2">
              <button type="button" className={cx(btn.icon, "bg-surface-2")} disabled={index === 0} onClick={() => setIndex(index - 1)} aria-label={t("Oldingi")}><ChevronLeft /></button>
              <div className="tabular flex-1 text-center text-sm text-muted">{index + 1} / {students.length}</div>
              <button type="button" className={cx(btn.icon, "bg-surface-2")} disabled={index >= students.length - 1} onClick={() => setIndex(index + 1)} aria-label={t("Keyingi")}><ChevronRight /></button>
            </div>
            <div className="mt-7 flex justify-center">{face(s, 128)}</div>
            <h2 className="mt-4 text-center text-2xl font-bold">{s.name}</h2>
            <div className="mt-2 flex justify-center">
              {m ? (
                <Pill tone={ATT_TONE[m.status]} icon={m.source === "face" ? ScanFace : undefined}>
                  {statusLabel(m.status)}{m.source === "face" ? ` · ${t("kamera")}` : ""}
                </Pill>
              ) : (
                <span className="text-sm text-muted">{t("belgilanmagan")}</span>
              )}
            </div>
            <div className="mt-8 grid grid-cols-2 gap-3">
              {STATUSES.map((st) => (
                <button key={st} type="button" aria-pressed={m?.status === st} onClick={() => mark(s, st)}
                  className={cx("h-16 rounded-2xl text-lg font-bold transition",
                    m?.status === st ? cx(toneSolid(ATT_TONE[st]), "shadow-sm") : "bg-surface-2 text-muted hover:text-ink active:brightness-95")}>
                  {statusLabel(st)}
                </button>
              ))}
            </div>
            {faceCount > 0 && (
              <Card className="mt-7 flex items-center gap-2.5 p-3 text-sm">
                <ScanFace size={20} className="shrink-0 text-primary" aria-hidden />
                {t("Kamera tanigan {n} o'quvchi allaqachon belgilangan", { n: faceCount })}
              </Card>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {students.map((st) => (
              <Card key={st.id} className="p-3">
                <div className="flex items-center gap-2.5">
                  {face(st, 38)}
                  <span className="flex-1 font-semibold">{st.name}</span>
                  {marks[st.id]?.source === "face" && <ScanFace size={18} className="text-primary" aria-label={t("kamera")} />}
                </div>
                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  {STATUSES.map((x) => (
                    <button key={x} type="button" aria-pressed={marks[st.id]?.status === x} onClick={() => mark(st, x)}
                      className={cx("rounded-lg px-1 py-1.5 text-xs transition", marks[st.id]?.status === x ? cx("font-bold", toneSolid(ATT_TONE[x])) : "bg-surface-2 text-muted hover:text-ink")}>
                      {statusLabel(x)}
                    </button>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </PageBody>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface p-4 pb-[max(env(safe-area-inset-bottom),16px)] md:left-[248px]">
        <div className="mx-auto max-w-3xl">
          <button type="button" className={cx(btn.primary, "h-12 w-full")} disabled={busy || students.length === 0}
            onClick={() => (markedCount < students.length ? setConfirm(true) : save(false))}>
            {t("Saqlash")} ({markedCount}/{students.length})
          </button>
        </div>
      </div>
      <Modal open={confirm} onClose={() => setConfirm(false)} title={t("{n} ta o'quvchi belgilanmagan", { n: students.length - markedCount })}
        footer={<>
          <button type="button" className={btn.outline} onClick={() => setConfirm(false)}>{t("Ortga")}</button>
          <button type="button" className={btn.primary} onClick={() => { setConfirm(false); void save(true); }}>{t("Ha, saqlash")}</button>
        </>}>
        <p className="text-muted">{t("Ular \"kelmadi\" deb saqlansinmi? Ota-onalariga xabar boradi.")}</p>
      </Modal>
    </>
  );
}
