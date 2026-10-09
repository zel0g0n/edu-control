# EduNazorat — mobil ilova (v0.2: haqiqiy yuz tanish)

Xususiy maktab va o'quv markazlari uchun nazorat platformasi. Bu versiya
**backendsiz**: barcha ma'lumotlar ilova ichidagi mock ma'lumotlar
(`lib/data/mock_data.dart`), ilova yopilsa o'zgarishlar tiklanadi.

> Nom vaqtincha. O'zgartirish: `lib/core/config.dart` → `appName`.

## Web versiya (Android SDK'siz, kuchsiz kompyuterda ham)

Faqat Flutter va Chrome kerak:

```bash
cd edu_nazorat
flutter create --project-name edu_nazorat --org uz.edunazorat --platforms web .
flutter pub get
flutter run -d chrome
```

Telefonda ochish (telefon va kompyuter bitta Wi-Fi'da):

```bash
flutter run -d web-server --web-hostname 0.0.0.0 --web-port 8080
ipconfig            # "IPv4 Address", masalan 192.168.1.5
```

Telefon brauzerida: `http://192.168.1.5:8080`.

Saytga joylash uchun build: `flutter build web` → `build/web/` papkasi.

Web versiyada yuz tanish (kamera davomati va yuzni ro'yxatga olish)
ishlamaydi: o'rniga "faqat mobil ilovada" sahifasi va yo'qlama chiqadi.
Qolgan hamma narsa bir xil. Kod bitta: telefon uchun alohida hech narsa
o'zgartirish shart emas (`lib/features/teacher/face_pages.dart`).

## Ishga tushirish (mobil)

Talab: Flutter **3.27 yoki yangiroq**, **haqiqiy Android telefon** (yuz tanish
emulyatorda ham ishlaydi, lekin sinfni faqat telefonda sinab ko'rish mumkin).

Eng oson yo'l (Git Bash / macOS / Linux terminal):

```bash
cd edu_nazorat
bash setup.sh      # android/ios papkalari, ruxsatlar, paketlar, testlar
flutter run        # telefon USB orqali ulangan bo'lsin
```

Qo'lda (masalan PowerShell'da):

```bash
cd edu_nazorat
flutter create --project-name edu_nazorat --org uz.edunazorat --platforms android,ios .
flutter pub get
flutter run
```

APK yasash: `flutter build apk --release` →
`build/app/outputs/flutter-apk/app-release.apk`.

`flutter create .` faqat yetishmayotgan `android/` va `ios/` papkalarini
yaratadi, `lib/`, `test/` va `assets/` ga tegmaydi.

Tekshirish: `flutter analyze` va `flutter test`.

### Android sozlamasi

Kamera ruxsati kamera paketidan avtomatik qo'shiladi. Ilova ovoz yozmaydi,
shuning uchun ovoz ruxsatini olib tashlash tavsiya etiladi:
`android/app/src/main/AndroidManifest.xml` ichida `<manifest ...>` tegiga
`xmlns:tools="http://schemas.android.com/tools"` qo'shing va ichiga:

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" tools:node="remove"/>
```

`minSdk` 21 dan past bo'lmasin (Flutter standarti yetarli). Build paytida
"compileSdk" yoki Gradle versiyasi haqida xato chiqsa, terminal chiqishini
yuboring.

### iOS sozlamasi (faqat Mac'da)

- `ios/Runner/Info.plist` ga: `NSCameraUsageDescription` =
  "Davomat uchun o'quvchilar yuzini tanish".
- `ios/Podfile` da: `platform :ios, '15.5'`.
- Yuz tanish iOS simulyatorida ishlamaydi, faqat haqiqiy iPhone'da.

## Demo kirish (SMS kod hamma uchun: `1111`)

| Rol | Raqam |
|---|---|
| Ota-ona (2 farzand: 5-A va 7-B) | +998 90 555 55 55 |
| O'qituvchi (matematika, 7-B rahbari) | +998 90 333 33 33 |
| Direktor (Kelajak xususiy maktabi) | +998 90 111 11 11 |
| Direktor (Bilim o'quv markazi) | +998 90 222 22 22 |
| Super admin | +998 90 000 00 00 |

Kirish ekranida bu hisoblar tugma sifatida ham bor.

## Nima bor

**Ota-ona:** bugungi davomat ("keldi 08:14, yuz tanish orqali"), oylik
o'rtacha baho, fanlar bo'yicha baholar, haftalik jadval, uy vazifalari,
oylik to'lovlar va qarzdorlik, xabarlar, farzandlar orasida almashish,
yuz tanish uchun rozilik berish/bekor qilish.

**O'qituvchi:** bugungi darslar → dars ekrani:
davomat (qo'lda yoki kamera bilan), baho qo'yish (2–5, bosib turib
o'chirish), uy vazifasi berish. Sinflar ro'yxati, yuz namunasini
ro'yxatga olish (faqat ota-ona roziligi bo'lsa).

**Direktor:** panel (bugungi davomat %, oylik tushum, qarzdorlik, bugun
kelmaganlar), o'quvchilar qidiruvi va profili, sinflar/jadval,
o'qituvchilar, to'lovlar (oy va holat bo'yicha filtr, to'lov kiritish),
barcha yoki bitta sinf ota-onalariga e'lon.

**Super admin:** muassasalar ro'yxati va statistikasi, yangi muassasa
qo'shish, bloklash (bloklangan muassasa xodimlari tizimga kira olmaydi).

Har bir baho, davomat, vazifa va to'lov ota-onaga avtomatik xabar
yaratadi (backend ulanganda bu push-xabarga aylanadi).

## Yuz tanish qanday ishlaydi

1. **Ro'yxatga olish** (O'qituvchi → Sinflar → sinf → o'quvchi yonidagi
   kamera belgisi). Faqat ota-ona ilovada rozilik bergan bo'lsa ochiladi.
   3 ta namuna olinadi: to'g'ri, bir tomon, ikkinchi tomon. Sifat past bo'lsa
   yoki yuz boshqa o'quvchiga juda o'xshasa, ogohlantiradi.
2. **Davomat** (Bugun → dars → Davomat → Kamera). Kamera sinfga qaratiladi:
   - yashil doira + ism: tanildi (2 kadrda bir xil natija);
   - sariq doira: ishonch past, bosib "Ha" yoki boshqa o'quvchini tanlang;
   - oq doira: tanilmadi, bosib o'quvchini tanlang yoki ikki barmoq bilan
     yaqinlashtiring; bosib fokuslash, 1x/2x/4x, chiroq, old/orqa kamera bor.
3. **Yakunlash**: tanilmay qolganlar uchun yo'qlama ochiladi (birma-bir yoki
   ro'yxat). Belgilanmaganlar "kelmadi" deb saqlanadi (oldin so'raladi).
4. Saqlanganda har bir kelgan o'quvchining **faqat o'z yuz kesimi** uning
   ota-onasiga xabar bilan boradi. Butun kadr hech kimga yuborilmaydi.

Kamera kadrlari faqat xotirada qayta ishlanadi: video yoki rasm yozilmaydi.
Hammasi telefonning o'zida (ML Kit + MobileFaceNet), internet shart emas.

Kamerasiz **Yo'qlama** rejimi ham bor (dars → Davomat → Yo'qlama).

### Sozlash (chegaralar)

`lib/face/face_config.dart`: tanish chegarasi 0.58, "tekshiring" 0.45,
ikki nomzod orasidagi farq 0.08. Bular kattalar suratlarida tekshirilgan
(bir odam: 0.56–0.99, turli odamlar: ≤0.31). **Bolalar va bir sinfdagi
yuzlarda haqiqiy sinovdan keyin moslashtirish kerak.**

### Hali yo'q / cheklovlar

- **Jonlilik tekshiruvi yo'q**: telefondagi suratni ko'rsatib aldash mumkin.
  Hozircha o'qituvchi sinfni o'zi ko'rib turgani bu xavfni kamaytiradi.
- Orqa qatordagi kichik yuzlar tanilmaydi: yaqinlashtirish kerak.
- Ma'lumotlar xotirada: ilova yopilsa, yuz namunalari ham o'chadi (backend
  bosqichida serverga shifrlangan holda saqlanadi).
- SMS hali haqiqiy emas (kod `1111`).
- Yuz kesimlarini saqlash muddati (masalan 30 kun) backend bosqichida
  belgilanadi.

Model: MobileFaceNet (`assets/models/mobilefacenet.tflite`, 5 MB),
FaceRecognitionAuth loyihasidan (BSD-3, `MOBILEFACENET_SOURCE_LICENSE.txt`).

## Tuzilma

```
lib/
  main.dart                 ilova + rol bo'yicha yo'naltirish
  core/                     config, tema, sana/pul formatlash
  data/
    models.dart             domen modellari
    repository.dart         barcha o'qish/yozish (keyin backendga ulanadi)
    mock_data.dart          demo ma'lumotlar
  state/app_state.dart      sessiya (InheritedNotifier, tashqi paketsiz)
  face/                     kamera kadri, yuz topish, embedding, solishtirish
  features/
    auth/                   telefon + SMS kod
    parent/                 ota-ona ilovasi
    teacher/                o'qituvchi, dars, kamera davomati, ro'yxatga olish, yo'qlama
    director/               direktor paneli
    superadmin/             platforma boshqaruvi
    student/                o'quvchi ko'rinishlari (umumiy)
  widgets/common.dart       umumiy UI elementlari
```

Backend ulanganda faqat `repository.dart` ichi almashadi: ekranlar
o'zgarmaydi.
