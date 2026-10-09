import { FACE_MODEL_ID } from "@edunazorat/shared";

/**
 * Yuz tanish sozlamalari (hammasi shu yerda).
 *
 * Model: YuNet (topish) + GhostFaceNetV1 W1.3 S1 (ArcFace, 512 o'lcham).
 * O'lchov (LFW, 6000 juft; uzoqdagi yuz kichraytirib taqlid qilingan):
 *   ko'zlar orasi 35 / 20 / 14 / 10 px: TAR@FAR=0.1% = 99.6 / 99.4 / 98.9 / 97.9 %
 *   (avvalgi MobileFaceNet: 98.6 / 97.9 / 97.3 / 88.2 %).
 *   Turli odamlar eng yuqori o'xshashligi ≈ 0.30-0.33, bir odam medianasi ≈ 0.58-0.69.
 * Bu kattalar suratlari: bolalar va aka-ukalar uchun Sozlamalar → Diagnostika.
 */
export const FACE = {
  detectorUrl: "/models/yunet.onnx",
  embedderUrl: "/models/ghostfacenet-w13s1.onnx",
  ortWasmPath: "/ort/",

  /** YuNet kirishi (model 640×640 qat'iy). */
  detectSize: 640,
  detectThreshold: 0.6,
  nmsThreshold: 0.3,

  /** Namunalar shu model bilan olingan (boshqa modelning namunalari ishlatilmaydi). */
  modelId: FACE_MODEL_ID,
  embedSize: 112,
  embeddingLength: 512,
  /** Kirish: (piksel − mean) / std. */
  embedMean: 127.5,
  embedStd: 128,
  /** Ko'zgu nusxasi bilan ikki marta (barqarorroq, 2x sekinroq). */
  flipTTA: false,
  /** Keskinlik (Laplas dispersiyasi): shundan past kadr xira, o'rtachaga kam ta'sir qiladi. */
  sharpRef: 80,
  /** Ro'yxatga olishda shundan xira kadr olinmaydi. */
  enrollMinSharpness: 30,

  /** Shundan yuqori: "tanildi" (yashil). Turli odamlar eng ko'pi ≈ 0.33. */
  matchThreshold: 0.4,
  /** Shu oraliqda: "tekshiring" (sariq), o'qituvchi tasdiqlaydi. */
  reviewThreshold: 0.28,
  /** Eng yaqin va ikkinchi nomzod orasidagi minimal farq. */
  minMargin: 0.08,
  /** Bir yuz shuncha kadrda bir xil o'quvchi deb topilsa tasdiqlanadi. */
  votesToConfirm: 2,

  /**
   * Kadrdagi ko'zlar orasidagi masofa shundan kichik bo'lsa tanishga urinilmaydi.
   * Sinf simulyatsiyasida (1920 kenglik, 640 bo'laklar) 13 px dan ishonchli,
   * 9-11 px da qisman tanildi.
   */
  minEyeDistancePx: 9,
  /** Shundan kichik yuzlar uchun ko'proq ovoz (xato tanishni kamaytirish). */
  smallFaceEyePx: 16,
  smallFaceVotes: 3,
  /** Kichik yuz (kamida 3 kadr o'rtachasi): "tanildi" chegarasi shuncha past... */
  smallFaceRelax: 0.04,
  /** ...lekin eng yaqin ikkinchi o'quvchidan farq kamida shuncha. */
  smallFaceMargin: 0.12,
  /**
   * Jonlilik tekshiruvi faqat yaqin yuzlarda (ko'zlar orasi shundan katta):
   * uzoqdagi kichik yuzlarda 5 nuqta aniqligi yetarli emas.
   */
  livenessMinEyePx: 45,
  /** Bosh burilishi (nisbat) shundan katta bo'lsa tanishga urinilmaydi. */
  maxYaw: 0.4,

  /** Kadr olish: uzun tomoni shundan oshmaydi. Butun sinf uchun to'liq HD kerak. */
  frameMaxSide: 1920,
  /** Butun sinf: bo'lak o'lchami (YuNet kirishi bilan bir xil = masshtab 1). */
  tileSize: 640,
  /** Bitta sikl uchun mo'ljallangan vaqt (bo'laklar soni shunga moslashadi). */
  cycleTargetMs: 700,
  /** Kadrlar orasidagi minimal vaqt. */
  frameIntervalMs: 200,
  /** Bir kadrda eng ko'pi bilan nechta yuz tanishga yuboriladi (navbat bilan). */
  maxEmbeddingsPerFrame: 8,
  /** Bir siklda yuz namunalariga ajratiladigan vaqt (qurilma tezligiga moslashadi). */
  embedBudgetMs: 450,

  /** Ota-onaga yuboriladigan kesim: faqat shu yuz. */
  snapshotSize: 240,
  snapshotMargin: 0.55,
  snapshotQuality: 0.82,
} as const;

/** Muassasa chegaralari: boshqa model uchun sozlangan bo'lsa standart qiymatlar. */
export function faceThresholds(settings?: { faceModel?: string; matchThreshold: number; reviewThreshold: number }) {
  if (!settings || settings.faceModel !== FACE.modelId) return { match: FACE.matchThreshold, review: FACE.reviewThreshold };
  return { match: settings.matchThreshold, review: settings.reviewThreshold };
}
