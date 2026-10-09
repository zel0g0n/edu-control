// Domen turlari: web ham, API ham aynan shu shakldagi JSON bilan ishlaydi.
// Sana-vaqt: epoch millisekund. Kun: "YYYY-MM-DD". Oy: "YYYY-MM".

export type UserRole = "superAdmin" | "director" | "teacher" | "parent" | "student";

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
  active: boolean;
}

export interface SchoolClass {
  id: string;
  institutionId: string;
  name: string;
  homeroomTeacherId?: string;
  /** Oylik to'lov (so'm). */
  monthlyFee: number;
}

export interface Student {
  id: string;
  institutionId: string;
  name: string;
  classId: string;
  parentIds: string[];
  /** O'quvchining o'z akkaunti (ixtiyoriy). */
  userId?: string;
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
}

export function emptyDatabase(): Database {
  return {
    version: 2, seq: 1000, institutions: [], users: [], classes: [], students: [], lessons: [], terms: [],
    grades: [], attendance: [], homeworks: [], submissions: [], invoices: [], threads: [], messages: [], notifications: [],
  };
}
