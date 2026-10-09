/**
 * Yuz tanish sozlamalari (hammasi shu yerda).
 *
 * Kalibrlash (YuNet + 5 nuqtali tekislash + MobileFaceNet, kosinus):
 * bir odamning turli rasmlari 0.69–0.99 (o'rtacha 0.87),
 * turli odamlar eng ko'pi 0.21 (o'rtacha 0.00).
 * Bu kattalar suratlaridagi natija: bolalar va bir sinfdagi yuzlarda
 * haqiqiy sinovdan keyin chegaralarni moslashtirish kerak.
 */
export const FACE = {
  detectorUrl: "/models/yunet.onnx",
  embedderUrl: "/models/mobilefacenet.onnx",
  ortWasmPath: "/ort/",

  /** YuNet kirishi (model 640×640 qat'iy). */
  detectSize: 640,
  detectThreshold: 0.6,
  nmsThreshold: 0.3,

  embedSize: 112,
  embeddingLength: 192,

  /** Shundan yuqori: "tanildi" (yashil). */
  matchThreshold: 0.55,
  /** Shu oraliqda: "tekshiring" (sariq), o'qituvchi tasdiqlaydi. */
  reviewThreshold: 0.4,
  /** Eng yaqin va ikkinchi nomzod orasidagi minimal farq. */
  minMargin: 0.1,
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
  smallFaceRelax: 0.07,
  /** ...lekin eng yaqin ikkinchi o'quvchidan farq kamida shuncha. */
  smallFaceMargin: 0.15,
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

  /** Ota-onaga yuboriladigan kesim: faqat shu yuz. */
  snapshotSize: 240,
  snapshotMargin: 0.55,
  snapshotQuality: 0.82,
} as const;
