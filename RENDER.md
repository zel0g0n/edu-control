# Sinov serveri: API'ni Render + Neon'da ishga tushirish (bepul)

Natija:

```
Telefon/kompyuter ──▶ Vercel (sayt) ──▶ Render (API, Frankfurt) ──▶ Neon (Postgres baza, Frankfurt)
```

Demo rejimdan farqi: ma'lumotlar **bitta umumiy bazada**. O'qituvchi telefonda belgilagan davomat
ota-ona telefonida darhol ko'rinadi, xabarlar real vaqtda keladi.

Ketadigan vaqt: ~30 daqiqa. Hammasi bepul, bank kartasi so'ralmaydi.

> **Muhim (qonun).** Render va Neon serverlari Germaniyada. O'zbekiston fuqarolarining shaxsiy
> ma'lumotlari (ism, telefon, yuz namunasi) O'zbekistondagi serverda saqlanishi shart.
> Bu serverga **faqat to'qima ma'lumot** kiriting: o'ylab topilgan ismlar, o'z telefoningiz va
> jamoangiz raqamlari. Haqiqiy bolalarning yuzini ro'yxatga olmang.
> Haqiqiy o'quvchilar bilan sinov uchun: O'zbekistondagi VPS (`QOLLANMA.md`, 6.2).

---

## 1-qadam. Kodni GitHub'ga yuborish

Yangi zip'dagi fayllarni `C:\edunazorat` ga ko'chiring (`.git` papkasiga tegmang), so'ng:

```powershell
cd C:\edunazorat
git add .
git commit -m "Render sinov serveri"
git push
```

GitHub'da ildizda `render.yaml` fayli paydo bo'lishi kerak.

## 2-qadam. Neon: baza yaratish

1. https://neon.tech → **Sign up** → **Continue with GitHub**.
2. **Create project**:
   - Project name: `edunazorat`
   - Postgres version: o'zgartirmang
   - Cloud provider: **AWS**, Region: **Europe Central 1 (Frankfurt)** (Render ham shu yerda, tez ishlaydi)
3. **Create** → ochilgan oynada **Connect** → **Connection string** ni nusxalang. Ko'rinishi:

```
postgresql://neondb_owner:npg_XXXX@ep-xxx-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

Bu satr — baza paroli. Hech kimga bermang, GitHub'ga yozmang.

## 3-qadam. Web Push kalitlari (ixtiyoriy, 1 daqiqa)

Brauzer yopiq bo'lsa ham bildirishnoma kelishi uchun. Kompyuterda:

```powershell
cd C:\edunazorat
npm run vapid -w api
```

Ikki qator chiqadi: `VAPID_PUBLIC_KEY=...` va `VAPID_PRIVATE_KEY=...`. Nusxalab qo'ying.
O'tkazib yuborsangiz ham bo'ladi: bildirishnomalar faqat sayt ochiq turganda keladi.

## 4-qadam. Render: API'ni ishga tushirish

1. https://render.com → **Get Started** → **GitHub** bilan kiring.
2. Yuqorida **+ New** → **Blueprint**.
3. `edunazorat` repozitoriysini tanlang (ko'rinmasa: **Configure GitHub** → ruxsat bering) → **Connect**.
4. Render `render.yaml` ni o'qiydi va `edunazorat-api` xizmatini ko'rsatadi. Qiymatlarni kiriting:

| O'zgaruvchi | Qiymat |
|---|---|
| `DATABASE_URL` | 2-qadamdagi Neon satri |
| `WEB_ORIGIN` | Vercel manzilingiz, oxirida `/` siz: `https://edu-control-nu.vercel.app` |
| `VAPID_PUBLIC_KEY` | 3-qadamdan (yoki bo'sh) |
| `VAPID_PRIVATE_KEY` | 3-qadamdan (yoki bo'sh) |

5. **Deploy Blueprint**. 5-8 daqiqa kuting. Xizmat sahifasida **Live** yozuvi chiqsa tayyor.
6. Yuqoridagi manzilni nusxalang: `https://edunazorat-api.onrender.com` (yoki shunga o'xshash).
7. Tekshirish: brauzerda `https://edunazorat-api.onrender.com/health` ni oching:

```json
{"ok":true,"users":33,"realtime":0,"push":true}
```

`users: 33` — demo ma'lumotlar bazaga yozildi.

## 5-qadam. Vercel saytni API'ga ulash

1. Vercel → loyihangiz → **Settings → Environment Variables**:
   - Key: `NEXT_PUBLIC_API_URL`
   - Value: `https://edunazorat-api.onrender.com` (oxirida `/` siz)
   - Environments: hammasi belgilangan → **Save**
   - Yana bittasi: Key `NEXT_PUBLIC_DEMO_VIDEO`, Value `1` → **Save**. Kamera sahifasida
     **Demo videoda ko'rish** tugmasi chiqadi: yuz tanishni sun'iy yuzlardagi sinf videosida ko'rsatasiz.
     O'zbekistondagi haqiqiy serverda bu o'zgaruvchini qo'ymang.
2. **Deployments** → eng yuqoridagi → **⋯** → **Redeploy**. (Bu o'zgaruvchi sayt yig'ilayotganda
   kodga yoziladi, shuning uchun qayta yig'ish shart.)
3. 2-3 daqiqadan keyin saytni oching, **Ctrl+Shift+R**.

## 6-qadam. Kirish

Kirish sahifasida raqamni kiriting → **Kod olish**. SMS yuborilmaydi, kod sariq qutida ko'rinadi.

| Rol | Raqam |
|---|---|
| Super admin (siz) | 90 000 00 00 |
| Direktor | 90 111 11 11 |
| O'qituvchi | 90 333 33 33 |
| Ota-ona | 90 555 55 55 |

Sinab ko'ring: bir telefonda o'qituvchi bilan davomat qiling, ikkinchisida ota-ona bilan kiring:
xabar bir necha soniyada keladi.

**Birinchi ochilish sekin bo'ladi** (pastga qarang: "Server uxlashi").

---

## O'quv markazi bilan sinov

### Toza bazadan boshlash (demo ma'lumotlarsiz)

1. Render → `edunazorat-api` → **Environment** → `SEED_DEMO` ni `false` qiling → **Save** (hali qayta ishga tushirmang).
2. Neon → loyiha → **SQL Editor** → quyidagini yozib **Run**:

```sql
TRUNCATE records, files, push_subscriptions;
```

3. O'zingizni super admin qilish (kompyuterda, Neon satri bilan):

```powershell
cd C:\edunazorat
$env:DATABASE_URL="postgresql://...neon.tech/neondb?sslmode=require"
npm run create-admin -w api -- 998901234567 "Alisher Oromov"
Remove-Item Env:DATABASE_URL
```

4. Render → **Manual Deploy → Restart service** (yoki **Deploy latest commit**).
5. Saytga o'z raqamingiz bilan kiring → **Muassasa qo'shish** → direktor raqamini kiriting.
   Direktor o'z hisobida o'qituvchi, sinf, o'quvchilarni qo'shadi.

### SMS kod ekranda ko'rinishi haqida

`SMS_DEV_MODE=true` da kod har kimga ekranda ko'rinadi: raqamni bilgan odam boshqa birovning
hisobiga kira oladi. Jamoa ichida, to'qima ma'lumot bilan sinash uchun bu qulay.
Odamlarga tarqatishdan oldin Eskiz.uz SMS'ni ulang:

1. https://eskiz.uz da hisob, kirish kodi matni shablonini tasdiqlating:
   `EduNazorat: kirish kodi {kod}. Kodni hech kimga bermang.`
2. Render → **Environment**: `ESKIZ_EMAIL`, `ESKIZ_PASSWORD` qo'shing, `SMS_DEV_MODE` = `false` → **Save**.

### Server uxlashi (bepul tarif)

Render bepul serveri 15 daqiqa hech kim kirmasa "uxlaydi". Keyingi ochilishda ~50 soniya uyg'onadi
(kirish sahifasi "kutish" holatida turadi). Neon bazasi ham 5 daqiqadan keyin uxlaydi, uyg'onishi
1-2 soniya. Ma'lumotlar yo'qolmaydi.

Dars vaqtida uxlamasligi uchun (bepul):

1. https://cron-job.org → ro'yxatdan o'ting → **Create cronjob**.
2. URL: `https://edunazorat-api.onrender.com/health`
3. Schedule: **Every 10 minutes**; xohlasangiz faqat 07:00–20:00 (Custom).
4. **Create**.

Render oyiga 750 soat beradi: bitta xizmat 24/7 ishlasa ham yetadi.

### Cheklovlar

| | Bepul tarif |
|---|---|
| Baza hajmi (Neon) | 0,5 GB: bitta markazning sinovi uchun yetadi (rasm va fayllar ham bazada) |
| Server xotirasi (Render) | 512 MB |
| Zaxira nusxa | Neon 6 soatgacha orqaga qaytara oladi (**Branches → Restore**) |
| Joylashuv | Germaniya: faqat to'qima ma'lumot |

---

## Yangilash

Men yangi versiya yuborganimda: fayllarni ko'chiring va `git add .`, `git commit -m "..."`, `git push`.
Vercel (sayt) ham, Render (API) ham o'zi qayta yig'iladi. Baza saqlanib qoladi.

## Muammolar

| Belgi | Yechim |
|---|---|
| Render build: `Cannot find module` yoki `tsc: not found` | `render.yaml` GitHub'da borligini tekshiring; Render → **Settings → Build Command** `npm ci --include=dev && npm run build -w api` bo'lsin |
| Render log: `JWT_SECRET kamida 32 belgi` | **Environment** → `JWT_SECRET` → **Generate** |
| Render log: `password authentication failed` yoki `ENOTFOUND` | `DATABASE_URL` noto'g'ri nusxalangan: Neon'dan qayta nusxalang |
| `/health` ochiladi, sayt "Server bilan aloqa yo'q" deydi | `WEB_ORIGIN` Vercel manziliga aynan teng emas (`https://`, oxirida `/` yo'q). Tuzatib **Save** |
| Saytda kod sariq qutida chiqmaydi, demo kod 1111 ishlaydi | Sayt hali demo rejimda: `NEXT_PUBLIC_API_URL` saqlanmagan yoki **Redeploy** qilinmagan |
| Vercel'ning "Preview" manzilidan ochilsa ishlamaydi | Asosiy (Production) manzildan foydalaning yoki uni ham `WEB_ORIGIN` ga vergul bilan qo'shing |
| Birinchi ochilish 1 daqiqa kutadi | Server uxlagan: yuqoridagi cron-job.org |
| Kirishda `429` | Bir raqamga kod 60 soniyada bir marta: kuting |
| Boshqa xato | Render → **Logs**: oxirgi 30 qatorni menga yuboring |

## Keyin: O'zbekistondagi serverga ko'chish

Neon'dagi ma'lumotlarni ko'chirish shart emas (ular to'qima). Haqiqiy ishga tushirishda VPS'da
toza baza bilan boshlanadi (`QOLLANMA.md`, 6.2), Vercel'dagi `NEXT_PUBLIC_API_URL` yangi manzilga
almashtiriladi.
