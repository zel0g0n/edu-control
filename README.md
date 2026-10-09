# EduNazorat

Xususiy maktab va o'quv markazlari uchun nazorat platformasi (kundalik.com singari):
elektron jurnal, dars bo'yicha davomat (telefon kamerasi orqali yuz tanish bilan),
dars jadvali, uy vazifalari, to'lovlar (Click, Payme), ota-ona va o'qituvchi yozishmasi,
hisobotlar. Til: o'zbekcha va ruscha.

| Papka | Nima |
|---|---|
| `shared/` | Umumiy TypeScript: turlar, buyruqlar mantig'i, ruxsatlar, tarjimalar. Web demo va server **bir xil kod** bilan ishlaydi |
| `web/` | Next.js 16 web ilova: ota-ona, o'quvchi, o'qituvchi, direktor, super admin |
| `api/` | NestJS 11 server: PostgreSQL, SMS kod bilan kirish, real vaqt, Web Push, Click/Payme |
| `mobile/` | Flutter ilova (keyingi bosqich, kuchli kompyuter olingach) |

> **Windows uchun bosqichma-bosqich qo'llanma: [QOLLANMA.md](QOLLANMA.md)**

## Talablar

- Node.js 20 yoki 22 (`node -v`)
- Ma'lumotlar bazasi: Neon (bulut Postgres), oddiy Postgres yoki hech narsa (o'rnatilgan PGlite). Haqiqiy ma'lumotlar O'zbekistondagi serverda saqlanishi shart (QOLLANMA.md, 6.2)

## 1. Tez boshlash: demo (server kerak emas)

```bash
npm install
npm run dev:web
```

http://localhost:3000 ochiladi. Kirish sahifasidagi demo hisoblardan birini bosing (kod `1111`).
Ma'lumotlar shu brauzerda saqlanadi; profil oynasida "Demo ma'lumotlarni tiklash" bor.

## 2. Server bilan (haqiqiy ishlatish)

```bash
npm install
cp api/.env.example api/.env        # sozlamalarni to'ldiring (pastda)
cp web/.env.example web/.env.local  # NEXT_PUBLIC_API_URL=http://localhost:4000
```

Bazani tanlang (`api/.env` dagi `DATABASE_URL`):

| Holat | DATABASE_URL |
|---|---|
| Neon (bulut) | `postgres://user:parol@ep-xxx.neon.tech/neondb?sslmode=require` |
| Maktab kompyuterida Postgres | `postgres://postgres:parol@localhost:5432/edunazorat` |
| Postgres o'rnatmasdan | `pglite:./data/db` (WASM Postgres, fayl papkada) |

Birinchi ishga tushirish:

```bash
# Bo'sh baza: birinchi super admin (siz)
npm run create-admin -w api -- 998901234567 "Ismingiz"
# yoki sinov uchun demo ma'lumotlar (BAZA TOZALANADI)
npm run seed -w api -- --yes

# Ikki terminalda:
npm run dev:api     # http://localhost:4000
npm run dev:web     # http://localhost:3000
```

Super admin muassasa qo'shadi va direktor raqamini kiritadi. Direktor o'qituvchilar,
sinflar, dars jadvali va o'quvchilarni (ota-ona raqamlari bilan) kiritadi. Har kim
o'z telefon raqami va SMS kod bilan kiradi.

### Ishlab chiqarish (production)

```bash
npm run build
NODE_ENV=production npm start -w api   # JWT_SECRET 32+ belgi bo'lishi shart
npm start -w web                         # yoki web'ni Vercel'ga
```

Kamera faqat **https** (yoki localhost) da ishlaydi: web'ni HTTPS bilan oching.

## Sozlamalar (api/.env)

| O'zgaruvchi | Vazifasi |
|---|---|
| `JWT_SECRET` | Kirish tokenlari kaliti, 32+ tasodifiy belgi |
| `WEB_ORIGIN`, `PUBLIC_URL` | Web manzili (CORS) va API ning tashqi manzili (fayl havolalari) |
| `ESKIZ_EMAIL`, `ESKIZ_PASSWORD`, `ESKIZ_FROM` | SMS (Eskiz.uz). Bo'sh bo'lsa kod ekranda ko'rinadi: **faqat sinov uchun** |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Web Push. Kalit yaratish: `npm run vapid -w api` |
| `CLICK_SERVICE_ID`, `CLICK_SECRET_KEY` | Click SHOP API |
| `PAYME_KEY` (`PAYME_TEST_KEY`) | Payme Merchant API |
| `SEED_DEMO=true` | Bo'sh bazaga demo ma'lumotlar |

## Onlayn to'lov

1. Click/Payme bilan shartnoma tuzing, kabinetdan kalitlarni oling.
2. `api/.env` ga yozing (maxfiy kalitlar faqat serverda).
3. To'lov tizimi kabinetida manzillar:
   - Click: Prepare `PUBLIC_URL/payments/click/prepare`, Complete `PUBLIC_URL/payments/click/complete`
   - Payme: `PUBLIC_URL/payments/payme`, hisob maydoni `order_id`
4. Direktor "Sozlamalar → Onlayn to'lov" ga ochiq ID larni kiritadi (Click service_id/merchant_id, Payme merchant ID).

Shundan keyin ota-ona "Onlayn to'lash" ni bosganda to'lov tizimi sahifasi ochiladi; tasdiq
serverga keladi, hisob-varaq yopiladi, ota-onaga bildirishnoma boradi. Kalitlar
kiritilmaguncha brauzer demo rejimida to'lov taqlid qilinadi, serverda esa o'chiq.
Hozirgi tuzilma: bitta server = bitta merchant (har maktab o'z serveri yoki bitta markaz).

## Bildirishnomalar

- Ilova ochiq: real vaqt (Server-Sent Events), sahifa qayta yuklanmaydi.
- Ilova yopiq: Web Push (VAPID kalitlari kerak). Android Chrome va kompyuter brauzerlarida
  ishlaydi; iPhone'da sayt "Bosh ekranga qo'shish" orqali o'rnatilgan bo'lishi kerak (iOS 16.4+).
  Foydalanuvchi profil oynasida "Bildirishnomalar → Yoqish" ni bosadi.

## Yuz orqali davomat (butun sinf)

- O'qituvchi telefonni (yaxshisi yotiq holda) sinfga qaratadi: har o'quvchi yoniga borish shart emas.
  Kadr to'liq HD da olinadi va bir-birini qoplaydigan 640×640 bo'laklarga bo'lib tekshiriladi:
  orqa partalardagi kichik yuzlar ham topiladi. Bo'laklar soni qurilma tezligiga moslashadi.
- Tanilgan o'quvchi **yashil doira** va boshi ustida **kichik yozuvdagi ismi** bilan belgilanadi.
  Ishonch past bo'lsa sariq doira va taxminiy ism ("Mohira J.?"): o'qituvchi bosib tasdiqlaydi.
- **Davomat hisoboti kuzatuv davomida** yig'iladi (kompyuter/planshetda yonida, telefonda kamera
  ostida): kim keldi va qachon, kim hali aniqlanmagan. Aniqlanmaganni ro'yxatdan "keldi" deb
  belgilash mumkin. "Yakunlash" → "Saqlash": qolganlar "kelmadi", kech aniqlanganlar "kechikdi".
- Uzoqdagi yuz uchun bir necha kadr namunasi o'rtachalanadi (xira kadrlar kamroq ta'sir qiladi)
  va ko'proq tasdiq talab qilinadi. Bir yuz bir vaqtda faqat bitta o'quvchiga biriktiriladi.
- Hammasi qurilmaning o'zida: **YuNet** (yuz topish) + **GhostFaceNetV1 W1.3 S1** (ArcFace, 512 o'lcham,
  MIT litsenziya, 16 MB, birinchi ochilishda yuklanib telefonda saqlanadi). Video yozilmaydi;
  ota-onaga faqat o'z farzandining yuz kesimi boradi. Yuz namunasi faqat ota-ona roziligi bilan olinadi.
- Ro'yxatga olish: old, chap, o'ng holatlarning har biri 3 ta keskin kadr o'rtachasi; xira kadr olinmaydi.

- **Demo video:** demo rejimda kamera sahifasidagi "Demo videoda ko'rish" tugmasi sinf videosini ochadi
  (sun'iy yuzlar, `web/public/demo/`, SFHQ MIT). Namunalar faqat shu oynada ishlatiladi, ma'lumotlar o'zgarmaydi.

### Aniqlik o'lchovi (LFW, 6000 juft yuz; uzoqdagi yuz kichraytirib taqlid qilingan)

| Ko'zlar orasi | Avvalgi (MobileFaceNet) | Hozirgi (GhostFaceNet S1) |
|---|---|---|
| 35 px (yaqin) | 98.6 % | **99.6 %** |
| 20 px | 97.9 % | **99.4 %** |
| 14 px | 97.3 % | **98.9 %** |
| 10 px (orqa parta) | 88.2 % | **97.9 %** |

Ko'rsatkich: begona odamni "u" deb qabul qilish 0.1 % bo'lganda to'g'ri tanish ulushi (TAR@FAR=0.1%), bitta kadr.
"30 o'quvchili sinf + 10 begona" simulyatsiyasida (bitta kadr): 35/20/14/10 px da 99.2/99.3/98.8/96.8 % tanildi,
boshqa o'quvchi deb adashish 0 %. Brauzerdagi sinf sahnasi (1920 px, 640 bo'laklar): ko'zlar orasi 13 px dan
yuqori yuzlar bitta kadrda 5/5, 11 px da 4/5; jonli kuzatuvda 5 o'quvchi 5 soniyada tanildi
(avval eng uzoqdagisi 25 soniya). Yuz namunasi 1 ta yuz uchun ~45 ms (kompyuter, WASM 1 oqim).

Muhim: bu kattalar suratlari. Bolalar, aka-uka va egizaklar uchun haqiqiy sinfda tekshirib,
**Sozlamalar → Yuz tanish → Diagnostika** tavsiyasini qo'llang. Model almashganda eski namunalar
ishlatilmaydi: ro'yxatda "Qayta olish kerak" deb ko'rinadi.

- Chegaralar muassasa sozlamalarida, "Diagnostika" o'z o'quvchilaringiz namunalari bo'yicha tavsiya beradi.
- Jonlilik tekshiruvi: kameraga yaqin yuz qimirlamasa (rasm, telefon ekrani) avtomatik
  "keldi" bo'lmaydi. Uzoqdagi kichik yuzlarda ishlamaydi (aniqlik yetmaydi), ekrandagi videoni ajratmaydi.

## NVR integratsiyasi (ixtiyoriy)

Sinf xonalaridagi kameralar tizimi (NVR loyihasi) dars davomatini o'zi olib, API orqali yuborishi mumkin.
Direktor: **Sozlamalar → NVR integratsiyasi → Kalit yaratish**. To'liq hujjat: [INTEGRATSIYA.md](INTEGRATSIYA.md).

## Tekshirish

```bash
npm test          # shared + api (haqiqiy Postgres: PGlite) + web
npm run lint
npm run build
```

API testlari: SMS kod (cheklovlar), ruxsatlar, ko'rinish qoidalari, real vaqt,
Postgres'ga saqlash, fayllar, Payme va Click to'liq jarayoni, bloklangan muassasa.

## Arxitektura qisqacha

- Har bir o'zgarish nomlangan **buyruq** (`shared/src/commands.ts`): `attendance.mark`, `grade.add`, ...
  Mantiq va ruxsatlar `shared/src/server.ts` da; natija `Patch` (qo'shilgan/o'chgan yozuvlar).
- **Ko'rinish qoidalari** (`shared/src/scope.ts`): ota-ona faqat o'z farzandini, o'qituvchi o'z
  sinflarini, direktor o'z muassasasini ko'radi; direktor shaxsiy yozishmalarni ko'rmaydi.
- Server ma'lumotlarni xotirada ushlaydi va har buyruqni Postgres'ga tranzaksiyada yozadi.
  Bitta jarayon uchun mo'ljallangan (maktab serveri yoki bitta bulut nusxasi); bir necha
  nusxaga kengaytirish keyingi bosqich.

Nom (EduNazorat) vaqtincha.
