# EduNazorat demo'sini Vercel'da ishga tushirish (Windows)

Natija: `https://....vercel.app` manzilli sayt. Uni har qanday telefonda ochish mumkin,
kamera bilan davomat ham ishlaydi (Vercel HTTPS beradi). Kompyuteringiz yoqiq turishi shart emas.

**Bu demo rejim:** server yo'q, ma'lumotlar har telefonning o'z brauzerida saqlanadi.
O'qituvchi telefonida qilingan davomat boshqa telefonda ko'rinmaydi. Vercel faqat sayt kodini
beradi, unga shaxsiy ma'lumot yuborilmaydi. Kirish kodi har doim **1111**.

Ketadigan vaqt: birinchi marta ~30-40 daqiqa. Keyingi yangilashlar 1 daqiqa.

---

## 1-qadam. Dasturlarni o'rnatish (bir marta)

| Dastur | Qayerdan | Tekshirish (PowerShell) |
|---|---|---|
| Node.js 22 LTS | https://nodejs.org (Windows Installer .msi) | `node -v` → v22... |
| Git | https://git-scm.com/download/win (hamma joyda "Next") | `git --version` |

O'rnatgach PowerShell'ni **yopib, qayta oching**.

`running scripts is disabled` xatosi chiqsa:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Git'ga ismingizni tanitish (bir marta, aks holda `git commit` xato beradi):

```powershell
git config --global user.name "Alisher Oromov"
git config --global user.email "alisheroromov473@gmail.com"
```

## 2-qadam. Loyihani ochish

`edunazorat_v0.4.zip` ni `C:\` ga oching, natijada `C:\edunazorat` papkasi bo'ladi.

**Ixtiyoriy, lekin tavsiya:** Vercel'ga yuborishdan oldin kompyuterda yig'ilishini tekshiring.
Bu yerda o'tsa, Vercel'da ham o'tadi.

```powershell
cd C:\edunazorat
npm install
npm run build -w web
```

Oxirida sahifalar ro'yxati chiqsa, hammasi joyida. Xotira yetmasa (`heap out of memory`):
brauzerni yoping va `$env:NODE_OPTIONS="--max-old-space-size=3072"` dan keyin qayta urining.

## 3-qadam. GitHub'ga joylash

1. https://github.com → **Sign up** (hisob bo'lmasa).
2. O'ng yuqoridagi **+** → **New repository**:
   - Repository name: `edunazorat`
   - **Private** ni tanlang
   - README, .gitignore, license qo'shmang (hammasi bo'sh qolsin)
   - **Create repository**
3. PowerShell'da (`<login>` o'rniga GitHub login'ingiz):

```powershell
cd C:\edunazorat
git init
git add .
git commit -m "EduNazorat demo"
git branch -M main
git remote add origin https://github.com/<login>/edunazorat.git
git push -u origin main
```

Birinchi `git push` da GitHub'ga kirish oynasi ochiladi: **Sign in with your browser** → ruxsat bering.
GitHub sahifasini yangilasangiz, `api`, `shared`, `web` papkalari ko'rinadi.

`.env` fayllari va `node_modules` yuklanmaydi: `.gitignore` ularni chiqarib tashlaydi.

## 4-qadam. Vercel'ga ulash

1. https://vercel.com → **Sign Up** → **Continue with GitHub**. Tarif: **Hobby** (bepul).
2. **Add New... → Project**.
3. Ro'yxatda `edunazorat` ko'rinmasa: **Adjust GitHub App Permissions** → repozitoriyga ruxsat bering.
4. `edunazorat` yonidagi **Import**.
5. Sozlamalar sahifasi:

| Maydon | Qiymat |
|---|---|
| Project Name | `edunazorat` (yoki boshqa nom, manzil shundan bo'ladi) |
| Framework Preset | Next.js (o'zi aniqlaydi) |
| **Root Directory** | **Edit** → `web` ni tanlang → Continue |
| Build and Output Settings | tegmang (`web/vercel.json` da yozilgan) |
| Environment Variables | **bo'sh qoldiring** |

6. **Deploy**. 3-6 daqiqa kuting. Konfetti chiqsa tayyor.
7. **Continue to Dashboard** → **Visit**: `https://edunazorat-xxxx.vercel.app`.

## 5-qadam. Telefonda sinash

1. Telefonda Chrome (iPhone'da Safari) orqali Vercel manzilini oching.
2. Kirish sahifasida demo hisobni bosing: kod **1111**.
3. Kamera sinovi uchun o'qituvchi hisobi: **Bugun → dars → Kamera** → kameraga ruxsat bering.
4. Yuz tanish uchun avval o'quvchining yuz namunasi olinadi:
   - ota-ona hisobi: **Farzand profili → Yuz orqali davomat** → **rozilik** (demo'da ba'zilariga allaqachon berilgan);
   - o'qituvchi hisobi: **Sinflar va jurnal → sinf → "Yuz namunasi" ustuni → Ro'yxatga olish**.
   Hammasini shu bitta telefonda qiling (chiqib, boshqa demo hisob bilan kiring):
   demo'da ma'lumot telefonlar orasida o'tmaydi.
5. Qulaylik uchun: Chrome menyusi → **Bosh ekranga qo'shish**, sayt ilova kabi ochiladi.

Haqiqiy bolalar yuzini sinasangiz: ota-ona roziligini oling, sinovdan keyin profil →
**Demo ma'lumotlarni tiklash** bilan o'chiring.

### Demo video (o'quvchilarsiz sinash)

Kamera sahifasida **Demo videoda ko'rish** tugmasi bor (faqat demo rejimda). Kamera o'rniga sinf videosi ochiladi:
8 ta sun'iy yuz shu sinf o'quvchilariga biriktiriladi, 7 tasi videoda bor (biri "kelmagan"), 2 ta begona yuz
ro'yxatda yo'q. Yashil doira va ismlar, "Keldi" ro'yxati va yakunlash qanday ishlashini ko'rasiz.
Yuzlar sun'iy intellekt yaratgan, mavjud bo'lmagan odamlar (SFHQ, MIT litsenziya). Bu ko'rsatish uchun,
aniqlik o'lchovi emas.

## 6-qadam. Yangilash

Men yangi zip yuborganimda:

1. Yangi zip'ni boshqa papkaga oching va uning ichidagilarni `C:\edunazorat` ga ko'chirib,
   eskilarini almashtiring (`.git` papkasiga tegmang).
2. So'ng:

```powershell
cd C:\edunazorat
git add .
git commit -m "Yangilanish"
git push
```

Vercel o'zi qayta yig'adi (1-3 daqiqa). Sayt manzili o'zgarmaydi.

---

## Buyruqlar ro'yxati

| Buyruq | Qachon |
|---|---|
| `node -v`, `npm -v`, `git --version` | O'rnatilganini tekshirish |
| `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` | "running scripts is disabled" xatosida, bir marta |
| `git config --global user.name "Ism"` | Bir marta |
| `git config --global user.email "email"` | Bir marta |
| `cd C:\edunazorat` | Har safar loyiha papkasiga o'tish |
| `npm install` | Kompyuterda sinash uchun, birinchi marta |
| `npm run build -w web` | Yig'ilishini kompyuterda tekshirish |
| `npm run dev:web` | Kompyuterda ochish: http://localhost:3000 |
| `git init` | Bir marta |
| `git remote add origin https://github.com/<login>/edunazorat.git` | Bir marta |
| `git branch -M main` | Bir marta |
| `git add .` | Har yangilanishda |
| `git commit -m "izoh"` | Har yangilanishda |
| `git push` (birinchi marta `git push -u origin main`) | Har yangilanishda, Vercel o'zi yangilaydi |
| `git status` | Nima o'zgarganini ko'rish |

---

## Muammolar

| Belgi | Yechim |
|---|---|
| `git: 'git' is not recognized` | Git o'rnatilmagan yoki PowerShell eski: o'rnating va qayta oching |
| `Author identity unknown` (commit'da) | 1-qadamdagi `git config --global ...` ikki buyrug'i |
| `remote origin already exists` | `git remote set-url origin https://github.com/<login>/edunazorat.git` |
| `failed to push ... rejected` | GitHub'da repozitoriyni README bilan yaratgansiz: `git pull origin main --allow-unrelated-histories` so'ng `git push` |
| `Repository not found` | Login yoki repozitoriy nomi xato, yoki boshqa GitHub hisobi bilan kirilgan |
| Vercel'da `No Next.js version detected` | Root Directory `web` qilinmagan: Project → **Settings → Build and Deployment → Root Directory** → `web` → **Deployments → ... → Redeploy** |
| Vercel'da `Cannot find module '@edunazorat/shared'` | Root Directory `web` va `web/vercel.json` GitHub'da borligini tekshiring; "Include files outside the root directory" yoqilgan bo'lsin (Settings → Build and Deployment) |
| Vercel'da boshqa build xatosi | **Deployments** → qizil deploy → **Build Logs**: oxirgi 30 qatorni nusxalab menga yuboring |
| Sayt ochiladi, kamera ochilmaydi | Brauzer manzil qatoridagi belgi → Ruxsatlar → Kamera: Ruxsat berish. Kamera boshqa ilovada band bo'lmasin |
| Telefonda eski versiya ko'rinadi | Sahifani yangilang; "Bosh ekran"dan ochilgan bo'lsa ilovani yopib qayta oching |
| Ma'lumotlar yo'qoldi | Demo'da ular brauzerda: boshqa brauzer, inkognito yoki tarix tozalansa yo'qoladi. Bu normal |

---

## Eslatmalar

- Vercel **Hobby** tarifi bepul, lekin tijoriy bo'lmagan ishlatish uchun. Sinov uchun yetarli.
- Bu demo. Haqiqiy o'quvchi ma'lumotlari bilan ishlatish uchun server O'zbekistonda bo'lishi
  kerak (qonun talabi): `QOLLANMA.md`, 6.2-bo'lim.
- Repozitoriy **Private** bo'lsin: kodni boshqalar ko'rmaydi, sayt esa hammaga ochiq.
