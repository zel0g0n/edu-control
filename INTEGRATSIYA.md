# EduNazorat ↔ NVR integratsiyasi (API v1)

Bu hujjat NVR (maktab kameralari) loyihasini EduNazorat'ga ulash uchun yozilgan.
Integratsiya **ixtiyoriy modul**: maktab faqat EduNazorat'ni ham, ikkalasini birga ham ishlatishi mumkin.

## Qanday ishlaydi

```
NVR (maktab kompyuteri)                           EduNazorat server
───────────────────────                           ─────────────────
1. GET /roster    ─────────────────────────────▶  sinflar, o'quvchilar (rozilik belgisi bilan)
2. GET /schedule?day=2026-10-12 ───────────────▶  shu kungi darslar: xona, boshlanish/tugash
3. Dars vaqtida xona kamerasidan tanish (NVR o'zida)
4. POST /attendance ───────────────────────────▶  davomat saqlanadi, ota-onaga xabar boradi
```

- Kamerani darsga bog'lash **xona raqami** orqali: EduNazorat'dagi darsda `room` maydoni bor ("204"),
  NVR o'z sozlamasida "kamera → xona" jadvalini saqlaydi.
- Yuz tanish NVR'ning o'zida bo'ladi. EduNazorat yuz namunalarini (shablonlarni) **bermaydi**:
  NVR o'z ro'yxatga olish jarayoniga ega. `faceConsent: false` bo'lgan o'quvchini NVR tanimasligi kerak.
- O'qituvchi qo'lda yoki telefon kamerasi bilan belgilagan davomat **ustun**: NVR uni o'zgartira olmaydi.
- NVR qayta yuborsa (holat yangilansa), o'zining avvalgi yozuvi yangilanadi. Ota-onaga xabar faqat holat o'zgarganda boradi.

## Ulanish

1. Direktor: **Sozlamalar → NVR integratsiyasi → Kalit yaratish va yoqish**.
2. Kalit (`edn_` + 48 belgi) **bir marta** ko'rsatiladi. NVR sozlamalariga kiriting.
   Serverda faqat SHA-256 xeshi saqlanadi; yo'qolsa, yangisini yarating (eskisi darhol bekor bo'ladi).
3. Har so'rovda sarlavha:

```
Authorization: Bearer edn_3f9a...
```

(yoki `X-Api-Key: edn_3f9a...`)

Asosiy manzil: `{API}/integrations/nvr/v1`, masalan `https://api.maktab.uz/integrations/nvr/v1`.
Faqat HTTPS orqali ishlating (maktab ichki tarmog'ida server bo'lsa, ichki manzil ham bo'ladi).

## Endpointlar

### GET /ping

Kalitni tekshirish.

```json
{ "ok": true, "version": "v1", "institution": { "id": "inst_school", "name": "Kelajak xususiy maktabi" },
  "serverTime": 1791563022077, "today": "2026-10-09" }
```

### GET /roster

```json
{
  "institution": { "id": "inst_school", "name": "Kelajak xususiy maktabi" },
  "classes": [{ "id": "c_5a", "name": "5-A" }],
  "students": [{ "id": "s_a1", "name": "Aziz Karimov", "classId": "c_5a", "faceConsent": true }]
}
```

Telefon raqamlari va boshqa shaxsiy ma'lumotlar berilmaydi.

### GET /schedule?day=YYYY-MM-DD

`day` berilmasa: serverdagi bugungi kun.

```json
{
  "day": "2026-10-12",
  "lessons": [
    { "id": "l_17", "classId": "c_5a", "className": "5-A", "subject": "Matematika",
      "start": "08:30", "end": "09:15", "room": "204", "teacher": "Dilnoza Karimova" }
  ]
}
```

### POST /attendance

Bitta dars bo'yicha natija. Odatda NVR dars boshlanganidan 10-15 daqiqa o'tib bir marta yuboradi,
dars oxirida yana bir marta (kech kelganlar uchun).

```json
{
  "lessonId": "l_17",
  "day": "2026-10-12",
  "cameraId": "xona-204-old",
  "marks": [
    { "studentId": "s_a1", "status": "present", "seenAt": 1791563022077, "confidence": 0.91,
      "snapshot": "data:image/jpeg;base64,/9j/4AAQ..." },
    { "studentId": "s_a2", "status": "late", "seenAt": 1791563622077, "confidence": 0.84 },
    { "studentId": "s_a3", "status": "absent" }
  ]
}
```

| Maydon | Majburiy | Izoh |
|---|---|---|
| `lessonId`, `day` | ha | `day` hafta kuni darsning hafta kuniga mos bo'lishi kerak |
| `marks[].status` | ha | `present`, `late` yoki `absent` (`excused`ni faqat o'qituvchi qo'yadi) |
| `marks[].seenAt` | yo'q | birinchi ko'rilgan vaqt, epoch ms. Ota-onaga boradigan xabardagi vaqt shu |
| `marks[].confidence` | yo'q | 0..1 |
| `marks[].snapshot` | yo'q | **faqat shu o'quvchining** yuz kesimi, JPEG/PNG/WebP data URL, 80 KB gacha. Ota-onaga xabar bilan boradi |
| `cameraId` | yo'q | jurnal uchun |

Bitta so'rovda 200 tagacha belgi. Javob:

```json
{ "applied": 2, "skipped": [{ "studentId": "s_a3", "reason": "teacherMarked" }] }
```

`reason`: `teacherMarked` (o'qituvchi allaqachon belgilagan), `unknownStudent` (bu sinfda yo'q), `badStatus`.

## Xatolar

Javob tanasi: `{ "key": "err....", "params": {...} }`

| HTTP | key | Sabab |
|---|---|---|
| 401 | `err.nvrKey` | kalit noto'g'ri, bekor qilingan yoki integratsiya o'chirilgan |
| 403 | `err.institutionBlocked` | muassasa bloklangan |
| 404 | `err.notFound` | dars bu muassasaga tegishli emas |
| 400 | `err.nvrWrongDay`, `err.required` | kun yoki maydon xato |
| 429 | `err.tooMany` | bitta IP'dan 10 daqiqada 20 ta noto'g'ri kalit |

## Tavsiyalar NVR tomoni uchun

- Tanish chegarasini qattiq qo'ying: noto'g'ri "keldi" — "kelmadi"dan yomonroq (ota-ona aldangan bo'ladi).
  Ishonchi past bo'lsa `present` yubormang, belgisiz qoldiring: o'qituvchi yo'qlamada belgilaydi.
- Bir yuz bir darsda faqat bitta o'quvchiga biriktirilsin.
- Yuz kesimini faqat o'sha o'quvchining yuzi bilan kesing (boshqa bolalar tushmasin).
- Server ishlamay qolsa, natijani navbatda saqlab, keyin qayta yuboring (so'rov idempotent: qayta yuborish xavfsiz).
- Shaxsiy ma'lumotlar O'zbekiston hududidagi serverda saqlanishi shart (QOLLANMA.md, 6.2).

## Sinash

```bash
KEY=edn_...
API=http://localhost:4000/integrations/nvr/v1
curl -H "Authorization: Bearer $KEY" $API/ping
curl -H "Authorization: Bearer $KEY" "$API/schedule?day=2026-10-12"
curl -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"lessonId":"l_17","day":"2026-10-12","marks":[{"studentId":"s_a1","status":"present"}]}' \
  $API/attendance
```
