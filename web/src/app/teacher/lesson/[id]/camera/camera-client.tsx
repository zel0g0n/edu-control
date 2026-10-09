"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronLeft, ChevronUp, Film, ListChecks, RefreshCw, RotateCcw, ScanFace, Smartphone, Trash2, UserCheck, X } from "lucide-react";
import { arrivalStatus, type AttendanceStatus, type Student } from "@edunazorat/shared";

import { CameraStage, faceSnapshot, type CameraStageHandle, type CapturedFrame } from "@/components/camera-stage";
import { useRun, useToast } from "@/components/providers";
import { useRouteParam } from "@/components/route-param";
import { Avatar, btn, cx, EmptyState, Modal } from "@/components/ui";
import { setAttendanceDraft, type PendingMark } from "@/lib/attendance-draft";
import { useApp } from "@/lib/data/store";
import { faceWorker } from "@/lib/face/client";
import { FACE, faceThresholds } from "@/lib/face/config";
import { FaceGallery, qualityWeight, Tracker, usableTemplates, type Track } from "@/lib/face/matcher";
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
  const thresholds = { ...faceThresholds(settings), margin: FACE.minMargin };
  const [gallery, setGallery] = useState(() => new FaceGallery(
    Object.fromEntries(students.filter((s) => s.parentConsent).map((s) => [s.id, usableTemplates(s)])),
    thresholds,
  ));
  /** Demo video: kamera o'rniga sun'iy yuzlardagi sinf videosi (faqat demo rejimda). */
  const [demo, setDemo] = useState<{ src: string; photos: Map<string, string> } | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  // Demo videodagi yuzlar tekis tasvir: jonlilik tekshiruvi ularni (to'g'ri) "rasm" deb biladi
  const livenessOn = settings?.faceLiveness !== false && !demo;
  const tracker = useRef(new Tracker());
  /** Bitta yuz namunasi o'rtacha necha ms (qurilma tezligi). */
  const embedMs = useRef(60);
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
  const [warnClosed, setWarnClosed] = useState(false);
  /** Yotiq telefon yoki keng ekran: hisobot o'ngda, aks holda pastdan chiquvchi panel. */
  const [side, setSide] = useState(false);
  /** Telefonda hisobot paneli: yig'iq (kamera to'liq ko'rinadi) yoki ochiq ro'yxat. */
  const [sheetOpen, setSheetOpen] = useState(false);
  const pendingRef = useRef(new Map<string, { view: FaceView; seen: number }>());
  const [pending, setPending] = useState<{ sid: string; view: FaceView }[]>([]);

  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const student = useCallback((id: string) => {
    const s = byId.get(id);
    // Demo: o'quvchi namunasi o'rnida videodagi sun'iy yuz
    return s && demo?.photos.has(id) ? { ...s, facePhoto: demo.photos.get(id) } : s;
  }, [byId, demo]);
  const enrolled = demo ? Object.values(gallery.templates).filter((t) => t.length > 0).length
    : students.filter((s) => s.parentConsent && usableTemplates(s).length > 0).length;

  /**
   * Demo: video fayldagi 8 ta sun'iy yuz shu sinf o'quvchilariga (alifbo bo'yicha) biriktiriladi.
   * Ma'lumotlar o'zgarmaydi: namunalar faqat shu oynada ishlatiladi. Bitta yuz videoda yo'q (kelmagan),
   * ikkita begona yuz esa ro'yxatda yo'q (tanilmasligi kerak).
   */
  const startDemo = async () => {
    setDemoLoading(true);
    try {
      const res = await fetch("/demo/sinf-demo.json");
      const data = (await res.json()) as { model: string; faces: { id: string; photo: string; templates: number[][] }[] };
      if (data.model !== FACE.modelId) throw new Error("model");
      const sorted = [...students].sort((a, b) => a.name.localeCompare(b.name));
      const templates: Record<string, number[][]> = {};
      const photos = new Map<string, string>();
      data.faces.forEach((f, i) => {
        const s = sorted[i];
        if (!s) return;
        templates[s.id] = f.templates;
        photos.set(s.id, f.photo);
      });
      recognizedRef.current.clear();
      pendingRef.current.clear();
      tracker.current = new Tracker();
      scanner.current.reset();
      publish();
      setPending([]);
      setGallery(new FaceGallery(templates, thresholds));
      const v = document.createElement("video");
      const src = v.canPlayType('video/webm; codecs="vp9"') ? "/demo/sinf-demo.webm" : "/demo/sinf-demo.mp4";
      setDemo({ src, photos });
      setWarnClosed(true);
    } catch {
      toast(t("Demo videoni yuklab bo'lmadi"));
    } finally {
      setDemoLoading(false);
    }
  };

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
    const check = () => {
      setPortraitHint(window.innerWidth < 900 && window.innerHeight > window.innerWidth);
      setSide(window.innerWidth >= 1024 || window.innerWidth > window.innerHeight);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const [loadPct, setLoadPct] = useState<number | null>(null);
  useEffect(() => faceWorker.onProgress((p) => setLoadPct(Math.round(p * 100))), []);

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
        // Sekin telefonda bir siklda kamroq yuz: kadrlar tezligi tushib ketmasin (qolganlari navbatda)
        const per = Math.max(2, Math.min(FACE.maxEmbeddingsPerFrame, Math.floor(FACE.embedBudgetMs / Math.max(1, embedMs.current))));
        const batch = candidates.slice(0, per);
        const te = performance.now();
        const embs = await faceWorker.embedWithQuality(batch.map((i) => dets[i].kps));
        embedMs.current = embedMs.current * 0.7 + ((performance.now() - te) / Math.max(1, batch.length)) * 0.3;
        if (!alive || pausedRef.current) return;
        batch.forEach((i, k) => {
          const tr = tracks[i];
          const det = dets[i];
          tr.lastEmbed = cycle;
          // Shu payt boshqa ko'rinib turgan yuzga biriktirilgan o'quvchilar chiqarib tashlanadi.
          const exclude = new Set<string>();
          for (const [sid, r] of recognizedRef.current) if (r.trackId !== undefined && r.trackId !== tr.id && visible.has(r.trackId)) exclude.add(sid);
          // Kadrlar bo'yicha o'rtacha namuna bilan solishtiriladi.
          if (!embs[k]) return;
          const mean = tr.addEmbedding(embs[k].embedding, 8, qualityWeight(embs[k].quality));
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
        // Tasdiq kutayotganlar (sariq): bir necha soniya ro'yxatda turadi, bir bosishda "keldi"
        const now = Date.now();
        for (const v of next) {
          if ((v.kind === "review" || v.kind === "photo") && v.studentId && !recognizedRef.current.has(v.studentId)) pendingRef.current.set(v.studentId, { view: v, seen: now });
        }
        for (const [sid, p] of pendingRef.current) if (now - p.seen > 5000 || recognizedRef.current.has(sid)) pendingRef.current.delete(sid);
        setPending([...pendingRef.current].map(([sid, p]) => ({ sid, view: p.view })));
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

  const shown = demo ? students.map((s) => student(s.id) ?? s) : students;
  const present = students.filter((s) => recognized.has(s.id));
  const missing = students.filter((s) => !recognized.has(s.id));
  const confirmedId = dialog?.type === "confirmed" ? dialog.view.studentId : undefined;
  const confirmedRec = confirmedId ? recognized.get(confirmedId) : undefined;

  const recent = [...recognized].sort((x, y) => y[1].at - x[1].at).slice(0, 4);
  const pendingList = pending.filter((p) => !recognized.has(p.sid));
  const acceptPending = (p: { sid: string; view: FaceView }) => {
    confirm(p.sid, p.view, p.view.score, true);
    pendingRef.current.delete(p.sid);
    setPending((list) => list.filter((x) => x.sid !== p.sid));
  };
  const note = enrolled > 0 && enrolled < students.length
    ? t("Yuz namunasi bor: {n}/{total}. Qolganlarini ro'yxatdan \"keldi\" deb belgilang.", { n: enrolled, total: students.length })
    : undefined;
  const finishBtn = (
    <button type="button" className={cx(btn.primary, "h-11 shrink-0")} onClick={() => setFinish(true)}>
      <ListChecks size={19} aria-hidden /> {t("Yakunlash")}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black text-white">
      {/* Kamera butun ekranni egallaydi */}
      <div className="absolute inset-0 landscape:right-[300px] lg:right-[340px]">
      <CameraStage ref={stage} fit={demo ? "contain" : "cover"} videoSrc={demo?.src} onZoom={() => scanner.current.reset()}
        controlsTop="calc(max(env(safe-area-inset-top), 10px) + 64px)"
        zoomBottom={side ? undefined : sheetOpen ? "calc(62dvh + 12px)" : "calc(max(env(safe-area-inset-bottom), 10px) + 158px)"}
        className="size-full">
        {status === "loading" && (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 flex justify-center">
            <span className="rounded-full bg-black/60 px-3 py-1.5 text-sm">{`${t("Yuz tanish modeli yuklanmoqda…")}${loadPct !== null && loadPct < 100 ? ` ${loadPct}%` : ""}`}</span>
          </div>
        )}
        {status === "error" && (
          <div className="pointer-events-none absolute inset-x-6 top-1/3 rounded-xl bg-red-700/80 p-3 text-sm">
            {t("Yuz tanish ishga tushmadi: {e}. Yo'qlama orqali davom eting.", { e: errorText })}
          </div>
        )}
        <div className="pointer-events-none absolute inset-0">
          {views.map((v) => (
            <FaceCircle key={v.track.id} view={v} name={v.studentId ? shortName(student(v.studentId)?.name) : undefined} onTap={() => openFor(v)} />
          ))}
        </div>
      </CameraStage>
      </div>

      {/* Ustki panel: orqaga, dars, hisob */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/75 via-black/40 to-transparent px-3 pt-[max(env(safe-area-inset-top),10px)] pb-6 landscape:right-[300px] lg:right-[340px]">
        <div className="flex items-center gap-2.5">
          <Link href={`/teacher/lesson/${lesson.id}`} aria-label={t("Orqaga")}
            className="pointer-events-auto flex h-11 shrink-0 items-center gap-1 rounded-full bg-black/55 pr-3.5 pl-2 text-sm font-semibold backdrop-blur hover:bg-black/70">
            <ChevronLeft size={24} aria-hidden /> {t("Orqaga")}
          </Link>
          <div className="min-w-0 flex-1 [text-shadow:0_1px_3px_rgb(0_0_0/0.6)]">
            <div className="truncate text-[15px] font-bold">{app.schoolClass(lesson.classId)?.name} · {lesson.subject}</div>
            <div className="truncate text-[11px] text-white/75">
              {status === "ready" ? t("Jonli kuzatuv · {f} yuz · {k} bo'lak/sikl", { f: stats.faces, k: stats.tiles + 1 }) : `${t("Yuz tanish modeli yuklanmoqda…")}${loadPct !== null && loadPct < 100 ? ` ${loadPct}%` : ""}`}
            </div>
          </div>
          <div className="tabular shrink-0 rounded-full bg-emerald-500/85 px-3 py-1 text-lg font-bold text-white backdrop-blur" aria-live="polite">
            {present.length}<span className="text-white/75">/{students.length}</span>
          </div>
        </div>
        {app.mode === "local" && (
          <div className="mt-2 flex">
            {demo ? (
              <span className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-sky-600/85 px-3 py-1.5 text-xs font-semibold backdrop-blur">
                <Film size={14} aria-hidden /> {t("Demo video: sun'iy yuzlar")}
                <button type="button" onClick={() => location.reload()} className="ml-1 underline">{t("Kameraga qaytish")}</button>
              </span>
            ) : (
              <button type="button" disabled={demoLoading} onClick={startDemo}
                className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-sky-600/85 px-3 py-1.5 text-xs font-semibold backdrop-blur hover:bg-sky-600">
                <Film size={14} aria-hidden /> {demoLoading ? t("Yuklanmoqda…") : t("Demo videoda ko'rish")}
              </button>
            )}
          </div>
        )}
        {(portraitHint || (enrolled === 0 && !warnClosed)) && (
          <div className="mt-2 flex flex-col gap-1.5">
            {enrolled === 0 && !warnClosed && (
              <button type="button" onClick={() => setWarnClosed(true)}
                className="pointer-events-auto flex items-start gap-2 rounded-xl bg-amber-600/85 p-2.5 text-left text-[12px] leading-snug backdrop-blur">
                <span className="flex-1">{t("Sinfda hech kimning yuz namunasi yo'q. Avval \"Sinflar\" bo'limida yuzlarni ro'yxatga oling. Hozircha doirani bosib o'quvchini qo'lda tanlashingiz mumkin.")}</span>
                <X size={15} className="mt-0.5 shrink-0" aria-hidden />
              </button>
            )}
            {portraitHint && (
              <button type="button" onClick={() => setPortraitHint(false)}
                className="pointer-events-auto flex items-center gap-2 self-start rounded-full bg-black/55 px-3 py-1.5 text-left text-xs text-white/85 backdrop-blur">
                <Smartphone size={15} className="shrink-0 rotate-90" aria-hidden />
                {t("Butun sinf sig'ishi uchun telefonni yotqizing")}
                <X size={14} aria-hidden />
              </button>
            )}
          </div>
        )}
      </header>

      {/* Telefon: pastdan chiquvchi hisobot paneli */}
      <section aria-label={t("Davomat hisoboti")}
        className={cx("absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-3xl bg-[#11152a]/95 backdrop-blur landscape:hidden lg:hidden",
          sheetOpen ? "h-[62dvh]" : "")}>
        <button type="button" onClick={() => setSheetOpen(!sheetOpen)} aria-expanded={sheetOpen}
          className="flex w-full flex-col items-center px-4 pt-2 pb-1.5" aria-label={sheetOpen ? t("Ro'yxatni yopish") : t("Ro'yxatni ochish")}>
          <span className="h-1 w-10 rounded-full bg-white/30" aria-hidden />
          <span className="mt-2 flex w-full items-center gap-3 text-left">
            <span className="tabular text-sm font-semibold text-emerald-400">{t("Keldi: {n}", { n: present.length })}</span>
            <span className="tabular text-sm text-white/65">{t("Aniqlanmagan: {n}", { n: missing.length })}</span>
            {pendingList.length > 0 && <span className="tabular rounded-full bg-amber-400 px-2 text-xs font-bold text-black">{pendingList.length}?</span>}
            <span className="ml-auto text-white/70">{sheetOpen ? <ChevronDown size={20} aria-hidden /> : <ChevronUp size={20} aria-hidden />}</span>
          </span>
        </button>
        {sheetOpen ? (
          <ReportPanel students={shown} recognized={recognized} onToggle={toggleManual} pending={pendingList} onAccept={acceptPending}
            present={present.length} lessonStart={lesson.start} note={note} compactHeader />
        ) : (
          <div className="flex min-h-[40px] items-center gap-1.5 overflow-x-auto px-4 pb-1">
            {pendingList.map((p) => (
              <button key={p.sid} type="button" onClick={() => acceptPending(p)}
                className="flex shrink-0 items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1 text-xs font-semibold text-black">
                <UserCheck size={13} aria-hidden /> {shortName(student(p.sid)?.name)}?
              </button>
            ))}
            {recent.map(([sid]) => (
              <span key={sid} className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                <Check size={13} aria-hidden /> {shortName(student(sid)?.name)}
              </span>
            ))}
            {recent.length === 0 && pendingList.length === 0 && (
              <span className="text-xs text-white/50">{t("Tanilgan o'quvchilar shu yerda avtomatik \"keldi\" bo'ladi")}</span>
            )}
          </div>
        )}
        <div className="flex gap-2 px-3 pt-1.5 pb-[max(env(safe-area-inset-bottom),10px)]">
          <div className="flex-1 [&>button]:w-full">{finishBtn}</div>
        </div>
      </section>

      {/* Kompyuter/planshet: o'ng tomonda doimiy hisobot */}
      <aside className="absolute inset-y-0 right-0 hidden w-[300px] flex-col border-l border-white/10 bg-[#11152a] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] landscape:flex lg:flex lg:w-[340px]">
        <ReportPanel students={shown} recognized={recognized} onToggle={toggleManual} pending={pendingList} onAccept={acceptPending}
          present={present.length} lessonStart={lesson.start} note={note} />
        <div className="p-3 pt-0 [&>button]:w-full">{finishBtn}</div>
      </aside>

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
              {missing.map((s0) => student(s0.id) ?? s0).map((s) => (
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
  students, recognized, onToggle, pending, onAccept, present, lessonStart, note, compactHeader,
}: {
  students: Student[];
  recognized: Map<string, Recognized>;
  onToggle: (sid: string) => void;
  /** Sariq: tanish ishonchi past, o'qituvchi bir bosishda tasdiqlaydi. */
  pending: { sid: string; view: FaceView }[];
  onAccept: (p: { sid: string; view: FaceView }) => void;
  present: number;
  lessonStart: string;
  note?: string;
  /** Telefon paneli: sarlavha va hisob yuqoridagi tugmada ko'rsatilgan. */
  compactHeader?: boolean;
}) {
  const t = useT();
  const pendingIds = new Set(pending.map((p) => p.sid));
  const missing = students.filter((s) => !recognized.has(s.id) && !pendingIds.has(s.id));
  const got = students.filter((s) => recognized.has(s.id)).sort((a, b) => recognized.get(b.id)!.at - recognized.get(a.id)!.at);
  const pct = students.length ? present / students.length : 0;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cx("px-4 pt-3 pb-3", compactHeader && "pt-1 pb-2")}>
        {!compactHeader && (<>
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
        </>)}
        {compactHeader && (
          <div className="h-1.5 overflow-hidden rounded-full bg-current/15">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct * 100}%` }} />
          </div>
        )}
        {note && <p className="mt-2 rounded-lg bg-amber-500/15 px-2.5 py-1.5 text-[11.5px] leading-snug">{note}</p>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
        {pending.length > 0 && (
          <>
            <div className="px-2 pt-1 pb-1 text-[11px] font-semibold tracking-wide text-amber-300 uppercase">{t("Tasdiqlang")}</div>
            {pending.map((p) => {
              const s = students.find((x) => x.id === p.sid);
              if (!s) return null;
              return (
                <button key={p.sid} type="button" onClick={() => onAccept(p)}
                  className="flex w-full items-center gap-2.5 rounded-lg bg-amber-400/10 px-2 py-1.5 text-left text-sm hover:bg-amber-400/20">
                  <span className="rounded-full bg-amber-400 p-0.5"><Avatar name={s.name} image={s.facePhoto} size={28} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{s.name}?</span>
                    <span className="tabular block text-[11px] opacity-60">{t("Taxminiy moslik: {p}%", { p: Math.round((p.view.score ?? 0) * 100) })}</span>
                  </span>
                  <span className="flex items-center gap-1 rounded-md bg-amber-400 px-1.5 py-0.5 text-[11px] font-semibold text-black"><UserCheck size={12} aria-hidden />{t("keldi")}</span>
                </button>
              );
            })}
          </>
        )}
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
