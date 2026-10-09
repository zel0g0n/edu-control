"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ListChecks, RefreshCw, RotateCcw, ScanFace, Smartphone, Trash2, UserCheck, X } from "lucide-react";
import { arrivalStatus, type AttendanceStatus, type Student } from "@edunazorat/shared";

import { CameraStage, faceSnapshot, type CameraStageHandle, type CapturedFrame } from "@/components/camera-stage";
import { useRun, useToast } from "@/components/providers";
import { useRouteParam } from "@/components/route-param";
import { Avatar, btn, cx, EmptyState, Modal } from "@/components/ui";
import { setAttendanceDraft, type PendingMark } from "@/lib/attendance-draft";
import { useApp } from "@/lib/data/store";
import { faceWorker } from "@/lib/face/client";
import { FACE } from "@/lib/face/config";
import { FaceGallery, Tracker, type Track } from "@/lib/face/matcher";
import { SceneScanner } from "@/lib/face/scanner";
import { eyeDistance, yawRatio, type Detection } from "@/lib/face/yunet";
import { fmt } from "@/lib/format";
import { useT } from "@/lib/i18n/react";

type Kind = "confirmed" | "checking" | "review" | "photo" | "unknown" | "small" | "turned";

interface FaceView {
  kind: Kind;
  det: Detection;
  frame: CapturedFrame;
  track: Track;
  studentId?: string;
  score?: number;
}

interface Recognized {
  /** Faqat shu o'quvchining yuz kesimi (qo'lda belgilanganda yo'q). */
  snapshot?: string;
  score?: number;
  byTeacher: boolean;
  trackId?: number;
  /** Birinchi aniqlangan vaqt: "kechikdi" shu bo'yicha hisoblanadi. */
  at: number;
}

/** "Kamila Karimova" -> "Kamila K." (kadrda kichik yozuv uchun). */
const shortName = (name?: string) => {
  if (!name) return "";
  const [a, b] = name.split(" ");
  return b ? `${a} ${b[0]}.` : a;
};

/**
 * Kamera orqali davomat: o'qituvchi butun sinfni jonli kuzatadi (yozilmaydi).
 * Kadr bo'laklarga bo'lib tekshiriladi, shuning uchun orqa partalardagi
 * kichik yuzlar ham topiladi. Tanilgan o'quvchi yashil doira va boshi
 * ustida ismi bilan belgilanadi; davomat hisoboti kuzatuv davomida yig'iladi.
 */
export function CameraClient() {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const router = useRouter();
  const toast = useToast();
  const lessonId = useRouteParam("id");
  const lesson = app.lesson(lessonId);
  const settings = app.myInstitution?.settings;
  const stage = useRef<CameraStageHandle>(null);
  const [students] = useState<Student[]>(() => (lesson ? app.studentsOfClass(lesson.classId) : []));
  const [gallery] = useState(() => new FaceGallery(
    Object.fromEntries(students.filter((s) => s.parentConsent).map((s) => [s.id, s.faceTemplates])),
    { match: settings?.matchThreshold ?? FACE.matchThreshold, review: settings?.reviewThreshold ?? FACE.reviewThreshold, margin: FACE.minMargin },
  ));
  const livenessOn = settings?.faceLiveness !== false;
  const tracker = useRef(new Tracker());
  const scanner = useRef(new SceneScanner(FACE.tileSize, 0.2, 3, FACE.cycleTargetMs));
  const recognizedRef = useRef(new Map<string, Recognized>());
  const [recognized, setRecognized] = useState<Map<string, Recognized>>(new Map());
  const [views, setViews] = useState<FaceView[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorText, setErrorText] = useState("");
  const [stats, setStats] = useState({ faces: 0, tiles: 0, ms: 0 });
  const pausedRef = useRef(false);
  const [dialog, setDialog] = useState<{ type: "review" | "assign" | "confirmed"; view: FaceView; preview: string } | null>(null);
  const [finish, setFinish] = useState(false);
  const [saving, setSaving] = useState(false);
  const [portraitHint, setPortraitHint] = useState(false);

  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const student = useCallback((id: string) => byId.get(id), [byId]);
  const enrolled = students.filter((s) => s.parentConsent && s.faceTemplates.length > 0).length;

  const publish = () => setRecognized(new Map(recognizedRef.current));

  const confirm = useCallback((sid: string, v: { det: Detection; frame: CapturedFrame; track?: Track } | null, score: number | undefined, byTeacher: boolean) => {
    const prev = recognizedRef.current.get(sid);
    if (prev?.trackId !== undefined && prev.trackId !== v?.track?.id) tracker.current.forget(sid);
    recognizedRef.current.set(sid, {
      snapshot: v ? faceSnapshot(v.frame.canvas, v.det) : prev?.snapshot,
      score,
      byTeacher,
      trackId: v?.track?.id,
      at: prev?.at ?? Date.now(),
    });
    if (v?.track) {
      v.track.confirmedId = sid;
      v.track.byTeacher = byTeacher;
    }
    if (!prev && "vibrate" in navigator) navigator.vibrate?.(25);
    publish();
  }, []);

  // Telefon tik turgan bo'lsa: yotqizish maslahati (butun sinf sig'ishi uchun).
  useEffect(() => {
    const check = () => setPortraitHint(window.innerWidth < 900 && window.innerHeight > window.innerWidth);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    faceWorker.init().then(() => setStatus("ready")).catch((e: Error) => {
      setStatus("error");
      setErrorText(e.message);
    });
  }, []);

  // Asosiy sikl: kadr -> (butun kadr + bo'laklar) -> kuzatish -> tanish.
  useEffect(() => {
    if (status !== "ready") return;
    let alive = true;
    let cycle = 0;
    (async () => {
      while (alive) {
        const started = performance.now();
        if (!pausedRef.current) {
          const frame = stage.current?.capture();
          if (frame) {
            try {
              await processFrame(frame);
            } catch (e) {
              console.warn("Kadrni qayta ishlashda xato", e);
            }
          }
        }
        const wait = Math.max(16, FACE.frameIntervalMs - (performance.now() - started));
        await new Promise((r) => setTimeout(r, wait));
      }
    })();

    async function processFrame(frame: CapturedFrame) {
      cycle++;
      const plan = scanner.current.plan(frame.image.width, frame.image.height);
      const res = await faceWorker.detectRegions(frame.image, plan.regions, true);
      if (!alive || pausedRef.current) return;
      const { detections: dets, fresh } = scanner.current.absorb(res.full, res.perRegion, plan.indices, res.ms);
      const tracks = tracker.current.update(dets);
      const visible = new Set(tracks.map((tr) => tr.id));
      const next: FaceView[] = [];
      const candidates: number[] = [];

      dets.forEach((det, i) => {
        const tr = tracks[i];
        const base = { det, frame, track: tr };
        if (tr.confirmedId && recognizedRef.current.has(tr.confirmedId)) {
          next.push({ ...base, kind: "confirmed", studentId: tr.confirmedId });
        } else if (eyeDistance(det) < FACE.minEyeDistancePx) {
          next.push({ ...base, kind: "small" });
        } else if (Math.abs(yawRatio(det)) > FACE.maxYaw) {
          next.push({ ...base, kind: "turned" });
        } else {
          if (fresh.has(det)) candidates.push(i);
          const kind: Kind = tr.last.level === "review" ? "review" : tr.last.level === "confident" && tr.last.studentId ? "checking" : "unknown";
          next.push({ ...base, kind, studentId: tr.last.studentId ?? undefined, score: tr.last.score });
        }
      });

      if (!gallery.isEmpty && candidates.length) {
        // Navbat: uzoq vaqt tekshirilmaganlar birinchi, keyin kattaroqlari.
        candidates.sort((a, b) => tracks[a].lastEmbed - tracks[b].lastEmbed || dets[b].box[2] - dets[a].box[2]);
        const batch = candidates.slice(0, FACE.maxEmbeddingsPerFrame);
        const embs = await faceWorker.embed(batch.map((i) => dets[i].kps));
        if (!alive || pausedRef.current) return;
        batch.forEach((i, k) => {
          const tr = tracks[i];
          const det = dets[i];
          tr.lastEmbed = cycle;
          // Shu payt boshqa ko'rinib turgan yuzga biriktirilgan o'quvchilar chiqarib tashlanadi.
          const exclude = new Set<string>();
          for (const [sid, r] of recognizedRef.current) if (r.trackId !== undefined && r.trackId !== tr.id && visible.has(r.trackId)) exclude.add(sid);
          // Kadrlar bo'yicha o'rtacha namuna bilan solishtiriladi.
          const mean = tr.addEmbedding(embs[k]);
          const eye = eyeDistance(det);
          const r = gallery.match(mean, exclude, eye < FACE.smallFaceEyePx && tr.samples >= 3);
          const requireLive = livenessOn && eye >= FACE.livenessMinEyePx;
          const already = r.studentId ? recognizedRef.current.get(r.studentId) : undefined;
          // Avval tanilgan o'quvchi qayta ko'rinsa (kamera aylantirilganda): bitta ishonchli moslik yetadi.
          const votes = already && !already.byTeacher ? 1 : eye < FACE.smallFaceEyePx ? FACE.smallFaceVotes : FACE.votesToConfirm;
          const newly = tr.add(r, requireLive, votes);
          const view = next.find((v) => v.track === tr)!;
          if (newly && !recognizedRef.current.get(newly)?.byTeacher) {
            confirm(newly, view, r.score, false);
            Object.assign(view, { kind: "confirmed", studentId: newly, score: r.score });
          } else if (newly) {
            tr.confirmedId = newly;
            Object.assign(view, { kind: "confirmed", studentId: newly, score: r.score });
          } else if (requireLive && r.level === "confident" && tr.votesFor(r.studentId!) >= votes) {
            Object.assign(view, { kind: tr.liveness.state === "static" ? "photo" : "checking", studentId: r.studentId ?? undefined, score: r.score });
          } else {
            Object.assign(view, {
              kind: r.level === "unknown" ? "unknown" : r.level === "confident" ? "checking" : "review",
              studentId: r.studentId ?? undefined,
              score: r.score,
            });
          }
        });
      }
      if (alive && !pausedRef.current) {
        setViews(next);
        setStats({ faces: dets.length, tiles: scanner.current.tilesPerCycle, ms: Math.round(res.ms) });
      }
    }

    return () => {
      alive = false;
    };
  }, [status, gallery, confirm, livenessOn]);

  const openFor = (v: FaceView) => {
    if (v.kind === "small") return toast(t("Yuz juda kichik: ikki barmoq bilan yaqinlashtiring"));
    if (v.kind === "turned") return toast(t("O'quvchi kameraga qarashini kuting"));
    pausedRef.current = true;
    const type = v.kind === "confirmed" ? "confirmed" : (v.kind === "review" || v.kind === "photo" || v.kind === "checking") && v.studentId ? "review" : "assign";
    setDialog({ type, view: v, preview: faceSnapshot(v.frame.canvas, v.det) });
  };
  const closeDialog = () => {
    setDialog(null);
    pausedRef.current = false;
  };

  /** Belgini olib tashlash; `reassign` bo'lsa o'quvchi tanlash oynasi ochiladi. */
  const removeRecognized = (sid: string, reassign: boolean) => {
    recognizedRef.current.delete(sid);
    tracker.current.forget(sid);
    publish();
    if (reassign && dialog) setDialog({ ...dialog, type: "assign" });
    else closeDialog();
  };

  /** Hisobot panelidan qo'lda "keldi" (kamera ko'rmagan o'quvchi). */
  const toggleManual = (sid: string) => {
    if (recognizedRef.current.has(sid)) {
      recognizedRef.current.delete(sid);
      tracker.current.forget(sid);
    } else {
      recognizedRef.current.set(sid, { byTeacher: true, at: Date.now() });
    }
    publish();
  };

  const statusAt = (at: number): AttendanceStatus => (lesson ? arrivalStatus(lesson, app.today, at, settings?.lateAfterMinutes ?? 10) : "present");

  /** Yo'qlamada tekshirish: natijalar yo'qlama sahifasiga o'tadi. */
  const toRollcall = () => {
    if (!lesson) return;
    const marks: Record<string, PendingMark> = {};
    for (const [sid, r] of recognizedRef.current) {
      marks[sid] = { status: statusAt(r.at), source: r.snapshot ? "face" : "manual", snapshot: r.snapshot, score: r.byTeacher ? undefined : r.score };
    }
    setAttendanceDraft(lesson.id, marks);
    router.push(`/teacher/lesson/${lesson.id}/rollcall`);
  };

  /** To'g'ridan-to'g'ri saqlash: tanilganlar keldi, qolganlar kelmadi. */
  const saveNow = async () => {
    if (!lesson) return;
    setSaving(true);
    const marks = students.map((s) => {
      const r = recognizedRef.current.get(s.id);
      return r
        ? { studentId: s.id, status: statusAt(r.at), source: (r.snapshot ? "face" : "manual") as "face" | "manual", snapshot: r.snapshot, score: r.byTeacher ? undefined : r.score }
        : { studentId: s.id, status: "absent" as const, source: "manual" as const };
    });
    const ok = await run(() => app.run("attendance.mark", { lessonId: lesson.id, day: app.today, marks }));
    setSaving(false);
    if (!ok) return;
    toast(t("Davomat saqlandi: {p}/{n} keldi. Ota-onalarga xabar yuborildi", { p: recognizedRef.current.size, n: students.length }), "ok");
    router.replace(`/teacher/lesson/${lesson.id}`);
  };

  if (!lesson) return <EmptyState icon={ScanFace} title={t("Dars topilmadi")} />;

  const present = students.filter((s) => recognized.has(s.id));
  const missing = students.filter((s) => !recognized.has(s.id));
  const confirmedId = dialog?.type === "confirmed" ? dialog.view.studentId : undefined;
  const confirmedRec = confirmedId ? recognized.get(confirmedId) : undefined;

  const report = (
    <ReportPanel
      students={students}
      recognized={recognized}
      onToggle={toggleManual}
      present={present.length}
      lessonStart={lesson.start}
      note={enrolled > 0 && enrolled < students.length ? t("Yuz namunasi bor: {n}/{total}. Qolganlarini ro'yxatdan \"keldi\" deb belgilang.", { n: enrolled, total: students.length }) : undefined}
    />
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <header className="flex items-center gap-3 px-3 pt-[max(env(safe-area-inset-top),10px)] pb-2 landscape:max-lg:pt-1.5 landscape:max-lg:pb-1.5">
        <Link href={`/teacher/lesson/${lesson.id}`} className="flex size-11 items-center justify-center rounded-full hover:bg-white/10" aria-label={t("Orqaga")}>
          <ChevronLeft size={26} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-bold">{app.schoolClass(lesson.classId)?.name} · {lesson.subject}</div>
          <div className="truncate text-xs text-white/60">
            {status === "ready" ? t("Jonli kuzatuv · {f} yuz · {k} bo'lak/sikl", { f: stats.faces, k: stats.tiles + 1 }) : t("Yuz tanish modeli yuklanmoqda…")}
          </div>
        </div>
        <div className="tabular rounded-full bg-emerald-500/20 px-3 py-1 text-lg font-bold text-emerald-300" aria-live="polite">
          {present.length}<span className="text-white/60">/{students.length}</span>
        </div>
      </header>

      {portraitHint && (
        <button type="button" onClick={() => setPortraitHint(false)}
          className="mx-3 mb-2 flex items-center gap-2 rounded-lg bg-white/8 px-3 py-1.5 text-left text-xs text-white/80">
          <Smartphone size={15} className="shrink-0 rotate-90" aria-hidden />
          <span className="flex-1">{t("Butun sinf sig'ishi uchun telefonni yotqizing")}</span>
          <X size={14} aria-hidden />
        </button>
      )}
      {enrolled === 0 && (
        <div className="mx-3 mb-2 rounded-xl bg-amber-600/25 p-2.5 text-[12.5px] leading-snug">
          {t("Sinfda hech kimning yuz namunasi yo'q. Avval \"Sinflar\" bo'limida yuzlarni ro'yxatga oling. Hozircha doirani bosib o'quvchini qo'lda tanlashingiz mumkin.")}
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-3 px-3 pb-[max(env(safe-area-inset-bottom),10px)] portrait:max-lg:flex-col">
        <CameraStage ref={stage} fit="contain" onZoom={() => scanner.current.reset()}
          className="min-h-0 flex-1 rounded-2xl portrait:max-lg:aspect-video portrait:max-lg:flex-none">
          {status === "loading" && (
            <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
              <span className="rounded-full bg-black/60 px-3 py-1.5 text-sm">{t("Yuz tanish modeli yuklanmoqda…")}</span>
            </div>
          )}
          {status === "error" && (
            <div className="pointer-events-none absolute inset-x-6 top-3 rounded-xl bg-red-700/80 p-3 text-sm">
              {t("Yuz tanish ishga tushmadi: {e}. Yo'qlama orqali davom eting.", { e: errorText })}
            </div>
          )}
          <div className="pointer-events-none absolute inset-0">
            {views.map((v) => (
              <FaceCircle key={v.track.id} view={v} name={v.studentId ? shortName(student(v.studentId)?.name) : undefined} onTap={() => openFor(v)} />
            ))}
          </div>
        </CameraStage>
        {/* Hisobot: keng ekranda yonida, telefon tik turganda kamera ostida */}
        <aside className="flex w-72 shrink-0 flex-col overflow-hidden rounded-2xl bg-white/[0.06] landscape:max-lg:w-64 portrait:max-lg:min-h-0 portrait:max-lg:w-auto portrait:max-lg:flex-1">
          {report}
          <div className="p-3 pt-0">
            <button type="button" className={cx(btn.primary, "h-11 w-full")} onClick={() => setFinish(true)}>
              <ListChecks size={19} aria-hidden /> {t("Yakunlash")}
            </button>
          </div>
        </aside>
      </div>

      <Modal open={finish} onClose={() => setFinish(false)} title={t("Davomatni yakunlash")}
        footer={<>
          <button type="button" className={btn.outline} onClick={() => { setFinish(false); toRollcall(); }}><ListChecks size={17} aria-hidden /> {t("Yo'qlamada tekshirish")}</button>
          <button type="button" className={btn.primary} disabled={saving} onClick={saveNow}>{t("Saqlash")}</button>
        </>}>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-ok/10 p-3"><div className="text-xs text-muted">{t("Keldi")}</div><div className="tabular text-2xl font-bold text-ok">{present.length}</div></div>
          <div className="rounded-xl bg-bad/10 p-3"><div className="text-xs text-muted">{t("Kelmadi deb saqlanadi")}</div><div className="tabular text-2xl font-bold text-bad">{missing.length}</div></div>
        </div>
        {missing.length > 0 && (
          <p className="mt-3 text-sm text-muted">{missing.map((s) => s.name).join(", ")}</p>
        )}
        <p className="mt-3 text-xs text-muted">{t("Kechikib kelganlar dars boshlanganidan keyingi aniqlangan vaqti bo'yicha \"kechikdi\" bo'ladi. Ota-onalarga xabar boradi.")}</p>
      </Modal>

      {dialog?.type === "review" && dialog.view.studentId && (
        <Modal open onClose={closeDialog} title={t("Bu {name}mi?", { name: student(dialog.view.studentId)?.name ?? "" })}>
          <div className="flex justify-center gap-3">
            <Avatar name="" image={dialog.preview} size={110} />
            {student(dialog.view.studentId)?.facePhoto && <Avatar name="" image={student(dialog.view.studentId)!.facePhoto} size={110} />}
          </div>
          <p className="mt-2 text-center text-xs text-muted">
            {student(dialog.view.studentId)?.facePhoto ? t("Chapda: hozirgi kadr, o'ngda: ro'yxatdagi namuna") : t("Moslik: {p}%", { p: Math.round((dialog.view.score ?? 0) * 100) })}
          </p>
          {dialog.view.kind === "photo" && (
            <p className="mt-3 rounded-lg bg-warn/12 px-3 py-2 text-sm text-warn">{t("Yuz qimirlamayapti: bu rasm yoki telefon ekrani bo'lishi mumkin. O'quvchi haqiqatan sinfdaligini tekshiring.")}</p>
          )}
          {dialog.view.kind === "checking" && (
            <p className="mt-3 text-center text-xs text-muted">{t("Jonlilik tekshirilmoqda: o'quvchi boshini biroz qimirlatsa, avtomatik tasdiqlanadi")}</p>
          )}
          <div className="mt-6 grid grid-cols-2 gap-2">
            <button type="button" className={btn.outline} onClick={() => setDialog({ ...dialog, type: "assign" })}>{t("Boshqa o'quvchi")}</button>
            <button type="button" className={btn.primary} onClick={() => { confirm(dialog.view.studentId!, dialog.view, dialog.view.score, true); closeDialog(); }}>{t("Ha")}</button>
          </div>
        </Modal>
      )}

      {dialog?.type === "assign" && (
        <Modal open onClose={closeDialog} title={t("Bu kim?")}>
          <div className="mb-3 flex justify-center"><Avatar name="" image={dialog.preview} size={96} /></div>
          {missing.length === 0 ? (
            <EmptyState icon={ScanFace} title={t("Barcha o'quvchilar belgilangan")} />
          ) : (
            <div className="flex flex-col">
              {missing.map((s) => (
                <button key={s.id} type="button" className="flex items-center gap-3 rounded-xl p-2.5 text-left hover:bg-surface-2"
                  onClick={() => { confirm(s.id, dialog.view, undefined, true); closeDialog(); }}>
                  <Avatar name={s.name} image={s.facePhoto} />
                  <span className="flex-1">
                    <span className="block font-semibold">{s.name}</span>
                    {dialog.view.studentId === s.id && dialog.view.score !== undefined && (
                      <span className="block text-xs text-muted">{t("Taxminiy moslik: {p}%", { p: Math.round(dialog.view.score * 100) })}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}

      {dialog?.type === "confirmed" && confirmedId && (
        <Modal open onClose={closeDialog} title={student(confirmedId)?.name}>
          <div className="flex flex-col items-center gap-1">
            {confirmedRec?.snapshot && <Avatar name="" image={confirmedRec.snapshot} size={110} />}
            <p className="text-sm text-muted">
              {confirmedRec?.byTeacher ? t("O'qituvchi tasdiqlagan") : t("Avtomatik tanildi · {p}%", { p: Math.round((confirmedRec?.score ?? 0) * 100) })}
            </p>
          </div>
          <div className="mt-5 flex flex-col gap-2">
            <button type="button" className={btn.outline} onClick={() => removeRecognized(confirmedId, true)}>
              <RefreshCw size={18} /> {t("Bu boshqa o'quvchi")}
            </button>
            <button type="button" className={cx(btn.outline, "text-bad")} onClick={() => removeRecognized(confirmedId, false)}>
              <Trash2 size={18} /> {t("Belgini olib tashlash")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Kuzatuv davomida yig'ilayotgan davomat hisoboti. */
function ReportPanel({
  students, recognized, onToggle, present, lessonStart, note,
}: {
  students: Student[];
  recognized: Map<string, Recognized>;
  onToggle: (sid: string) => void;
  present: number;
  lessonStart: string;
  note?: string;
}) {
  const t = useT();
  const missing = students.filter((s) => !recognized.has(s.id));
  const got = students.filter((s) => recognized.has(s.id)).sort((a, b) => recognized.get(b.id)!.at - recognized.get(a.id)!.at);
  const pct = students.length ? present / students.length : 0;
  return (
    <div className="flex max-h-[70dvh] min-h-0 flex-1 flex-col lg:max-h-none">
      <div className="px-4 pt-3 pb-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold">{t("Davomat hisoboti")}</span>
          <span className="tabular text-xs opacity-70">{t("dars {t}", { t: lessonStart })}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-current/15">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct * 100}%` }} />
        </div>
        <div className="tabular mt-1.5 flex justify-between text-xs">
          <span className="font-semibold text-emerald-500">{t("Keldi: {n}", { n: present })}</span>
          <span className="opacity-70">{t("Aniqlanmagan: {n}", { n: missing.length })}</span>
        </div>
        {note && <p className="mt-2 rounded-lg bg-amber-500/15 px-2.5 py-1.5 text-[11.5px] leading-snug">{note}</p>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {missing.length > 0 && (
          <>
            <div className="px-2 pt-1 pb-1 text-[11px] font-semibold tracking-wide uppercase opacity-60">{t("Aniqlanmagan")}</div>
            {missing.map((s) => (
              <button key={s.id} type="button" onClick={() => onToggle(s.id)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-current/10">
                <Avatar name={s.name} image={s.facePhoto} size={30} tone="slate" />
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="flex items-center gap-1 rounded-md bg-current/10 px-1.5 py-0.5 text-[11px]"><UserCheck size={12} aria-hidden />{t("keldi")}</span>
              </button>
            ))}
          </>
        )}
        {got.length > 0 && (
          <>
            <div className="px-2 pt-3 pb-1 text-[11px] font-semibold tracking-wide uppercase opacity-60">{t("Keldi")}</div>
            {got.map((s) => {
              const r = recognized.get(s.id)!;
              return (
                <div key={s.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm">
                  <span className="rounded-full bg-emerald-500 p-0.5"><Avatar name={s.name} image={r.snapshot ?? s.facePhoto} size={28} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{s.name}</span>
                    <span className="tabular block text-[11px] opacity-60">{fmt.time(r.at)} · {r.byTeacher && !r.snapshot ? t("qo'lda") : r.byTeacher ? t("tasdiqlandi") : t("kamera")}</span>
                  </span>
                  {r.byTeacher && !r.snapshot && (
                    <button type="button" onClick={() => onToggle(s.id)} aria-label={t("Belgini olib tashlash")} className="rounded-md p-1 opacity-60 hover:bg-current/10 hover:opacity-100">
                      <RotateCcw size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

const RING: Record<Kind, string> = {
  confirmed: "border-emerald-400 bg-emerald-400/10 border-[2.5px]",
  checking: "border-emerald-300 border-dashed border-2",
  review: "border-amber-400 border-[2.5px]",
  photo: "border-amber-400 border-dashed border-[2.5px]",
  unknown: "border-white/90 border-2",
  small: "border-white/50 border-dashed border",
  turned: "border-white/50 border-dashed border",
};
const LABEL_BG: Record<Kind, string> = {
  confirmed: "bg-emerald-600 text-white",
  checking: "bg-emerald-200 text-black",
  review: "bg-amber-400 text-black",
  photo: "bg-amber-400 text-black",
  unknown: "bg-white text-black",
  small: "",
  turned: "",
};

/** Yuz doirasi: tanilgan o'quvchining ismi boshi ustida kichik yozuv bilan. */
function FaceCircle({ view: v, name, onTap }: { view: FaceView; name?: string; onTap: () => void }) {
  const t = useT();
  const [x, y, w, h] = v.det.box;
  const [ax, ay] = v.frame.toScreen(x, y);
  const [bx, by] = v.frame.toScreen(x + w, y + h);
  const cx0 = (ax + bx) / 2;
  const cy0 = (ay + by) / 2;
  const d = Math.max(14, Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 1.1);
  const hit = Math.max(36, d);
  const small = d < 40;
  const label = v.kind === "confirmed" ? name
    : v.kind === "checking" ? (name ? `${name}…` : null)
      : v.kind === "photo" ? t("{name}: rasmmi?", { name: name ?? "" })
        : v.kind === "review" ? (name ? `${name}?` : "?")
          : null;
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={label ?? t("Yuz")}
      className="pointer-events-auto absolute flex items-center justify-center"
      style={{ left: cx0 - hit / 2, top: cy0 - hit / 2, width: hit, height: hit }}
    >
      <span className={cx("rounded-full transition-all duration-150", RING[v.kind])} style={{ width: d, height: d }} />
      {label && (
        <span
          className={cx("absolute left-1/2 max-w-[140px] -translate-x-1/2 truncate rounded px-1 leading-tight font-semibold whitespace-nowrap shadow", small ? "text-[9.5px]" : "text-[11px]", LABEL_BG[v.kind])}
          style={{ bottom: hit / 2 + d / 2 + 2 }}
        >
          {label}
        </span>
      )}
    </button>
  );
}
