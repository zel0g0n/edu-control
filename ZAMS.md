# EduNazorat ↔ Z_AMS ulanishi (API v1)

Z_AMS maktab kameralari orqali davomatni avtomatik oladi. Bu ulanish o'sha davomatni EduNazorat'ga olib keladi:
o'qituvchi va ota-ona sahifasida ko'rinadi, ota-onaga xabar boradi.

Ikkala dastur alohida mahsulot. Ulanish **faqat Z_AMS egasi admin panelda "Ulab berish" bosgan maktabda** ishlaydi.
Ruxsat o'chirilsa, EduNazorat ko'pi bilan 5 daqiqa ichida bu maktab ma'lumotini qabul qilishni to'xtatadi.

## Qanday ishlaydi

```
Z_AMS dasturi (maktab)          EduNazorat API                      Z_AMS admin server
──────────────────────          ──────────────                      ──────────────────
edn_ + zedu_ kalitlar ───────▶  edn_ -> qaysi muassasa
                                zedu_ -> ruxsat bormi? ───────────▶ GET /api/v1/edu/verify
                                        ◀──────────── {allowed, school_id, ttl_seconds}
POST /roster  (ism, sinf) ───▶  o'quvchilar yaratiladi / bog'lanadi
POST /lesson  (keldi/kelmadi) ▶ davomat + ota-onaga xabar
```

- **O'quvchilar ro'yxatining egasi Z_AMS.** Ism, sinf va faollik (arxiv) Z_AMS'dan keladi. Ota-onalar, telefonlar,
  to'lovlar, baholar EduNazorat'da qoladi va ustidan yozilmaydi.
- Birinchi ulanishda EduNazorat'dagi mavjud o'quvchi **ism + sinf** bo'yicha topilsa bog'lanadi (ota-onalari saqlanadi),
  topilmasa yangi o'quvchi yaratiladi. Yangi sinf ham avtomatik yaratiladi (oylik to'lov 0, keyin direktor o'zgartiradi).
- Yuz namunalari va rasmlar **yuborilmaydi**: biometrik ma'lumot maktab kompyuterida qoladi.
- Z_AMS faqat ota-ona roziligi belgilangan o'quvchilarni yuboradi (`edu_sync.REQUIRE_CONSENT`).
- Z_AMS orqali kelgan o'quvchining ota-onasidan EduNazorat **yuz roziligi so'ralmaydi**: davomatni maktab kamerasi oladi,
  rozilik maktabda olinadi, EduNazorat'ning o'z yuz tanishi (o'qituvchi telefoni) bu o'quvchiga ishlatilmaydi.
  Ota-ona sahifasida shu haqda yozuv chiqadi.
- Dars natijasi faqat haqiqatan tekshirilgan sinflar uchun keladi. Kamerasi ishlamagan sinf ("noma'lum") yuborilmaydi,
  ota-onaga yolg'on "kelmadi" xabari bormaydi.
- O'qituvchi qo'lda belgilagan davomat **ustun**: Z_AMS uni o'zgartirmaydi.
- Muassasa birinchi muvaffaqiyatli ulanishda Z_AMS maktabiga bog'lanadi. Boshqa Z_AMS maktabining kaliti bilan kirib
  bo'lmaydi. Bog'lanishni uzish: EduNazorat'da NVR kalitini bekor qilish (yangi kalit bilan qayta bog'lanadi).

## Sozlash (bir marta)

1. **EduNazorat serveri** (`api/.env`):
   ```
   ZAMS_VERIFY_URL=https://<z_ams admin server>/api/v1/edu/verify
   ZAMS_SERVICE_KEY=<Z_AMS serveridagi AMS_EDU_SERVICE_KEY bilan bir xil>
   ```
   Ikkalasi bo'lmasa ulanish o'chiq (`err.zamsDisabled`).
2. **Z_AMS admin panel** → maktab → EduNazorat → **Ulab berish**. Chiqqan `zedu_...` kalitini saqlab qo'ying.
3. **EduNazorat**, maktab administratori: Sozlamalar → NVR integratsiyasi → **Kalit yaratish va yoqish**. `edn_...` kaliti.
4. **Z_AMS dasturi** (maktab kompyuteri): Sozlamalar → EduNazorat bilan ulanish → ikkala kalitni kiriting →
   **Ulanishni tekshirish**. Shundan keyin o'quvchilar ro'yxati darhol ketadi, har dars natijasi avtomatik yuboriladi.
   Dastur yig'ilishidan oldin `config/server.py` dagi `EDU_API_URL` ga EduNazorat API manzili yoziladi.

## API

Asosiy manzil: `{API}/integrations/zams/v1`. Har so'rovda ikkala sarlavha:

```
Authorization: Bearer edn_<48 hex>
X-Zams-Key: zedu_<...>
```

### GET /ping
Ulanishni tekshiradi; birinchi marta muassasani Z_AMS maktabiga bog'laydi.
```json
{ "ok": true, "version": "v1", "institution": { "id": "inst_school", "name": "Kelajak" },
  "zams": { "schoolId": 12 }, "today": "2026-10-20", "students": 640 }
```

### POST /roster
To'liq ro'yxat (ko'pi bilan 5000). Z_AMS faqat ro'yxat o'zgarganda yuboradi.
```json
{ "full": true,
  "students": [ { "id": 15, "name": "Aziz Karimov", "className": "5-A", "active": true },
                { "id": 16, "name": "Bitirgan Bola", "className": "11-A", "active": false } ] }
```
- `active: false` — EduNazorat'da arxivlanadi. `full: true` bo'lsa ro'yxatda yo'q bog'langan o'quvchilar ham arxivlanadi.
- Himoya: bitta so'rovda 10 tadan ko'p va bog'langanlarning yarmidan ko'pi arxivlanadigan bo'lsa, rad etiladi (`err.zamsMassArchive`).

Javob: `{ "classesCreated": ["9-V"], "created": 1, "linked": 30, "updated": 0, "archived": 0, "restored": 0, "unchanged": 0, "map": { "15": "s_a0" } }`

### POST /lesson
Bitta dars natijasi (Z_AMS dars oynasi tugaganda, qo'lda tuzatilganda yana).
```json
{ "day": "2026-10-20", "lessonNo": 1, "start": "08:30",
  "classes": [ { "className": "5-A", "present": [15, 17], "absent": [16] } ] }
```
- Har sinf uchun shu kun va vaqtdagi EduNazorat darsi topiladi: avval aynan `start` da boshlanadigani, so'ng shu vaqtni
  o'z ichiga olgani, so'ng 15 daqiqagacha yaqini.
- Faqat oxirgi 7 kun va ertangi kun (`err.zamsDayRange`). Qayta yuborish xavfsiz: yozuv yangilanadi, xabar faqat holat o'zgarganda.

Javob: `{ "classes": [ { "className": "5-A", "lessonId": "l_17", "subject": "Matematika", "applied": 3, "skipped": 0 } ] }`
`reason`: `noClass` (EduNazorat'da bunday sinf yo'q), `noLesson` (shu vaqtda dars yo'q — jadvalni tekshiring), `empty`.

## Xatolar

| HTTP | key | Sabab | Z_AMS nima qiladi |
|---|---|---|---|
| 401 | `err.nvrKey`, `err.zamsKey` | kalit noto'g'ri | navbatda saqlaydi, sozlamalarda xabar |
| 403 | `err.zamsNotAllowed` | admin panel ruxsat bermagan/o'chirgan | navbatda saqlaydi |
| 403 | `err.zamsOtherSchool` | muassasa boshqa Z_AMS maktabiga bog'langan | navbatda saqlaydi |
| 400 | `err.required`, `err.zamsDayRange`, `err.zamsMassArchive` | ma'lumot yaroqsiz | navbatdan o'chiradi |
| 503 | `err.zamsUnavailable`, `err.zamsDisabled` | Z_AMS serveri javob bermadi / sozlanmagan | qayta urinadi |
| 429 | `err.tooMany` | 10 daqiqada 20 ta xato kalit | qayta urinadi |

Z_AMS admin serveri ishlamay qolsa, EduNazorat oxirgi "ruxsat bor" javobidan 24 soatgacha foydalanadi.
