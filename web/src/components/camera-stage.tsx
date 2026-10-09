"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { CameraOff, Flashlight, FlashlightOff, SwitchCamera } from "lucide-react";

import { FACE } from "@/lib/face/config";
import { t } from "@/lib/i18n";
import type { Detection } from "@/lib/face/yunet";
import { cx } from "./ui";

/** Bitta olingan kadr: faqat xotirada, hech qayerga yozilmaydi. */
export interface CapturedFrame {
  canvas: HTMLCanvasElement;
  image: ImageData;
  /** Kadr koordinatasini ekrandagi koordinataga o'giradi. */
  toScreen: (x: number, y: number) => [number, number];
  /** Kadrdagi masshtab -> ekran masshtabi */
  scale: number;
}

export interface CameraStageHandle {
  /** Ekranda ko'rinib turgan qismni oladi (raqamli zoom hisobga olinadi). */
  capture: () => CapturedFrame | null;
}

type Caps = MediaTrackCapabilities & { zoom?: { min: number; max: number; step?: number }; torch?: boolean };

/**
 * Jonli kamera: ikki barmoq bilan zoom, 1x/2x/4x, bosib fokuslash,
 * chiroq, old/orqa kamera. Video yozilmaydi.
 */
export const CameraStage = forwardRef<CameraStageHandle, {
  facing?: "user" | "environment";
  /** contain: butun kadr ko'rinadi (butun sinf); cover: ekranni to'ldiradi. */
  fit?: "cover" | "contain";
  /** Zoom o'zgarganda (kuzatuvni qayta boshlash uchun). */
  onZoom?: (z: number) => void;
  /** Ekrandagi qatlam (yuz doiralari). */
  children?: React.ReactNode;
  className?: string;
  /** To'liq ekranda ustidagi sarlavha/pastdagi panel uchun tugmalar joyi (CSS qiymat). */
  controlsTop?: string;
  zoomBottom?: string;
  /** Kamera o'rniga video fayl (demo/sinov): takrorlanib o'ynaydi. */
  videoSrc?: string;
}>(function CameraStage({ facing: initialFacing = "environment", fit = "cover", onZoom, children, className, controlsTop, zoomBottom, videoSrc }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const canvases = useRef<HTMLCanvasElement[]>([]);
  const turn = useRef(0);
  const [facing, setFacing] = useState(initialFacing);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [fileReady, setFileReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [vsize, setVsize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [range, setRange] = useState({ min: 1, max: 4, hw: false });
  const [torch, setTorch] = useState<boolean | null>(null);
  const [focus, setFocus] = useState<{ x: number; y: number; id: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const zoomRef = useRef(1);
  zoomRef.current = zoom;

  // Kamerani ochish / yopish.
  useEffect(() => {
    if (videoSrc) return; // video fayl: kamera ochilmaydi
    let cancelled = false;
    let s: MediaStream | null = null;
    (async () => {
      setError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(window.isSecureContext
          ? t("Bu brauzer kamerani qo'llab-quvvatlamaydi.")
          : t("Kamera faqat xavfsiz manzilda ishlaydi (https yoki localhost)."));
        return;
      }
      try {
        s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        const track = s.getVideoTracks()[0];
        const caps = (track.getCapabilities?.() ?? {}) as Caps;
        if (caps.zoom && caps.zoom.max > caps.zoom.min) {
          setRange({ min: caps.zoom.min, max: Math.min(caps.zoom.max, 8), hw: true });
          setZoom(caps.zoom.min);
        } else {
          setRange({ min: 1, max: 4, hw: false });
          setZoom(1);
        }
        setTorch(caps.torch ? false : null);
        setStream(s);
      } catch (e) {
        const name = e instanceof DOMException ? e.name : "";
        setError(
          name === "NotAllowedError" ? t("Kameraga ruxsat berilmagan. Brauzer sozlamalaridan ruxsat bering.")
            : name === "NotFoundError" ? t("Qurilmada kamera topilmadi.")
            : t("Kamerani ochib bo'lmadi{e}.", { e: name ? ` (${name})` : "" }),
        );
      }
    })();
    return () => {
      cancelled = true;
      s?.getTracks().forEach((t) => t.stop());
      setStream(null);
    };
  }, [facing, videoSrc]);

  // Video fayl manbasi
  useEffect(() => {
    const v = video.current;
    if (!v || !videoSrc) return;
    setError(null);
    setRange({ min: 1, max: 4, hw: false });
    setZoom(1);
    setTorch(null);
    v.srcObject = null;
    v.src = videoSrc;
    v.loop = true;
    const onMeta = () => {
      setVsize({ w: v.videoWidth, h: v.videoHeight });
      setFileReady(true);
    };
    const onErr = () => setError(t("Videoni ochib bo'lmadi."));
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("error", onErr);
    v.play().catch(() => {});
    return () => {
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("error", onErr);
      v.pause();
      v.removeAttribute("src");
      v.load();
      setFileReady(false);
    };
  }, [videoSrc]);

  useEffect(() => {
    const v = video.current;
    if (!v || !stream) return;
    v.srcObject = stream;
    const onMeta = () => setVsize({ w: v.videoWidth, h: v.videoHeight });
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("resize", onMeta);
    v.play().catch(() => {});
    return () => {
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("resize", onMeta);
    };
  }, [stream]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Geometriya: video "cover" + raqamli zoom.
  const digital = range.hw ? 1 : zoom;
  const base = vsize.w && size.w ? (fit === "contain" ? Math.min(size.w / vsize.w, size.h / vsize.h) : Math.max(size.w / vsize.w, size.h / vsize.h)) : 1;
  const s = base * digital;
  const left = (size.w - vsize.w * s) / 2;
  const top = (size.h - vsize.h * s) / 2;
  const mirror = !videoSrc && facing === "user";

  const applyZoom = useCallback(async (z: number) => {
    const v = Math.min(range.max, Math.max(range.min, z));
    setZoom(v);
    onZoom?.(v);
    if (range.hw && stream) {
      try {
        await stream.getVideoTracks()[0].applyConstraints({ advanced: [{ zoom: v } as MediaTrackConstraintSet] });
      } catch {
        // ba'zi kameralar zoom'ni rad etadi
      }
    }
  }, [range, stream, onZoom]);

  useImperativeHandle(ref, () => ({
    capture() {
      const v = video.current;
      if (!v || !vsize.w || !size.w || v.readyState < 2) return null;
      // Ekranda ko'rinib turgan qism (video koordinatalarida).
      const x0 = Math.max(0, -left / s);
      const y0 = Math.max(0, -top / s);
      const rw = Math.min(vsize.w - x0, size.w / s);
      const rh = Math.min(vsize.h - y0, size.h / s);
      const cap = Math.min(1, FACE.frameMaxSide / Math.max(rw, rh));
      const cw = Math.max(1, Math.round(rw * cap));
      const ch = Math.max(1, Math.round(rh * cap));
      // Ikki navbatdagi canvas: ekrandagi doiralar qaysi kadrga tegishli bo'lsa, o'sha saqlanadi.
      turn.current = (turn.current + 1) % 2;
      let c = canvases.current[turn.current];
      if (!c) c = canvases.current[turn.current] = document.createElement("canvas");
      c.width = cw;
      c.height = ch;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(v, x0, y0, rw, rh, 0, 0, cw, ch);
      const k = s / cap;
      return {
        canvas: c,
        image: ctx.getImageData(0, 0, cw, ch),
        scale: k,
        toScreen: (x, y) => {
          const sx = left + x0 * s + x * k;
          return [mirror ? size.w - sx : sx, top + y0 * s + y * k];
        },
      };
    },
  }), [vsize, size, s, mirror, left, top]);

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: zoomRef.current };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      void applyZoom(pinch.current.zoom * (d / pinch.current.dist));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const wasPinch = !!pinch.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (wasPinch || e.target !== e.currentTarget) return;
    // Bosib fokuslash
    const rect = box.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setFocus({ x, y, id: Date.now() });
    const track = stream?.getVideoTracks()[0];
    if (track) {
      const nx = (mirror ? size.w - x : x) / size.w;
      const ny = y / size.h;
      track
        .applyConstraints({ advanced: [{ pointsOfInterest: [{ x: nx, y: ny }], focusMode: "single-shot" } as MediaTrackConstraintSet] })
        .catch(() => {});
    }
  };
  useEffect(() => {
    if (!focus) return;
    const t = setTimeout(() => setFocus(null), 900);
    return () => clearTimeout(t);
  }, [focus]);

  const toggleTorch = async () => {
    const track = stream?.getVideoTracks()[0];
    if (!track || torch === null) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {
      setTorch(null);
    }
  };

  const stops = [range.min, 2, 4].filter((z, i) => i === 0 || z <= range.max);
  const atStop = stops.some((z) => Math.abs(zoom - z) < 0.2);

  return (
    <div
      ref={box}
      className={cx("relative touch-none overflow-hidden bg-black select-none", className)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <video
        ref={video}
        playsInline
        muted
        className="pointer-events-none absolute max-w-none"
        style={{
          width: vsize.w * s || "100%",
          height: vsize.h * s || "100%",
          left,
          top,
          transform: mirror ? "scaleX(-1)" : undefined,
        }}
      />
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
          <CameraOff size={44} aria-hidden />
          <p>{error}</p>
        </div>
      )}
      {!error && !stream && !fileReady && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="size-8 animate-spin rounded-full border-3 border-white border-t-transparent" />
        </div>
      )}
      {children}
      {focus && (
        <div
          key={focus.id}
          className="pointer-events-none absolute size-16 -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 border-amber-300"
          style={{ left: focus.x, top: focus.y }}
        />
      )}
      <div className="absolute top-3 right-3 flex flex-col gap-2.5" style={controlsTop ? { top: controlsTop } : undefined}>
        {!videoSrc && (
          <button type="button" aria-label={t("Kamerani almashtirish")} onClick={() => setFacing(facing === "user" ? "environment" : "user")}
            className="flex size-11 items-center justify-center rounded-full bg-black/50 text-white">
            <SwitchCamera size={20} />
          </button>
        )}
        {torch !== null && (
          <button type="button" aria-label={t("Chiroq")} aria-pressed={torch} onClick={toggleTorch}
            className="flex size-11 items-center justify-center rounded-full bg-black/50 text-white">
            {torch ? <Flashlight size={20} /> : <FlashlightOff size={20} />}
          </button>
        )}
      </div>
      {(stream || fileReady) && (
        <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2 transition-[bottom]" style={zoomBottom ? { bottom: zoomBottom } : undefined}>
          {stops.map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => applyZoom(z)}
              className={cx("size-11 rounded-full text-xs font-extrabold", Math.abs(zoom - z) < 0.2 ? "bg-white text-black" : "bg-black/50 text-white")}
            >
              {z === range.min ? 1 : z}x
            </button>
          ))}
          {!atStop && (
            <span className="flex size-11 items-center justify-center rounded-full bg-white text-xs font-extrabold text-black">
              {(zoom / range.min).toFixed(1)}x
            </span>
          )}
        </div>
      )}
    </div>
  );
});

/** Ota-onaga boradigan kesim: faqat shu yuz, boshi tik holda. */
export function faceSnapshot(canvas: HTMLCanvasElement, d: Detection): string {
  const size = FACE.snapshotSize;
  const [x, y, w, h] = d.box;
  const side = Math.max(w, h) * (1 + FACE.snapshotMargin);
  const [[ex1, ey1], [ex2, ey2]] = d.kps;
  const roll = Math.atan2(ey2 - ey1, ex2 - ex1);
  const out = document.createElement("canvas");
  out.width = size;
  out.height = size;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  ctx.translate(size / 2, size / 2);
  ctx.rotate(-roll);
  ctx.scale(size / side, size / side);
  ctx.translate(-(x + w / 2), -(y + h / 2));
  ctx.drawImage(canvas, 0, 0);
  return out.toDataURL("image/jpeg", FACE.snapshotQuality);
}
