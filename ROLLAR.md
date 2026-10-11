# Rollar va kirish (login, parol)

## Kim nima qiladi

| Rol | Kim qo'shadi | Nima qiladi |
|---|---|---|
| **Super admin** (siz) | `npm run create-admin` buyrug'i | Muassasa qo'shadi, direktorni tayinlaydi va unga parol beradi, muassasani bloklaydi |
| **Direktor** | Super admin | **Hamma narsani ko'radi** (o'quvchilar, davomat, baholar, to'lovlar, hisobotlar, sozlamalar). O'zgartira oladigani: **Administratorlar** bo'limi (qo'shadi, parol beradi, o'chiradi) |
| **Administrator** | Direktor | Muassasani boshqaradi: o'qituvchi, sinf/guruh, o'quvchi, ota-ona, dars jadvali, to'lovlar, e'lonlar, sozlamalar (Click/Payme, NVR, yuz tanish). Hammaga **login va parol beradi** |
| O'qituvchi | Administrator | Davomat (kamera bilan ham), baho, vazifa, ota-ona bilan yozishma |
| Ota-ona | Administrator (o'quvchi qo'shganda) | Farzandining baho, davomat, vazifa, to'lovi, xabarlar |
| O'quvchi | Administrator (o'quvchi qo'shganda avtomatik) | O'z jadvali, baho, vazifa, davomati |

## Login

| Kim | Login | Misol |
|---|---|---|
| O'quvchi | `ism.familiya` (avtomatik, o'zgarmaydi) | `aziz.karimov`; ikkinchi Aziz Karimov: `aziz.karimov2` |
| Boshqalar | Telefon raqami | `90 123 45 67` yoki `+998 90 123 45 67` |

O'zbekcha belgilar va kirill avtomatik lotinga o'tadi: "Oʻgʻiloy Xo'jayeva" → `ogiloy.xojayeva`, "Шахзода" → `shaxzoda`.

## Parol

- Administrator **"Parol berish"** (kalit belgisi) tugmasini bosadi → tasodifiy **6 xonali** parol yaratiladi va **kirish kartasi** chiqadi: ism, sayt, login, parol.
  Kartani nusxalash, Telegram orqali yuborish yoki chop etish mumkin.
- Parol **faqat shu bir marta** ko'rinadi. Serverda faqat xesh (scrypt) saqlanadi: hech kim, siz ham, ko'ra olmaydi.
- Birinchi kirishda tizim o'z parolini qo'yishni taklif qiladi. Profil → **Parolni almashtirish** orqali ham bo'ladi.
- Unutilsa: administrator **"Yangi parol"** beradi. Eski parol ishlamay qoladi va foydalanuvchi barcha qurilmalardan chiqariladi.
- 111111, 123456 kabi oson parollar qabul qilinmaydi. Bitta login bo'yicha 10 ta xato urinishdan keyin 15 daqiqa bloklanadi.
- Arxivga o'tkazilgan o'quvchi tizimga kira olmaydi.

Nega parol ismdan hisoblanmaydi: ismdan hisoblanadigan parolni qoidani bilgan har kim (sinfdoshi, boshqa ota-ona)
istalgan bolaning hisobiga kirib, yuz rasmi, davomati va baholarini ko'ra oladi.

## Kim kimga parol bera oladi

| Kim | Kimga |
|---|---|
| Super admin | Hammaga (asosan direktorlarga: Muassasalar ro'yxatida kalit belgisi) |
| Direktor | O'z muassasasining administratorlariga |
| Administrator | O'z muassasasining o'qituvchi, o'quvchi va ota-onalariga |

## Bir kishi — bir nechta profil (o'qituvchi va ota-ona)

O'qituvchining farzandi shu maktabda o'qisa, administrator o'quvchini qo'shganda ota-ona telefoniga o'qituvchining
raqamini kiritadi. Tizim o'qituvchi hisobini o'zgartirmaydi: shu raqamga **alohida ota-ona profili** yaratiladi.

- Kirishda (login yoki SMS) bir raqamda bir nechta profil bo'lsa, **"Qaysi profil bilan kirasiz?"** oynasi chiqadi.
- Keyin istalgan vaqtda: Profil → **Boshqa profillarim** → "Ota-ona profiliga o'tish" (yoki aksincha).
- Ota-ona profilida faqat o'z farzandi ko'rinadi; o'qituvchi profilida esa o'z sinflari. Ma'lumotlar aralashmaydi.
- Bir muassasada bir rolda bitta profil: shu raqam bilan ikkinchi o'qituvchi qo'shib bo'lmaydi; aka-uka bolalar bitta ota-ona profiliga bog'lanadi.
- Boshqa muassasadagi profil (masalan, maktabda o'qituvchi, o'quv markazida ota-ona) alohida: o'sha muassasa bergan parol bilan kiriladi.
- **Direktor yoki administrator** profiliga boshqa profildan o'tib bo'lmaydi: faqat o'z paroli va 2FA bilan. Direktor esa o'z ota-ona profiliga o'ta oladi.
- Bildirishnomalar telefonda qaysi profil ochiq bo'lishidan qat'i nazar keladi.

## Bitta brauzerda bitta hisob

Bitta brauzerda bir vaqtda bitta hisob ochiq turadi (bank va davlat xizmatlari saytlaridagi kabi). Boshqa rolning sahifasi
ochilsa (masalan, super admin sifatida kirib `/director`), tizim **"Siz X sifatida kirgansiz"** deb aytadi va ikki tanlov beradi:
**Chiqib, boshqa hisob bilan kirish** (kirgach o'sha sahifaga qaytiladi) yoki o'z sahifasiga qaytish.
Ikki hisobni yonma-yon sinash uchun ikkinchisini boshqa brauzerda yoki yashirin (inkognito) oynada oching.

## SMS bilan kirish (ixtiyoriy)

Server Eskiz.uz ga ulangan bo'lsa (yoki sinov rejimida `SMS_DEV_MODE=true`), kirish sahifasida **"SMS kod"** yorlig'i paydo bo'ladi.
Telefon raqami bor har kim SMS kod bilan ham kira oladi. O'quvchiga telefon ixtiyoriy: o'quvchi tahrirlash oynasida kiritiladi.

## Birinchi ishga tushirish (haqiqiy markaz)

1. `npm run create-admin -w api -- 998XXXXXXXXX "Ismingiz"` → ekranda login va parol. Parolni unutsangiz, xuddi shu buyruq yangisini beradi.
2. Siz: **Muassasa qo'shish** → nomi, turi, direktor ismi va telefoni → ro'yxatda kalit belgisi → direktorga kirish kartasi.
3. Direktor: **Administratorlar → Administrator qo'shish** → kalit belgisi → administratorga karta.
4. Administrator: o'qituvchilar, sinf/guruhlar, o'quvchilar (ota-ona telefoni bilan) → har biriga **Parol berish**.

## Demo

Demo foydalanuvchilar paroli **246810**: ota-ona `905555555`, o'qituvchi `903333333` (u 5-A dagi Sherzod Karimovning ota-onasi ham: kirishda profil tanlanadi), o'quvchi `kamila.karimova`,
administrator `907777777`, direktor `901111111`, super admin `900000000`.

## Muassasa turi: maktab yoki o'quv markazi

Turni super admin muassasa qo'shganda tanlaydi ("Xususiy maktab" / "O'quv markazi"). Administrator uni o'zgartira olmaydi.

| | Maktab | O'quv markazi |
|---|---|---|
| Atamalar | Sinf, sinf rahbari | Guruh, mas'ul o'qituvchi (o'zbek va rus tilida avtomatik) |
| O'quvchi | Bitta sinfda | Asosiy guruh + qo'shimcha guruhlar (jadval, davomat, vazifa, yozishma hammasi bo'yicha) |
| Oylik to'lov | Sinf narxi | Barcha guruhlari narxi yig'indisi |
| Katta yoshli tinglovchi | Yo'q | Bor: ota-onasiz, xabarlar o'ziga, to'lovni o'zi ko'radi va to'laydi |
| Baho tizimi | Yoqilgan | Sozlamalar → Baholash: o'chirilsa jurnal, baholar va o'rtacha ball yashiriladi |

Guruhga qo'shilish va chiqish sanalari saqlanadi va to'lov hisobida ishlatiladi.

### O'quv markazi to'lovlari

Har guruhda (Guruhlar → tahrirlash) to'lov turi va qoldirilgan dars qoidasi tanlanadi:

| To'lov turi | Oy uchun hisob |
|---|---|
| **Oylik** | Oylik narx. Oy o'rtasida qo'shilsa/chiqsa: o'sha oy jadvaldagi dars soniga qarab (masalan 13 darsdan 7 tasi → narxning 7/13 qismi) |
| **Darsbay** | Dars narxi × shu oydagi jadval bo'yicha darslar soni |
| **Kurs uchun** | Kurs narxi guruhga qo'shilgan oyda bir marta |

| Qoldirilgan dars | Keyingi oy hisob-varag'ida |
|---|---|
| Chegirma yo'q | — |
| Faqat sababli | "Sababli" belgilangan darslar uchun chegirma |
| Har qanday | "Kelmadi" va "Sababli" darslar uchun chegirma |

Chegirma bitta dars qiymati bo'yicha: darsbayda dars narxi, oylikda oylik narx ÷ o'sha oydagi darslar soni. 1000 so'mgacha yaxlitlanadi.
Bir nechta guruhdagi o'quvchiga bitta hisob-varaq, ichida har guruh narxi va chegirmalar alohida qatorda: ota-ona ham, administrator ham ko'radi.
Maktabda hammasi avvalgidek: sinf narxi, tafsilotsiz.

Demo: o'quv markazi administratori `908888888`, direktori `902222222` (parol `246810`).

### Lidlar (qiziqqanlar)

**Lidlar** bo'limi: qo'ng'iroq qilgan, Instagram/Telegram'da yozgan yoki o'zi kelgan har bir odam.

1. **Lid qo'shish**: ism, telefon, qaysi kurs, qayerdan bildi. Bir raqam bilan ikkita ochiq lid yaratilmaydi.
2. Lidni bosing → **Bog'lanildi** → **Sinov darsiga yozish** (guruh va sana; o'sha kungi dars vaqti ko'rinadi).
3. Sinov kunidan keyin: **Sinovga keldi** yoki **Kelmadi**.
4. **O'quvchi qilish**: guruh tanlanadi, o'quvchi odatdagidek yaratiladi (Kvitansiya ID, `ism.familiya` login).
   Telefon ota-onaniki bo'ladi; "katta yoshli" belgilansa o'quvchining o'ziniki. So'ng o'quvchi sahifasida parol bering.
5. Rad etsa: **Rad etdi** + sabab (narx, vaqt, boshqa markaz...). Keyin qayta ochish mumkin.

Yuqorida voronka: har bosqichda nechta odam, konversiya foizi. Menyuda bugungi sinov darslari soni chiqadi.
Lidlarni administrator boshqaradi, direktor ko'radi; o'qituvchi va ota-onalar ko'rmaydi. Excel'ga yuklab olinadi.

### O'qituvchi ulushi (ish haqi)

O'qituvchini tahrirlashda **Ish haqi turi**:

| Tur | Hisob |
|---|---|
| Tushgan puldan foiz | O'qituvchi dars beradigan guruhlarning shu oy hisob-varaqlaridan **to'langan** pul × uning guruhdagi darslar ulushi × foiz |
| Har bir dars uchun | Davomat olingan darslar soni × summa |
| Oylik (belgilangan) | Belgilangan summa |

**O'qituvchi ulushi** bo'limi oy bo'yicha jadval: jadvaldagi va o'tilgan darslar, guruhlardan tushum, hisoblangan summa; Excel.
Davomat olinmagan dars "o'tilmagan" hisoblanadi (darsbayda pul yozilmaydi): o'qituvchilar davomatni o'z vaqtida olsin.
Ish haqini faqat direktor va administrator ko'radi. Pulni berish tizimdan tashqarida (naqd yoki karta).

### Filiallar

**Sozlamalar → Filiallar**: nomi va manzili. Guruhni tahrirlashda filial tanlanadi.
Guruhlar, O'quvchilar va To'lovlar sahifalarida **filial filtri** paydo bo'ladi (tanlov eslab qolinadi).
Guruh biriktirilgan filialni o'chirib bo'lmaydi: avval guruhlarni boshqa filialga o'tkazing.
Administratorni bitta filialga biriktirish mumkin: pastda "Filial administratori".

Demo markazda: filiallar Chilonzor (IELTS) va Yunusobod (SAT), 6 ta lid, IELTS o'qituvchisi 40%, SAT o'qituvchisi darsiga 60 000 so'm.

### Filial administratori

Direktor → **Administratorlar** → tahrirlash → **Qaysi filial**. Belgilanmasa administrator butun markazni boshqaradi.

Filial administratori:
- faqat o'z filiali guruhlarini, o'quvchilarini, to'lovlari va davomatini ko'radi (filialsiz guruhlar hammaga ochiq);
- boshqa filial guruhiga o'quvchi qo'sha olmaydi, boshqa filial o'quvchisiga parol bera olmaydi;
- hisob-varaq va e'lonni faqat o'z filialiga yuboradi;
- Sozlamalarni o'zgartirmaydi (filiallar, to'lov, dam olish kunlari: markaz administratori yoki direktor).

O'qituvchilar va lidlar umumiy: har ikki filial administratori ko'radi.

### Dam olish kunlari

**Sozlamalar → Dam olish kunlari**: nomi va sanalari (bir kun yoki oraliq, masalan ta'til).
**Davlat bayramlarini qo'shish** tugmasi kelgusi 12 oydagi qat'iy sanali bayramlarni qo'shadi. Ramazon va Qurbon hayiti har yil
boshqa sanada: ularni e'lon qilingach qo'lda qo'shing.

- Darsbay to'lovda, oy o'rtasida qo'shilganda va o'qituvchi ulushida bu kunlar dars soniga kirmaydi. Oylik narx o'zgarmaydi.
- O'qituvchi, ota-ona va o'quvchi bosh sahifasida bir kun oldin va o'sha kuni eslatma chiqadi.

### Qarzdorlarga eslatma

**To'lovlar** sahifasida **Eslatma (n)** tugmasi: ro'yxatdagi (filtr bo'yicha) barcha qarzdorlarga bildirishnoma boradi:
"Aziz Karimov: Oktabr 2026 uchun 1 750 000 so'm to'lanmagan. Kvitansiya ID: 596 013". Har qatorda qo'ng'iroqcha belgisi: bitta o'quvchiga.
Ota-onaga, katta yoshli tinglovchiga o'ziga boradi (ilova yopiq bo'lsa ham, push yoqilgan bo'lsa). Bir hisob-varaqqa sutkada bir marta.

### Katta yoshli tinglovchi va o'qituvchi yozishmasi

Katta yoshli (ota-onasiz) tinglovchi menyusida **Yozishmalar**: o'z o'qituvchilariga yozadi, o'qituvchi javob beradi.
O'qituvchi "Yangi xabar"da bunday o'quvchini tanlasa xabar uning o'ziga boradi.

Demo: Yunusobod filiali administratori `908888889`, katta yoshli tinglovchi `rustam.qodirov` (parol `246810`).
