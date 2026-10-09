"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, UserX } from "lucide-react";

import { CameraStage, faceSnapshot, type CameraStageHandle } from "@/components/camera-stage";
import { useRun, useToast } from "@/components/providers";
import { useRouteParam } from "@/components/route-param";
import { btn, cx, EmptyState, Modal } from "@/components/ui";
import { faceWorker } from "@/lib/face/client";
import { FACE } from "@/lib/face/config";
import { l2normalize } from "@/lib/face/align";
import { cosine, FaceGallery, usableTemplates } from "@/lib/face/matcher";
import { eyeDistance, yawRatio, type Detection } from "@/lib/face/yunet";
import { useApp } from "@/lib/data/store";
import { t as tr } from "@/lib/i18n";
import { useT } from "@/lib/i18n/react";

type Step = 0 | 1 | 2 | 3;
const INSTRUCTION = () => [tr("1/3 · To'g'ri kameraga qarasin"), tr("2/3 · Boshini biroz bir tomonga bursin"), tr("3/3 · Endi biroz ikkinchi tomonga"), tr("Tayyor")];

/** O'quvchi yuzini ro'yxatga olish: 3 namuna (to'g'ri, ikki tomon). */
export function EnrollClient() {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const router = useRouter();
  const toast = useToast();
  const studentId = useRouteParam("studentId");
  const s = app.student(studentId);
  const stage = useRef<CameraStageHandle>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorText, setErrorText] = useState("");
  const [step, setStep] = useState<Step>(0);
  const [hint, setHint] = useState(() => tr("O'quvchi yuzini ramka ichiga oling"));
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number; ok: boolean }[]>([]);
  const [duplicate, setDuplicate] = useState<{ name: string; score: number } | null>(null);
  const samples = useRef<Float32Array[]>([]);
  const photo = useRef<string | undefined>(undefined);
  const sideSign = useRef(0);
  const poseFrames = useRef<Float32Array[]>([]);
  const stable = useRef(0);
  const stepRef = useRef<Step>(0);
  const paused = useRef(false);

  const save = async () => {
    if (!s) return;
    const templates = samples.current.map((e) => Array.from(e, (v) => Math.round(v * 1e5) / 1e5));
    const ok = await run(() => app.run("face.enroll", { studentId: s.id, templates, photo: photo.current, model: FACE.modelId }));
    if (!ok) return;
    toast(t("{name}: yuz namunasi saqlandi", { name: s.name }), "ok");
    router.replace(`/teacher/classes/${s.classId}?tab=students`);
  };

  useEffect(() => {
    faceWorker.init().then(() => setStatus("ready")).catch((e: Error) => {
      setStatus("error");
      setErrorText(e.message);
    });
  }, []);

  useEffect(() => {
    if (status !== "ready" || !s) return;
    let alive = true;
    const restart = (why: string) => {
      samples.current = [];
      photo.current = undefined;
      sideSign.current = 0;
      stepRef.current = 0;
      setStep(0);
      setHint(why);
    };
    const finish = () => {
      // 1) Sifat: namunalar bir-biriga o'xshash bo'lishi kerak.
      const list = samples.current;
      let minSim = 1;
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) minSim = Math.min(minSim, cosine(list[i], list[j]));
      if (minSim < FACE.reviewThreshold) return restart(tr("Namunalar sifati past (yorug'likni tekshiring). Qaytadan boshlaymiz."));
      // 2) Takror: boshqa o'quvchiga juda o'xshamasligi kerak.
      const others = app.studentsOfInstitution(s.institutionId).filter((x) => x.id !== s.id);
      const gallery = new FaceGallery(Object.fromEntries(others.map((x) => [x.id, usableTemplates(x)])));
      let worst = { id: "", score: 0 };
      for (const e of list) {
        const r = gallery.match(e);
        if (r.studentId && r.score > worst.score) worst = { id: r.studentId, score: r.score };
      }
      if (worst.id && worst.score >= FACE.matchThreshold) {
        paused.current = true;
        setDuplicate({ name: app.student(worst.id)?.name ?? "", score: worst.score });
        return;
      }
      void save();
    };

    (async () => {
      while (alive) {
        const t0 = performance.now();
        const frame = paused.current || stepRef.current === 3 ? null : stage.current?.capture();
        if (frame) {
          try {
            const dets = await faceWorker.detect(frame.image);
            if (!alive) return;
            setBox(dets.map((d) => {
              const [ax, ay] = frame.toScreen(d.box[0], d.box[1]);
              const [bx, by] = frame.toScreen(d.box[0] + d.box[2], d.box[1] + d.box[3]);
              return { x: Math.min(ax, bx), y: ay, w: Math.abs(bx - ax), h: by - ay, ok: dets.length === 1 };
            }));
            await handle(dets, frame.canvas);
          } catch (e) {
            console.warn(e);
          }
        }
        await new Promise((r) => setTimeout(r, Math.max(16, FACE.frameIntervalMs - (performance.now() - t0))));
      }
    })();

    async function handle(dets: Detection[], canvas: HTMLCanvasElement) {
      if (dets.length === 0) return setHint(tr("Yuz ko'rinmayapti"));
      if (dets.length > 1) return setHint(tr("Kadrda faqat bitta o'quvchi bo'lsin"));
      const d = dets[0];
      if (eyeDistance(d) < 40) return setHint(tr("Yaqinroq keling"));
      const yaw = yawRatio(d);
      const st = stepRef.current;
      const ok = st === 0 ? Math.abs(yaw) < 0.08
        : st === 1 ? Math.abs(yaw) >= 0.12 && Math.abs(yaw) <= 0.4
        : Math.abs(yaw) >= 0.12 && Math.abs(yaw) <= 0.4 && Math.sign(yaw) !== sideSign.current;
      if (!ok) {
        stable.current = 0;
        return setHint(INSTRUCTION()[st]);
      }
      if (++stable.current < 2) return; // ikki ketma-ket mos kadr: xira tasvirni kamaytiradi
      const [r] = await faceWorker.embedWithQuality([d.kps]);
      if (!alive || !r) return;
      if (r.quality < FACE.enrollMinSharpness) return setHint(tr("Tasvir xira: telefonni qimirlatmang"));
      // Har bir holat uchun 3 ta keskin kadr o'rtachasi: bitta kadrdagi shovqin kamayadi
      poseFrames.current.push(r.embedding);
      if (poseFrames.current.length < 3) return;
      stable.current = 0;
      const mean = new Float32Array(r.embedding.length);
      for (const e of poseFrames.current) for (let i = 0; i < e.length; i++) mean[i] += e[i];
      poseFrames.current = [];
      const emb = l2normalize(mean);
      samples.current.push(emb);
      if (st === 0) photo.current = faceSnapshot(canvas, d);
      if (st === 1) sideSign.current = Math.sign(yaw);
      const next = (st + 1) as Step;
      stepRef.current = next;
      setStep(next);
      setHint(INSTRUCTION()[next]);
      if (next === 3) finish();
    }

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, s?.id]);

  if (!s) return <EmptyState icon={UserX} title={t("O'quvchi topilmadi")} />;
  if (!s.parentConsent) return <EmptyState icon={UserX} title={t("Ota-ona roziligisiz yuz ro'yxatga olinmaydi")} />;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <header className="flex items-center gap-3 px-3 pt-3 pb-2">
        <Link href={`/teacher/classes/${s.classId}?tab=students`} className="flex size-11 items-center justify-center rounded-full hover:bg-white/10" aria-label={t("Orqaga")}>
          <ChevronLeft size={26} />
        </Link>
        <div className="flex-1 truncate text-lg font-bold">{s.name}</div>
      </header>
      <div className="flex flex-col items-center gap-2 px-4 pb-3">
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <span key={i} className={cx("h-1.5 w-7 rounded-full", i < step ? "bg-emerald-400" : "bg-white/25")} />
          ))}
        </div>
        <div className="text-[17px] font-bold">{INSTRUCTION()[step]}</div>
        <div className="text-sm text-white/70">{status === "loading" ? t("Model yuklanmoqda…") : status === "error" ? errorText : hint}</div>
      </div>
      <CameraStage ref={stage} facing="user" className="mx-3 min-h-0 flex-1 rounded-2xl">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-1/2 left-1/2 h-[62%] w-[55%] max-w-xs -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-white/40" />
          {box.map((b, i) => (
            <div key={i} className={cx("absolute rounded-2xl border-[3px]", b.ok ? "border-emerald-400" : "border-amber-400")}
              style={{ left: b.x, top: b.y, width: b.w, height: b.h }} />
          ))}
        </div>
      </CameraStage>
      <p className="px-6 pt-3 pb-[max(env(safe-area-inset-bottom),16px)] text-center text-xs text-white/55">
        {t("Rasm saqlanmaydi: faqat raqamli yuz namunasi va o'qituvchi ro'yxati uchun kichik yuz kesimi. Faqat ota-ona roziligi bilan.")}
      </p>
      <Modal open={!!duplicate} onClose={() => { setDuplicate(null); router.refresh(); }} title={t("O'xshash yuz topildi")}>
        <p>{t("Bu yuz {name} namunasiga juda o'xshaydi ({p}%). To'g'ri o'quvchini tanlaganingizga ishonchingiz komilmi?", { name: duplicate?.name ?? "", p: Math.round((duplicate?.score ?? 0) * 100) })}</p>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button type="button" className={btn.outline} onClick={() => {
            setDuplicate(null);
            samples.current = [];
            photo.current = undefined;
            stepRef.current = 0;
            setStep(0);
            paused.current = false;
          }}>{t("Qaytadan")}</button>
          <button type="button" className={btn.primary} onClick={() => { setDuplicate(null); void save(); }}>{t("Baribir saqlash")}</button>
        </div>
      </Modal>
    </div>
  );
}
