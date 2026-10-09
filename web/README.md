# EduNazorat — web ilova

Next.js 16 (App Router, Turbopack), TypeScript, Tailwind CSS 4. Barcha rollar uchun:
ota-ona, o'quvchi, o'qituvchi, direktor, super admin. Telefon va kompyuterga moslashgan,
o'zbek va rus tillarida.

## Ishga tushirish

Loyiha ildizidan (monorepo):

```bash
npm install
npm run dev:web       # http://localhost:3000
```

- `.env.local` bo'sh: **demo rejim**, ma'lumotlar brauzerda (kod `1111`).
- `NEXT_PUBLIC_API_URL=http://localhost:4000`: NestJS server bilan (ildizdagi README).

## Sahifalar

| Rol | Sahifalar |
|---|---|
| Ota-ona | Bosh sahifa (bugungi darslar va davomat), baholar (choraklar bo'yicha jurnal), davomat kalendari, vazifalar, dars jadvali, to'lovlar (Click/Payme), yozishmalar, farzand profili (yuz uchun rozilik), bildirishnomalar |
| O'quvchi | Bugun, vazifalar (fayl bilan topshirish), baholar, jadval, davomat |
| O'qituvchi | Bugungi darslar → dars sahifasi (davomat, baho, vazifa), kamera orqali davomat, yo'qlama, sinf jurnali (Excel), o'quvchilar va yuz ro'yxatga olish, vazifalarni tekshirish, yozishmalar |
| Direktor | Boshqaruv paneli, o'quvchilar (qo'shish, ota-onani bog'lash, arxiv), o'qituvchilar, sinflar, dars jadvali (to'qnashuv tekshiruvi), to'lovlar (hisob-varaq, to'lov, chegirma), hisobotlar (grafik + Excel), e'lonlar, sozlamalar |
| Super admin | Muassasalar, direktorlar, bloklash |

## Tuzilma

```
src/
  app/                    sahifalar (rol bo'yicha papkalar)
  components/
    ui.tsx                tugmalar, kartalar, jadval (kompyuterda jadval, telefonda kartochka), oyna
    charts.tsx            SVG grafiklar (kutubxonasiz)
    shell.tsx             chap panel / pastki menyu, sarlavha, profil
    learner.tsx           ota-ona va o'quvchi ko'rinishlari
    teacher/              jurnal, baho va vazifa oynalari
    director/             formalar, jadval to'ri
    camera-stage.tsx      kamera: zoom, fokus, chiroq
  lib/
    data/store.ts         holat va so'rovlar; o'zgartirish faqat buyruqlar orqali
    data/transport.ts     LocalTransport (demo) yoki RemoteTransport (NestJS, SSE)
    face/                 yuz tanish: YuNet + GhostFaceNet (Web Worker, onnxruntime-web), jonlilik, diagnostika
    i18n/                 til (lug'atlar shared/src/i18n da)
    export.ts             XLSX yozuvchi
    push.ts               brauzer bildirishnomalari, Web Push obunasi
public/
  models/                 ONNX modellari (litsenziyalari bilan)
  sw.js                   Web Push service worker
```

## Tekshirish

```bash
npm test -w web       # buyruqlar, ruxsatlar, yuz tanish, jonlilik, tarjimalar to'liqligi, Excel
npm run lint -w web
npm run build -w web
```

`i18n.test.ts` interfeysdagi har bir `t("...")` matnining ruschasi borligini tekshiradi:
yangi matn qo'shsangiz, `shared/src/i18n/ru.ts` ga tarjimasini yozing.
