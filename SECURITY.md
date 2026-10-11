# Xavfsizlik

Bu hujjat: tizimda qanday himoya bor, haqiqiy o'quvchilar bilan ishga tushirishdan oldin nima qilish kerak
va qaysi xavflar hali qolgan.

## 1. Himoya choralari

### Kirish va sessiyalar
- Parollar scrypt bilan xeshlanadi, mijozga hech qachon yuborilmaydi. Parolni faqat administrator (yoki direktor) beradi, u tasodifiy.
- Ota-ona va o'quvchi: 6 raqamli parol (oson ketma-ketliklar rad etiladi). Direktor, administrator va super admin:
  kamida 10 belgi, harf va raqam aralash (tizim bergani ham shunday).
- Bir login bo'yicha 10 xato urinish → 15 daqiqa blok. Bir IP manzildan 10 daqiqada 30 tadan ortiq kirish urinishi → kutish.
- Login topilmasa ham, parol noto'g'ri bo'lsa ham bir xil javob va bir xil vaqt: "bunday foydalanuvchi bormi" bilib bo'lmaydi.
- Kirish tokeni **15 daqiqalik** va faqat xotirada (brauzer xotirasiga yozilmaydi). Muddati tugashidan oldin
  refresh token bilan jimgina yangilanadi; refresh token **har safar almashadi**. Eski refresh token qayta ishlatilsa
  (o'g'irlangan bo'lishi mumkin) butun sessiya bekor qilinadi va Faoliyat jurnaliga yoziladi.
- Production'da (`AUTH_COOKIE=true`) refresh token **httpOnly, Secure, SameSite=Strict cookie**'da: JavaScript uni o'qiy olmaydi,
  XSS bo'lsa ham o'g'irlab bo'lmaydi. Buning uchun sayt va API bitta domen ostida bo'lishi kerak
  (`app.maktab.uz` va `api.maktab.uz`). Pilot (Vercel + Render, turli domenlar) da refresh token brauzer xotirasida.
- Sessiyalar serverda saqlanadi: 30 kun faol bo'lmasa yoki 90 kundan keyin qayta kirish kerak.
  "Chiqish" sessiyani serverda ham bekor qiladi. Profil → **Qurilmalar**: qayerdan kirilganini ko'rish va boshqa qurilmalardan chiqish.
- Parol tiklansa: shu foydalanuvchining barcha qurilmalari chiqariladi. O'zi almashtirsa: boshqa qurilmalar chiqariladi.
- Token URL'da yuborilmaydi (real vaqt ulanishi uchun bir martalik 60 soniyalik chipta).
- **Ikki bosqichli kirish (2FA, TOTP)**: Google/Microsoft Authenticator kabi ilova kodi. Direktor, administrator va super admin
  uchun production'da **majburiy** (`REQUIRE_STAFF_2FA`, standart: yoqilgan): yoqmaguncha ilova ochilmaydi, faqat sozlash ekrani.
  Boshqalar profildan ixtiyoriy yoqadi. Kalit bazada AES-256-GCM bilan shifrlangan (`MFA_KEY`), bitta kod ikki marta ishlamaydi,
  10 ta bir martalik zaxira kod (faqat xeshi saqlanadi), kod terish 10 daqiqada 10 urinish bilan cheklangan.
  Telefon yo'qolsa: rahbar parolni tiklaydi → 2FA o'chadi va keyingi kirishda qayta sozlanadi. SMS bilan kirishda ham 2FA so'raladi.

### Huquqlar
- Har bir buyruq serverda tekshiriladi: ota-ona faqat o'z farzandini, o'qituvchi o'z sinflarini, filial administratori
  o'z filialini ko'radi va o'zgartiradi. Direktor faqat ko'radi. Ko'rinish qoidalari `shared/src/scope.ts`, buyruqlar `shared/src/server.ts`.
- Har bir buyruq kirishi qat'iy sxema bilan tekshiriladi (`shared/src/validation.ts`): tur, uzunlik, sana/oy/telefon formati,
  rasm va fayl havolasi (faqat `data:` va `https:`; `javascript:` taqiqlangan). Noma'lum maydonlar tashlanadi.

- Bir telefonda bir nechta profil (o'qituvchi + ota-ona): har biri alohida foydalanuvchi, huquqlari alohida. Parolsiz
  o'tish faqat shu muassasadagi oddiy profillarga (ota-ona, o'qituvchi, o'quvchi); direktor/administrator profiliga
  faqat o'z paroli va 2FA bilan, boshqa muassasa profiliga faqat o'sha muassasa bergan parol bilan (bir muassasa
  administratori parol berib boshqa muassasaga yo'l ocholmaydi). 2FA yoqilgan profilga 2FA'siz profildan o'tilmaydi.
  O'tishda joriy sessiya yopiladi, jurnalga `auth.switchProfile` yoziladi.

### Tarmoq va brauzer
- Sayt: Content-Security-Policy **nonce bilan**: har so'rovga yangi tasodifiy nonce, faqat shu nonce'li skriptlar ishlaydi
  (`'unsafe-inline'` va begona skriptlar taqiqlangan, `'strict-dynamic'`). Ma'lumot faqat o'z API'mizga yuboriladi, shuning uchun
  XSS bo'lsa ham token begona serverga chiqib keta olmaydi. HSTS, saytni boshqa sahifaga joylash taqiqlangan (clickjacking),
  kamera faqat o'z saytimizda. Sahifalar har so'rovda serverda chiziladi (nonce uchun shart; `web/src/proxy.ts`).
- API: faqat ruxsat berilgan sayt manzili (CORS), `nosniff`, `X-Frame-Options: DENY`, shaxsiy javoblar keshlanmaydi.
- So'rov cheklovlari: buyruqlar (300/daqiqa), fayl yuklash (30/soat, 50 MB/kun foydalanuvchiga), SMS kod so'rash.
- Fayllar faqat **imzolangan havola** bilan ochiladi: imzo 15 daqiqa amal qiladi va bitta foydalanuvchiga bog'langan.
  Imzoni faqat faylni ko'rish huquqi borlar oladi (o'zi yuklagan yoki o'ziga ko'rinadigan vazifa/topshiriqdagi fayl).
  Havola tarqalib ketsa ham 15 daqiqadan keyin ochilmaydi.
- Yuklangan fayl brauzerda dastur sifatida ochilmaydi (alohida CSP, `nosniff`, xavfli turlar yuklab olinadi).

### Faoliyat jurnali
- Har bir o'zgartirish (to'lov, chegirma, o'quvchi, xodim, sozlama), parol berish, kirish va noto'g'ri urinishlar yoziladi.
- Direktor: **Faoliyat jurnali** bo'limi. Yozuvlarni ilovadan o'zgartirib yoki o'chirib bo'lmaydi.
- Yuz namunasi, rasm, xabar matni, parol va kalitlar jurnalga yozilmaydi.

### To'lovlar
- Click: imzo (MD5, maxfiy kalit), Payme: Basic auth kalit. Bitta tranzaksiya ikki marta yozilmaydi.
- Merchant kalitlari faqat serverda (muhit o'zgaruvchilari), bazada va saytda yo'q.

### Bir nechta server nusxasi
- API'ni bir nechta nusxada (load balancer ortida) ishga tushirish mumkin: buyruqlar butun klaster bo'yicha Postgres qulfi ostida
  ketma-ket bajariladi, har o'zgarish `patch_log` ga yoziladi va NOTIFY bilan boshqa nusxalarga yetadi (xabar yo'qolsa ham
  5 soniyada bazadan tekshiriladi). Sessiyalar, refresh tokenlar, chiptalar, so'rov cheklovlari, xato urinishlar, SMS kodlar
  bazada — istalgan nusxa istalgan so'rovni qabul qiladi (sticky session kerak emas). Testlar: `api/src/test/cluster.test.ts`
  (ikki nusxa, haqiqiy Postgres: parallel buyruqlar, real vaqt, sessiya bekor qilish, parol tiklash, umumiy cheklov, 2FA).

### Kod sifati
- Har push'da GitHub Actions (`.github/workflows/ci.yml`): tiplar, lint, barcha testlar, `npm audit` (zaif kutubxonalar), sayt build'i.
- Boshdan-oxir testlar (`web/e2e`, Playwright): haqiqiy API va production sayt brauzerda sinaladi — kirish, noto'g'ri parol,
  sahifa yangilanganda sessiya, boshqa qurilmadan chiqarish, chiqish, davomat → ota-onaga real vaqt xabari,
  lid → o'quvchi → parol kartasi, faoliyat jurnali, filial cheklovi, xavfsizlik sarlavhalari. CI'da ham ishlaydi.
  Lokal: `npm run build -w api && npm run e2e:build -w web && npm run e2e -w web`.

## 2. Haqiqiy ishga tushirishdan oldin (majburiy)

1. **Server O'zbekistonda** (qonun: fuqarolar shaxsiy ma'lumoti). `QOLLANMA.md`, 6.2.
2. API muhitida `APP_ENV=production`, `AUTH_COOKIE=true` va `MFA_KEY` (32 bayt, base64). Bunda server quyidagilar bo'lsa **ishga tushmaydi**: demo ma'lumot (`SEED_DEMO`),
   SMS sinov rejimi, qisqa `JWT_SECRET`, `http://` manzillar, pglite baza, Payme test kaliti, cookie rejimi o'chiq,
   2FA majburiyligi o'chirilgan yoki `MFA_KEY` yo'q. `MFA_KEY` ni yo'qotmang: usiz 2FA kalitlarini ochib bo'lmaydi.
   Sayt va API bitta domen ostida: masalan `app.maktab.uz` (sayt) va `api.maktab.uz` (API).
3. `JWT_SECRET`: `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`. Hech kimga bermang.
4. HTTPS (nginx + Let's Encrypt). API to'g'ridan-to'g'ri internetga ochiq bo'lsa `TRUST_PROXY=0`, nginx ortida `1`.
5. **Zaxira nusxa**: `tools/ops/backup.sh` ni cron'ga qo'ying (har kuni). Haftada bir marta nusxani boshqa joyga ko'chiring.
   Oyiga bir marta `tools/ops/restore.sh` bilan bo'sh bazaga tiklab ko'ring: tiklab ko'rilmagan nusxa nusxa emas.
6. Eskiz SMS ulang (`ESKIZ_EMAIL`, `ESKIZ_PASSWORD`).
7. Super admin paroli: `npm run create-admin -w api -- <telefon> "<ism>"`, keyin darhol almashtiring.
8. Ota-onalardan yozma rozilik (shaxsiy ma'lumot va yuz surati) va foydalanish shartlari.
9. Mustaqil xavfsizlik tekshiruvi (pentest): haqiqiy bolalar ma'lumoti kiritilishidan oldin bir marta.

## 3. Qolgan xavflar (ochiq aytilgan)

| Xavf | Hozirgi holat | Keyingi qadam |
|---|---|---|
| Har nusxa butun bazani xotirada saqlaydi | O'nlab markaz uchun yetadi (nusxa qo'shilsa ham xotira kamaymaydi) | Juda katta hajmda: ma'lumotni so'rov bo'yicha bazadan o'qish |
| Pilot rejimida refresh token brauzer xotirasida | Kirish tokeni 15 daqiqa, refresh almashinadi, qayta ishlatilsa sessiya bekor, CSP tokenni chiqarib yuborishni to'sadi | Production'da `AUTH_COOKIE=true` (majburiy) |
| CSS uchun `'unsafe-inline'` (style atributlari) | Faqat uslub; skriptlar nonce bilan qat'iy | Uslublarni to'liq CSS sinflariga o'tkazish |
| Jurnal ilova ichida o'chirilmaydi | Baza egasi (server administratori) o'chira oladi | Jurnalni alohida joyga ham yuborish |
| Dasturchi kutubxonalarida (eslint) ma'lum zaifliklar | Faqat ishlab chiqishda, serverga tushmaydi (`npm audit --omit=dev` toza) | Next.js eslint yangilanishi |

## 4. Hodisa bo'lsa

- **Parol yoki telefon yo'qoldi**: administrator yangi parol beradi → eski qurilmalar avtomatik chiqadi.
- **Administrator hisobi buzildi**: direktor uni faolsizlantiradi (Administratorlar) → darhol kira olmaydi; Faoliyat jurnalida nimalar qilinganini ko'ring.
- **Server kaliti (`JWT_SECRET`) oshkor bo'ldi**: yangisini qo'yib serverni qayta ishga tushiring → hamma qayta kiradi.
- **Butun muassasani to'xtatish**: super admin → Muassasalar → bloklash.
- Zaiflik topsangiz: loyiha egasiga shaxsan xabar bering, ommaga e'lon qilmang.
