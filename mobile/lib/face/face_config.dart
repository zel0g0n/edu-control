/// Yuz tanish sozlamalari. Qiymatlar haqiqiy o'quvchilar bilan sinab
/// ko'rilgach moslashtiriladi (hammasi shu faylda).
///
/// Boshlang'ich kalibrlash (MobileFaceNet, kosinus o'xshashlik):
/// bir odamning turli rasmlari 0.56–0.99 (o'rtacha 0.86),
/// turli odamlar eng ko'pi bilan 0.31 (o'rtacha 0.07) chiqdi.
/// Bu kattalar suratlaridagi natija: bolalar va bir sinfdagi o'xshash
/// yuzlar bilan chegara qayta sozlanishi kerak.
class FaceConfig {
  /// Model fayli (assets).
  static const modelAsset = 'assets/models/mobilefacenet.tflite';
  static const inputSize = 112;
  static const embeddingSize = 192;

  /// Shundan yuqori bo'lsa — "tanildi" (yashil).
  static const matchThreshold = 0.58;

  /// Shu oraliqda — "tekshiring" (sariq), o'qituvchi tasdiqlaydi.
  static const reviewThreshold = 0.45;

  /// Eng yaqin va ikkinchi nomzod orasidagi minimal farq (adashmaslik uchun).
  static const minMargin = 0.08;

  /// Bir yuz shuncha kadrda bir xil o'quvchi deb topilsa tasdiqlanadi.
  static const votesToConfirm = 2;

  /// Kadrdagi yuz eni shundan kichik bo'lsa (piksel) — "yaqinlashtiring".
  static const minFaceWidthPx = 56.0;

  /// Bosh burilishi shundan katta bo'lsa tanishga urinilmaydi.
  static const maxYawDeg = 32.0;

  /// Yuz kesimi atrofidagi qo'shimcha joy (model uchun).
  static const modelCropMargin = 0.10;

  /// Ota-onaga yuboriladigan yuz kesimi: kattaroq joy, lekin faqat shu yuz.
  static const snapshotMargin = 0.45;
  static const snapshotSize = 240;
  static const snapshotJpegQuality = 82;

  /// Kadrlarni qayta ishlash oralig'i (telefonni qizdirmaslik uchun).
  static const minFrameInterval = Duration(milliseconds: 220);

  /// Bir kadrda eng ko'pi bilan nechta noma'lum yuz tanishga yuboriladi.
  static const maxEmbeddingsPerFrame = 6;
}
