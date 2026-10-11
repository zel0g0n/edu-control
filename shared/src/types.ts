// Domen turlari: web ham, API ham aynan shu shakldagi JSON bilan ishlaydi.
// Sana-vaqt: epoch millisekund. Kun: "YYYY-MM-DD". Oy: "YYYY-MM".

/**
 * superAdmin: platforma egasi (muassasa va direktor qo'shadi).
 * director: hamma narsani ko'radi, faqat administratorlarni boshqaradi.
 * admin: muassasani boshqaradi (o'quvchi, o'qituvchi, ota-ona, jadval, to'lov, sozlamalar, parollar).
 */
export type UserRole = "superAdmin" | "director" | "admin" | "teacher" | "parent" | "student";

export type InstitutionType = "school" | "center";

export interface PaymentProviderSettings {
  /** Click: xizmat va merchant ID (my.click.uz kabinetidan). */
  clickServiceId?: string;
  clickMerchantId?: string;
  /** Payme: merchant ID va hisob maydoni nomi (odatda "order_id"). */
  paymeMerchantId?: string;
  paymeAccountField?: string;
}

/** Joriy yuz modeli: namunalar va chegaralar shu model uchun (web/lib/face/config.ts). */
export const FACE_MODEL_ID = "ghostfacenet-w13s1-v1";

export interface InstitutionSettings {
  /** Chegaralar qaysi yuz modeli uchun sozlangan (boshqa model bo'lsa standart qiymatlar ishlatiladi). */
  faceModel?: string;
  /** Yuz tanish: shundan yuqori o'xshashlik "tanildi". */
  matchThreshold: number;
  /** Shu oraliqda "tekshiring". */
  reviewThreshold: number;
  /** Jonlilik tekshiruvi: qimirlamaydigan (rasm/ekran) yuz avtomatik tasdiqlanmaydi. */
  faceLiveness: boolean;
  /** Dars boshlanganidan necha daqiqadan keyin "kechikdi". */
  lateAfterMinutes: number;
  /** Oylik to'lov muddati: oyning shu kuni. */
  paymentDueDay: number;
  /** Baho tizimi (o'quv markazida o'chirib qo'yish mumkin). Berilmagan = yoqilgan. */
  gradesEnabled?: boolean;
  /** Filiallar (bo'sh = bitta manzil). Guruh branchId bilan biriktiriladi. */
  branches?: Branch[];
  /** Dam olish kunlari: dars bo'lmaydi, dars soniga kirmaydi. */
  holidays?: Holiday[];
  payments: PaymentProviderSettings;
  /** NVR integratsiyasi (ixtiyoriy). Kalitning o'zi saqlanmaydi, faqat SHA-256 xeshi. */
  nvr?: NvrSettings;
}

export interface NvrSettings {
  enabled: boolean;
  keyHash?: string;
  /** Kalitni tanish uchun boshi: "edn_3f9a…". */
  keyPrefix?: string;
  keyCreatedAt?: number;
}

export const DEFAULT_SETTINGS: InstitutionSettings = {
  faceModel: FACE_MODEL_ID,
  matchThreshold: 0.4,
  reviewThreshold: 0.28,
  faceLiveness: true,
  lateAfterMinutes: 10,
  paymentDueDay: 10,
  payments: {},
};

export interface Institution {
  id: string;
  name: string;
  type: InstitutionType;
  city: string;
  active: boolean;
  createdAt: number;
  settings: InstitutionSettings;
}

export interface AppUser {
  id: string;
  name: string;
  phone: string; // 998XXXXXXXXX
  role: UserRole;
  institutionId?: string;
  /** O'qituvchi fanlari. */
  subjects: string[];
  /** Ota-ona: farzandlar. */
  childIds: string[];
  /** O'quvchi akkaunti: qaysi o'quvchi. */
  studentId?: string;
  /** Kirish logini (o'quvchida ism.familiya; kattalarda yo'q: telefon raqami login). */
  login?: string;
  /** O'qituvchiga haq (faqat direktor va administrator ko'radi). */
  pay?: TeacherPay;
  /** Administrator: faqat shu filiallar (bo'sh = butun muassasa). */
  branchIds?: string[];
  active: boolean;
}

export interface SchoolClass {
  id: string;
  institutionId: string;
  name: string;
  homeroomTeacherId?: string;
  /** Oylik to'lov (so'm). */
  monthlyFee: number;
  /**
   * To'lov turi (o'quv markazi). Berilmagan = "monthly".
   * monthly: oylik narx (oy o'rtasida qo'shilsa/chiqsa dars soniga qarab bo'linadi);
   * perLesson: har dars narxi × oydagi darslar; course: kurs uchun bir marta.
   */
  billingMode?: BillingMode;
  /** Qaysi filialda (institution.settings.branches). */
  branchId?: string;
  /** perLesson: bitta dars narxi. */
  lessonPrice?: number;
  /** course: butun kurs narxi (qo'shilgan oyda bir marta). */
  coursePrice?: number;
  /** Qoldirilgan dars uchun keyingi oyda chegirma: yo'q / sababli / hammasi. */
  absenceRefund?: AbsenceRefund;
}

export type BillingMode = "monthly" | "perLesson" | "course";
export type AbsenceRefund = "none" | "excused" | "all";

/** O'quvchining guruhga qo'shilishi va chiqishi (o'quv markazi: to'lov va hisobotlar uchun). */
export interface Enrollment {
  classId: string;
  /** Qo'shilgan kun (YYYY-MM-DD). */
  from: string;
  /** Chiqqan kun; berilmagan = hozir ham shu guruhda. */
  to?: string;
}

export interface Student {
  id: string;
  institutionId: string;
  name: string;
  /** Asosiy sinf/guruh. Maktabda yagona sinf. */
  classId: string;
  /** O'quv markazi: qo'shimcha guruhlar (bir o'quvchi bir nechta guruhda). membership.ts */
  extraClassIds?: string[];
  /** Guruhlarga qo'shilish/chiqish tarixi. */
  enrollments?: Enrollment[];
  /** Katta yoshli o'quvchi (o'quv markazi): ota-ona yo'q, xabarlar o'ziga boradi. */
  adult?: boolean;
  parentIds: string[];
  /** O'quvchining o'z akkaunti (ixtiyoriy). */
  userId?: string;
  /** Kvitansiya ID: 6 xonali raqam (to'lov, administratorga murojaat). receipt.ts */
  receiptId?: string;
  birthDay?: string;
  archived: boolean;
  parentConsent: boolean;
  /** Yuz namunalari (raqamli vektorlar). Rasm emas. */
  faceTemplates: number[][];
  /** Namunalar qaysi model bilan olingan (model almashsa qayta ro'yxatga olinadi). */
  faceModel?: string;
  /** Ro'yxatga olishdagi kichik yuz kesimi (data URL). */
  facePhoto?: string;
}

/** Dars jadvalidagi bitta dars (har hafta takrorlanadi). */
export interface Lesson {
  id: string;
  classId: string;
  subject: string;
  teacherId: string;
  weekday: number; // 1 = Dushanba ... 6 = Shanba
  start: string; // "08:30"
  end: string;
  room: string;
}

export interface Term {
  id: string;
  institutionId: string;
  name: string;
  startDay: string;
  endDay: string;
}

export type GradeType = "current" | "oral" | "written" | "control" | "term" | "year";

export interface Grade {
  id: string;
  studentId: string;
  subject: string;
  value: number; // 2..5
  type: GradeType;
  /** Joriy baholar uchun dars kuni; chorak/yillik uchun chorak oxiri. */
  day: string;
  createdAt: number;
  teacherId: string;
  termId?: string;
  lessonId?: string;
  comment?: string;
}

export type AttendanceStatus = "present" | "late" | "absent" | "excused";
/** "nvr": maktab kameralari tizimi (integratsiya) belgilagan. */
export type AttendanceSource = "manual" | "face" | "nvr";

/** Bitta o'quvchining bitta darsdagi davomati. */
export interface AttendanceRecord {
  id: string;
  studentId: string;
  lessonId: string;
  day: string;
  status: AttendanceStatus;
  source: AttendanceSource;
  markedAt: number;
  markedBy: string;
  /** Faqat shu o'quvchining yuz kesimi (data URL). */
  snapshot?: string;
  matchScore?: number;
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  /** Demo rejimda data URL; backendda fayl manzili. */
  url: string;
}

export interface Homework {
  id: string;
  classId: string;
  subject: string;
  teacherId: string;
  title: string;
  description: string;
  dueDay: string;
  createdAt: number;
  attachments: Attachment[];
}

export type SubmissionStatus = "submitted" | "checked" | "returned";

export interface Submission {
  id: string;
  homeworkId: string;
  studentId: string;
  text: string;
  attachments: Attachment[];
  submittedAt: number;
  status: SubmissionStatus;
  grade?: number;
  feedback?: string;
  checkedAt?: number;
}

export type PaymentMethod = "cash" | "card" | "transfer" | "click" | "payme";

export interface PaymentEntry {
  id: string;
  amount: number;
  date: number;
  method: PaymentMethod;
  recordedBy: string;
  /** Onlayn to'lov tranzaksiyasi (Click/Payme). */
  externalId?: string;
}

export interface Invoice {
  id: string;
  studentId: string;
  month: string;
  amount: number;
  dueDay: string;
  payments: PaymentEntry[];
  note?: string;
  /** Hisob tafsiloti: har guruh narxi va chegirmalar (o'quv markazi). billing.ts */
  lines?: InvoiceLine[];
  /** Oxirgi qarz eslatmasi vaqti (ms). */
  remindedAt?: number;
}

export interface InvoiceLine {
  kind: "fee" | "absenceRefund";
  classId: string;
  amount: number;
  /** fee: shu oyda hisoblangan darslar; absenceRefund: qoldirilgan darslar soni. */
  lessons?: number;
  /** Oyning hammasi emas (oy o'rtasida qo'shilgan/chiqqan). */
  partial?: boolean;
}

export interface Thread {
  id: string;
  institutionId: string;
  studentId: string;
  parentId: string;
  teacherId: string;
  lastMessageAt: number;
}

export interface Message {
  id: string;
  threadId: string;
  senderId: string;
  text: string;
  time: number;
  readBy: string[];
}

export type NotificationType = "attendance" | "grade" | "homework" | "payment" | "announcement" | "message" | "submission";

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  /** Matn kaliti va o'zgaruvchilari: foydalanuvchi tilida chiziladi. */
  key: string;
  params: Record<string, string | number>;
  time: number;
  image?: string;
  link?: string;
  read: boolean;
}

export interface Database {
  version: 2;
  seq: number;
  institutions: Institution[];
  users: AppUser[];
  classes: SchoolClass[];
  students: Student[];
  lessons: Lesson[];
  terms: Term[];
  grades: Grade[];
  attendance: AttendanceRecord[];
  homeworks: Homework[];
  submissions: Submission[];
  invoices: Invoice[];
  threads: Thread[];
  messages: Message[];
  notifications: AppNotification[];
  /** Yangi qiziqqanlar (sinov darsi, o'quvchiga aylanish). */
  leads: Lead[];
}

export function emptyDatabase(): Database {
  return {
    version: 2, seq: 1000, institutions: [], users: [], classes: [], students: [], lessons: [], terms: [],
    grades: [], attendance: [], homeworks: [], submissions: [], invoices: [], threads: [], messages: [], notifications: [], leads: [],
  };
}

/** Lid holati: yangi → bog'lanildi → sinov darsi → o'quvchi bo'ldi (yoki rad etdi). */
export type LeadStatus = "new" | "contacted" | "trial" | "enrolled" | "lost";
export type LeadSource = "instagram" | "telegram" | "referral" | "outdoor" | "walkin" | "other";

export interface Lead {
  id: string;
  institutionId: string;
  name: string;
  /** 998XXXXXXXXX */
  phone: string;
  /** Qiziqqan yo'nalish (masalan: IELTS, SAT). */
  interest: string;
  source: LeadSource;
  status: LeadStatus;
  /** Sinov darsi: guruh va kun. */
  trialClassId?: string;
  trialDay?: string;
  /** Sinov darsiga keldimi. */
  trialCame?: boolean;
  note?: string;
  lostReason?: string;
  /** O'quvchiga aylangan bo'lsa. */
  studentId?: string;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

/** Filial (o'quv markazining boshqa manzildagi bo'limi). */
export interface Holiday {
  id: string;
  /** YYYY-MM-DD, ikkalasi ham kiradi. */
  from: string;
  to: string;
  name: string;
}

export interface Branch {
  id: string;
  name: string;
  address?: string;
}

/** O'qituvchiga haq: tushgan puldan foiz, har o'tilgan dars uchun yoki oylik maosh. */
export interface TeacherPay {
  mode: "percent" | "perLesson" | "fixed";
  /** percent: 0..100; perLesson: so'm/dars; fixed: so'm/oy. */
  value: number;
}
