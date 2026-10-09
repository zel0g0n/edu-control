# EduNazorat: ishga tushirish bo'yicha to'liq qo'llanma (Windows)

Buyruqlar **PowerShell** uchun yozilgan (Pusk → "PowerShell" deb qidiring).
`#` bilan boshlangan qatorlar izoh, ularni yozish shart emas.

Qisqacha yo'l:

| Maqsad | Nima qilasiz | Bo'lim |
|---|---|---|
| Ko'rib chiqish, sinash | Faqat web, demo rejim (server kerak emas) | 2 |
| Haqiqiy ishlatish | API server + baza + web | 3 |
| Telefondan ochish, kamera bilan davomat | Lokal tarmoq yoki tunnel, HTTPS | 5 |
| Internetga chiqarish | Demo: Vercel. Haqiqiy: O'zbekistondagi server | 6 |

---

## 1. Kompyuterni tayyorlash (bir marta)

### 1.1 Node.js o'rnatish

1. https://nodejs.org saytidan **22 LTS** versiyasini yuklab oling (Windows Installer, `.msi`).
2. O'rnatishda hamma joyda "Next" bosing. "Automatically install the necessary tools" belgisini **qo'ymang** (kerak emas).
3. PowerShell'ni **yopib, qayta oching** va tekshiring:

```powershell
node -v      # v22.x.x chiqishi kerak (20.12 dan past bo'lmasin)
npm -v       # 10.x.x
```

### 1.2 PowerShell skript ruxsati

`npm : ... running scripts is disabled on this system` xatosi chiqsa (bir marta bajariladi):

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
# "Y" deb tasdiqlang
```

### 1.3 Git (ixtiyoriy)

Loyiha zip'da keladi, Git shart emas. Keyinchalik GitHub'ga joylash uchun: https://git-scm.com → o'rnating → `git --version`.

### 1.4 Loyihani ochish

Zip'ni **qisqa, bo'sh joysiz va lotin harflidagi** papkaga oching, masalan `C:\edunazorat`
(`Рабочий стол\Новая папка` kabi joylar muammo beradi).

```powershell
cd C:\edunazorat
dir          # api, shared, web, package.json ko'rinishi kerak
npm install  # 5-15 daqiqa, ~1 GB yuklaydi. Faqat birinchi marta (yoki zip yangilanganda)
```

Oxirida `found 0 vulnerabilities` yoki ogohlantirishlar chiqishi normal. `ERR!` chiqsa, 10-bo'limga qarang.

Diskda bo'sh joy: kamida **3 GB** bo'lsin.

---

## 2. Demo rejim (eng tez yo'l, server kerak emas)

```powershell
cd C:\edunazorat
npm run dev:web
```

`Ready` yozuvi chiqqach brauzerda oching: **http://localhost:3000**

- Kirish sahifasida demo hisoblardan birini bosing (ota-ona, o'qituvchi, direktor, admin...).
- SMS kod har doim: **1111**
- Ma'lumotlar shu brauzerning o'zida saqlanadi. Tozalash: profil oynasi → "Demo ma'lumotlarni tiklash".
- To'xtatish: terminalda **Ctrl + C**.

> Kuchsiz kompyuterda (Celeron) birinchi sahifa ochilishi 20-60 soniya olishi mumkin: dev rejim har sahifani birinchi ochilganda yig'adi. Tezroq ishlashi uchun 4-bo'limdagi "production" rejimidan foydalaning.

---

## 3. Server rejimi (haqiqiy ishlatish)

Bu rejimda ma'lumotlar bazada saqlanadi, har kim o'z telefon raqami va SMS kod bilan kiradi,
o'zgarishlar boshqalarga real vaqtda boradi.

### 3.1 Sozlama fayllarini yaratish

```powershell
cd C:\edunazorat
copy api\.env.example api\.env
copy web\.env.example web\.env.local
notepad api\.env
```

### 3.2 `api\.env` ni to'ldirish

**JWT_SECRET** (kirish kaliti) yarating:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Chiqqan satrni nusxalab `JWT_SECRET=` dan keyin qo'ying. Boshqalarga ko'rsatmang.

**DATABASE_URL** (baza) uchun bittasini tanlang:

| Variant | Qiymat | Qachon |
|---|---|---|
| A. O'rnatilgan PGlite | `DATABASE_URL=pglite:./data/db` | Sinov, bitta maktab kompyuteri. Hech narsa o'rnatish shart emas. Baza `api\data\db` papkasida |
| B. Neon (bulut) | `DATABASE_URL=postgres://...neon.tech/neondb?sslmode=require` | Faqat sinov (xorijiy server: haqiqiy o'quvchi ma'lumotlari uchun mumkin emas, 6.2) |
| C. O'z Postgres'ingiz | `DATABASE_URL=postgres://postgres:parol@localhost:5432/edunazorat` | Maktab serverida Postgres bor bo'lsa |

**Neon ulanish satrini olish (sinov uchun):** https://neon.tech → ro'yxatdan o'ting → "Create project"
(region: Frankfurt, Uzbekistonga eng yaqin) → "Connect" tugmasi → "Connection string" ni nusxalang.
Jadvallarni server o'zi yaratadi, qo'lda hech narsa qilmaysiz.

Qolganlari hozircha shunday qolsin: SMS kalitlari bo'sh bo'lsa, kod **ekranda ko'rsatiladi** (faqat sinov uchun).

Saqlang (Ctrl + S) va yoping.

### 3.3 `web\.env.local` ni to'ldirish

```powershell
notepad web\.env.local
```

Quyidagi qatorning boshidagi `#` ni olib tashlang:

```
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### 3.4 Birinchi ma'lumotlar

Bittasini tanlang:

```powershell
# Haqiqiy ish uchun: bo'sh bazada birinchi super admin (siz). Raqam 998 bilan, bo'sh joysiz
npm run create-admin -w api -- 998901234567 "Alisher Oromov"

# YOKI sinov uchun to'liq demo ma'lumotlar. DIQQAT: bazadagi hamma narsa o'chadi!
npm run seed -w api -- --yes
```

Demo ma'lumot yozgan bo'lsangiz, kirish sahifasida demo hisoblar ro'yxati ko'rinishi uchun
`web\.env.local` ga `NEXT_PUBLIC_SHOW_DEMO=1` qatorini ham qo'shing.

### 3.5 Ishga tushirish (ikkita terminal)

**1-terminal** (server):

```powershell
cd C:\edunazorat
npm run dev:api
# "API: http://localhost:4000" chiqishi kerak
```

**2-terminal** (web), yangi PowerShell oynasida:

```powershell
cd C:\edunazorat
npm run dev:web
```

Brauzer: **http://localhost:3000** → telefon raqamingizni kiriting → "Kod olish".
Sinov rejimida kod ekranda ko'rinadi (va 1-terminalda yoziladi).

Tekshirish: http://localhost:4000/health → `{"ok":true...}` chiqsa server ishlayapti.

### 3.6 Birinchi kirishdan keyin

1. **Super admin** (siz): Muassasalar → "Muassasa qo'shish": nomi, direktor ismi va raqami.
2. **Direktor** o'z raqami bilan kiradi: o'qituvchilar → sinflar → fanlar va dars jadvali →
   o'quvchilar (ota-ona raqamlari bilan) → to'lov summasi.
3. **O'qituvchi, ota-ona, o'quvchi** o'z raqamlari bilan kiradi; rolni tizim o'zi aniqlaydi.
4. Yuz orqali davomat uchun: direktor/o'qituvchi o'quvchi kartasida ota-ona roziligini belgilaydi
   va yuz namunasini oladi (kamera kerak, 5-bo'lim).

---

## 4. Production rejimi (tezroq, doimiy ishlatish uchun)

Dev rejim kodni har safar qayta yig'adi va sekin. Kundalik ishlatishda bir marta yig'ib, tayyorini ishga tushiring.

`api\.env` ga qo'shing:

```
NODE_ENV=production
```

(Bu rejimda `JWT_SECRET` 32+ belgi bo'lmasa server ishga tushmaydi, bu himoya uchun.)

```powershell
cd C:\edunazorat
npm run build        # 3-10 daqiqa. Har kod yoki web\.env.local o'zgarganda qaytadan
```

So'ng ikki terminalda:

```powershell
npm start -w api
```

```powershell
npm start -w web
```

> Muhim: `NEXT_PUBLIC_...` qiymatlari **build vaqtida** web ichiga yoziladi. `web\.env.local` ni
> o'zgartirsangiz, `npm run build -w web` ni qayta bajaring. `api\.env` o'zgarsa, API'ni qayta ishga tushirish kifoya.

Build paytida xotira yetmasa (8 GB RAM): brauzerni yoping va

```powershell
$env:NODE_OPTIONS="--max-old-space-size=3072"
npm run build
```

---

## 5. Telefondan ochish va kamera (yuz orqali davomat)

Kamera brauzerda faqat **xavfsiz manzilda** ishlaydi: `https://...` yoki `localhost`.
Telefon kompyuterga `http://192.168...` orqali ulanadi, bu xavfsiz hisoblanmaydi. Ikki yo'l bor.

### 5.1 Lokal tarmoq (telefon va kompyuter bitta Wi-Fi'da)

**1) Kompyuter IP manzilini bilish:**

```powershell
ipconfig
# "Wireless LAN adapter Wi-Fi" → "IPv4 Address": masalan 192.168.1.10
```

**2) Windows tarmoq himoyasida (firewall) portlarni ochish** (PowerShell'ni "Run as administrator" bilan oching, bir marta):

```powershell
New-NetFirewallRule -DisplayName "EduNazorat" -Direction Inbound -Protocol TCP -LocalPort 3000,4000 -Action Allow
```

Wi-Fi tarmog'i "Public" emas, "Private" bo'lsin (Sozlamalar → Tarmoq → Wi-Fi → xususiyatlar).

**3) Server rejimida manzillarni IP ga almashtirish** (192.168.1.10 o'rniga o'z IP'ingiz):

`api\.env`:

```
WEB_ORIGIN=http://localhost:3000,http://192.168.1.10:3000
PUBLIC_URL=http://192.168.1.10:4000
```

`web\.env.local`:

```
NEXT_PUBLIC_API_URL=http://192.168.1.10:4000
```

Ikkala terminalni qayta ishga tushiring (production'da `npm run build -w web` ham).
Demo rejimda bu qadam kerak emas.

**4) Android telefonda Chrome'da kamerani yoqish:**

1. Manzil qatoriga yozing: `chrome://flags`
2. Qidiruvga: **Insecure origins treated as secure**
3. Maydonga: `http://192.168.1.10:3000` → **Enabled** → pastdagi **Relaunch**
4. Endi oching: `http://192.168.1.10:3000` → kameraga ruxsat bering.

iPhone'da bu sozlama yo'q: 5.2 dagi tunnel usulidan foydalaning.

### 5.2 Tunnel (haqiqiy HTTPS, istalgan joydan, iPhone ham)

Cloudflare'ning bepul tunneli kompyuteringizga vaqtinchalik `https://...trycloudflare.com` manzil beradi.

```powershell
winget install --id Cloudflare.cloudflared
# PowerShell'ni qayta oching
cloudflared tunnel --url http://localhost:3000
# chiqadi: https://abc-def-ghi.trycloudflare.com  ← telefonda shuni oching
```

- **Demo rejim:** bitta tunnel yetarli.
- **Server rejimi:** API uchun ham ikkinchi terminalda tunnel oching
  (`cloudflared tunnel --url http://localhost:4000`), so'ng:
  - `web\.env.local`: `NEXT_PUBLIC_API_URL=https://<api-tunnel>.trycloudflare.com`
  - `api\.env`: `WEB_ORIGIN=https://<web-tunnel>.trycloudflare.com`, `PUBLIC_URL=https://<api-tunnel>.trycloudflare.com`
  - web va API'ni qayta ishga tushiring.
- Tunnel manzili har ishga tushirishda o'zgaradi. Doimiy manzil uchun 6-bo'lim.

### 5.3 Kamera bilan davomat qanday o'tkaziladi

1. O'qituvchi: Bugun → dars → **Kamera**.
2. Telefonni **yotiq** ushlab, butun sinfni kadrga oling. Har partaga borish shart emas.
3. Tanilganlar **yashil doira** va boshi ustida ismi bilan chiqadi; o'ngdagi (yoki pastdagi)
   hisobotda "Keldi" ro'yxati to'lib boradi. Sariq doira = ishonch past, bosib tasdiqlang.
4. Orqa partalar tanilmasa, kamerada **2x zoom** qiling yoki bir-ikki qadam yaqinlashing.
5. **Yakunlash → Saqlash**: qolganlar "kelmadi", kech tanilganlar "kechikdi" bo'ladi.
   Yoki "Yo'qlamada tekshirish" bilan qo'lda tuzatasiz.

Video yozilmaydi; har ota-onaga faqat o'z farzandining yuz kesimi yuboriladi.

---

## 6. Internetga chiqarish (doimiy manzil)

### 6.1 Demo'ni Vercel'ga chiqarish (sinov uchun)

Batafsil, rasmsiz bosqichma-bosqich qo'llanma va muammolar jadvali: **VERCEL.md**.

Server ulanmagan web demo rejimda ishlaydi: ma'lumotlar har telefonning o'z brauzerida qoladi,
Vercel faqat sayt kodini beradi, hech qanday shaxsiy ma'lumot unga yuborilmaydi.
HTTPS o'zi beriladi, shuning uchun telefonda kamera darhol ishlaydi.

**1) GitHub'ga joylash** (Git o'rnatilgan bo'lsin, 1.3; https://github.com da hisob oching
va "New repository" → nomi `edunazorat`, **Private** → Create):

```powershell
cd C:\edunazorat
git init
git add .
git commit -m "EduNazorat"
git branch -M main
git remote add origin https://github.com/<sizning-login>/edunazorat.git
git push -u origin main
# birinchi marta GitHub'ga kirish oynasi ochiladi
```

`.env` fayllari va `node_modules` `.gitignore` tufayli yuklanmaydi (kalitlar GitHub'ga chiqmaydi).

**2) Vercel:**

1. https://vercel.com → "Continue with GitHub" bilan kiring.
2. "Add New → Project" → `edunazorat` repozitoriysini tanlang → **Import**.
3. **Root Directory**: `web` ni tanlang (Edit tugmasi). Framework: Next.js (o'zi aniqlaydi).
   O'rnatish va yig'ish buyruqlari `web/vercel.json` da yozilgan, ularga tegmang.
4. Environment Variables: **hech narsa qo'shmang** (`NEXT_PUBLIC_API_URL` yo'q = demo).
5. **Deploy** → 3-5 daqiqa → `https://edunazorat-xxx.vercel.app` manzili beriladi.

Telefonda shu manzilni oching, kod `1111`. Keyin har `git push` da sayt avtomatik yangilanadi.

Demo'da sinov uchun haqiqiy o'quvchilarning yuz namunasini olsangiz, u faqat o'sha telefonda
saqlanadi. Ota-onalar roziligini oling va sinovdan keyin profil → "Demo ma'lumotlarni tiklash" bilan o'chiring.

### 6.2 Haqiqiy ishlatish: server O'zbekistonda bo'lishi shart

"Shaxsga doir ma'lumotlar to'g'risida"gi qonunning 27¹-moddasi: O'zbekiston fuqarolarining
shaxsiy ma'lumotlari O'zbekiston hududidagi serverlarda saqlanishi kerak. Shuning uchun haqiqiy
ma'lumotlar bilan Neon, Render, Vercel kabi xorijiy xizmatlar **ishlatilmaydi**. Sxema:

| Qism | Qayerda |
|---|---|
| Baza (Postgres) + API + web | Toshkentdagi bitta VPS (mahalliy xosting yoki data-markaz) |
| Domen | `.uz` domen (masalan `maktab.uz`, `api.maktab.uz`) |
| SMS | Eskiz.uz (mahalliy) |

Bundan tashqari bazani Shaxsga doir ma'lumotlar bazalari davlat reyestrida ro'yxatdan o'tkazish
talabi bor. Aniq tartibni yurist bilan tekshiring.

**VPS'da o'rnatish** (Ubuntu 24.04, kamida 2 GB RAM, SSH orqali):

```bash
# Node.js 22, Postgres, Caddy (avtomatik HTTPS)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs postgresql caddy git
sudo npm install -g pm2

# Baza
sudo -u postgres psql -c "CREATE USER edu WITH PASSWORD 'KUCHLI_PAROL';"
sudo -u postgres psql -c "CREATE DATABASE edunazorat OWNER edu;"

# Loyiha
git clone https://github.com/<login>/edunazorat.git && cd edunazorat
npm install
cp api/.env.example api/.env && nano api/.env
#   NODE_ENV=production
#   DATABASE_URL=postgres://edu:KUCHLI_PAROL@localhost:5432/edunazorat
#   JWT_SECRET=...            (3.2 dagi buyruq bilan)
#   WEB_ORIGIN=https://maktab.uz
#   PUBLIC_URL=https://api.maktab.uz
#   ESKIZ_..., VAPID_...
echo "NEXT_PUBLIC_API_URL=https://api.maktab.uz" > web/.env.local
npm run build
npm run create-admin -w api -- 998901234567 "Ismingiz"

# Doimiy ishlashi (server qayta yoqilganda ham)
pm2 start "npm start -w api" --name api
pm2 start "npm start -w web" --name web
pm2 save && pm2 startup     # chiqqan buyruqni bajaring
```

Domenning DNS'ida `maktab.uz` va `api.maktab.uz` ni VPS IP'siga yo'naltiring, so'ng
`/etc/caddy/Caddyfile`:

```
maktab.uz {
    reverse_proxy localhost:3000
}
api.maktab.uz {
    reverse_proxy localhost:4000
}
```

```bash
sudo systemctl reload caddy   # HTTPS sertifikat o'zi olinadi
```

Yangilash: `git pull && npm install && npm run build && pm2 restart all`.
Zaxira nusxa (har kuni): `pg_dump edunazorat > zaxira-$(date +%F).sql` ni cron'ga qo'ying.

**Maktab ichidagi kompyuterda ishlatish** (internet shart emas, ma'lumot maktabdan chiqmaydi):
4-bo'lim (production) + 5.1 (lokal tarmoq). Kompyuter o'chmasligi kerak.

---

## 7. Qo'shimcha xizmatlarni ulash

### 7.1 SMS (Eskiz.uz)

1. https://eskiz.uz da ro'yxatdan o'ting, shartnoma va jo'natuvchi nomini tasdiqlating.
2. `api\.env`:

```
ESKIZ_EMAIL=sizning@email.uz
ESKIZ_PASSWORD=parol
ESKIZ_FROM=4546
```

Kalitlar kiritilgach kod ekranda ko'rsatilmaydi, faqat SMS'da keladi.
Majburan sinov rejimi: `SMS_DEV_MODE=true` (ishlab chiqarishda **ishlatmang**).

Kod cheklovlari: 4 raqam, 5 daqiqa amal qiladi, 5 urinish, qayta yuborish 60 soniyadan keyin, ko'p xatoda 15 daqiqa blok.

### 7.2 Push bildirishnoma (ilova yopiq bo'lsa ham)

```powershell
npm run vapid -w api
```

Chiqqan ikki qatorni `api\.env` ga qo'ying (`VAPID_PUBLIC_KEY=...`, `VAPID_PRIVATE_KEY=...`),
`VAPID_SUBJECT=mailto:sizning@email.uz`. API'ni qayta ishga tushiring.
Foydalanuvchi: profil → Bildirishnomalar → **Yoqish**. HTTPS kerak (localhost bundan mustasno).
iPhone'da sayt avval "Bosh ekranga qo'shish" orqali o'rnatilishi kerak (iOS 16.4+).

### 7.3 Click va Payme

1. To'lov tizimi bilan shartnoma tuzing, kabinetdan kalitlarni oling.
2. `api\.env`: `CLICK_SERVICE_ID`, `CLICK_SECRET_KEY`, `PAYME_KEY` (sinovda `PAYME_TEST_KEY`).
3. To'lov tizimi kabinetida manzillar (`PUBLIC_URL` = API'ning tashqi https manzili):
   - Click Prepare: `PUBLIC_URL/payments/click/prepare`
   - Click Complete: `PUBLIC_URL/payments/click/complete`
   - Payme Endpoint: `PUBLIC_URL/payments/payme`, hisob maydoni `order_id`
4. Direktor: Sozlamalar → Onlayn to'lov → ochiq ID'larni kiritadi.

Bu uchun API internetdan ochiq bo'lishi kerak (6-bo'lim yoki 5.2 tunnel bilan sinov).

---

## 8. Tekshirish buyruqlari

```powershell
npm test          # barcha testlar: shared, api (haqiqiy Postgres: PGlite), web
npm run lint      # kod uslubi
npm run build     # hammasi yig'iladimi
```

---

## 9. Buyruqlar jadvali

| Buyruq | Vazifasi |
|---|---|
| `npm install` | Kutubxonalarni o'rnatish (birinchi marta) |
| `npm run dev:web` | Web, dev rejim, http://localhost:3000 |
| `npm run dev:api` | API, dev rejim, http://localhost:4000 |
| `npm run build` | Hammasini production uchun yig'ish |
| `npm start -w api` | API, production |
| `npm start -w web` | Web, production |
| `npm run create-admin -w api -- 998XXXXXXXXX "Ism"` | Super admin qo'shish |
| `npm run seed -w api -- --yes` | Demo ma'lumotlar (bazani tozalaydi!) |
| `npm run vapid -w api` | Push kalitlarini yaratish |
| `npm test` / `npm run lint` | Testlar / kod tekshiruvi |
| `Ctrl + C` | Ishlayotgan serverni to'xtatish |

---

## 10. Ko'p uchraydigan muammolar

| Belgi | Sabab va yechim |
|---|---|
| `'node'` yoki `'npm' is not recognized` | Node o'rnatilmagan yoki terminal eski. Node'ni o'rnating va PowerShell'ni qayta oching |
| `running scripts is disabled` | 1.2-bo'lim: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `npm install` da `ERR!`, `ECONNRESET`, `ETIMEDOUT` | Internet uzildi. `npm cache clean --force`, `rmdir /s /q node_modules` (cmd'da) yoki `Remove-Item -Recurse -Force node_modules` (PowerShell), keyin `npm install` |
| `EADDRINUSE: ... :3000` (yoki 4000) | Port band: eski server ochiq qolgan. `netstat -ano \| findstr :3000` → oxirgi raqam PID → `taskkill /PID 1234 /F` |
| "Server bilan aloqa yo'q. Internetni tekshiring" | API ishlamayapti yoki manzil xato. 1-terminalni tekshiring, http://localhost:4000/health ni oching, `NEXT_PUBLIC_API_URL` ni tekshiring (production'da o'zgartirgandan keyin build) |
| Telefondan ochilmaydi | Bitta Wi-Fi'dami, IP to'g'rimi, firewall qoidasi (5.1), Wi-Fi "Private" |
| Telefonda CORS xatosi | `api\.env` dagi `WEB_ORIGIN` ga telefonda ochilgan manzilni aynan qo'shing (vergul bilan), API'ni qayta ishga tushiring |
| Kamera ochilmaydi / qora ekran | Manzil https yoki localhost emas (5-bo'lim); brauzerda kamera ruxsati bloklangan (manzil yonidagi qulf belgisi → Ruxsatlar); kamera boshqa ilovada band |
| Yuz modellari yuklanmadi | `web\public\models` da `yunet.onnx`, `ghostfacenet-w13s1.onnx` borligini tekshiring; `npm run dev:web` ni qayta ishga tushiring (`ort` papkasini o'zi ko'chiradi) |
| O'quvchi tanilmayapti | Yuz namunasi olinganmi va rozilik belgilanganmi; yorug'lik; yaqinroq yoki 2x zoom. Direktor: Sozlamalar → Yuz tanish → Diagnostika |
| SMS kod kelmayapti | Sinov rejimida kod ekranda/1-terminalda. Eskiz kalitlari va balansini tekshiring |
| `JWT_SECRET kamida 32 belgi bo'lishi kerak` | `NODE_ENV=production` da JWT_SECRET yarating (3.2) |
| Bazani butunlay tozalash (PGlite) | API'ni to'xtating, `api\data` papkasini o'chiring, 3.4 dan qayta boshlang |
| Build paytida `heap out of memory` | 4-bo'limdagi `NODE_OPTIONS` buyrug'i |
| Juda sekin ishlaydi | Production rejim (4-bo'lim), ortiqcha brauzer oynalarini yoping |

---

Savol yoki xato chiqsa: terminal oynasidagi oxirgi 20-30 qatorni nusxalab yuboring.
