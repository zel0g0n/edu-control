"use client";

import { useSyncExternalStore } from "react";
import {
  CommandError,
  applyPatch,
  dayKey,
  emptyDatabase,
  isoWeekday,
  monthKey,
  summarizeDay,
  type AppUser,
  type AttendanceRecord,
  type CommandMap,
  type CommandName,
  type Database,
  type Grade,
  type Homework,
  type Institution,
  type Invoice,
  type Lesson,
  type Patch,
  type SchoolClass,
  type Student,
  type Submission,
  type Term,
  type Thread,
} from "@edunazorat/shared";

import { setCurrentLang, type Lang } from "../i18n";
import { createTransport, type LiveEvent, type Transport } from "./transport";

export interface Session {
  userId: string | null;
  childId: string | null;
  lang: Lang;
}

const SESSION_KEY = "edunazorat-session-v2";

/**
 * Ilova holati: foydalanuvchi ko'ra oladigan ma'lumotlar + sessiya.
 * O'zgartirishlar faqat buyruqlar (run) orqali: demo rejimda brauzerda,
 * backend rejimida serverda bajariladi, natija Patch sifatida qo'llanadi.
 */
export class AppStore {
  db: Database = emptyDatabase();
  session: Session = { userId: null, childId: null, lang: "uz" };
  status: "idle" | "loading" | "ready" | "error" = "idle";
  errorText = "";
  private version = 0;
  private listeners = new Set<() => void>();
  private unlisten: (() => void) | null = null;
  /** Yangi bildirishnomalar kelganda (brauzer bildirishnomasi uchun). */
  onNotify: ((items: Database["notifications"]) => void) | null = null;

  constructor(private transport: Transport | null = null, private readonly clock: () => number = () => Date.now()) {}

  get now(): number {
    return this.clock();
  }
  get today(): string {
    return dayKey(this.now);
  }
  get lang(): Lang {
    return this.session.lang;
  }
  get mode() {
    return this.transport?.mode ?? "local";
  }
  get api(): Transport | null {
    return this.transport;
  }

  // ------------------------------------------------------------ obuna

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = () => {
    if (this.status === "idle" && typeof window !== "undefined") void this.boot();
    return this.version;
  };

  private changed() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  private saveSession() {
    try {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(this.session));
    } catch {
      // brauzer xotirasi yopiq: sessiya faqat shu oynada
    }
  }

  async boot() {
    if (this.status !== "idle") return;
    this.status = "loading";
    this.transport ??= createTransport();
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      if (raw) this.session = { ...this.session, ...JSON.parse(raw) };
    } catch {
      // sessiya yo'q
    }
    setCurrentLang(this.session.lang);
    await this.reload();
  }

  async reload() {
    try {
      if (this.session.userId) {
        this.db = await this.transport!.bootstrap(this.session.userId);
        if (!this.currentUser) this.session = { ...this.session, userId: null, childId: null };
        else this.startLive();
      }
      this.status = "ready";
    } catch (e) {
      if (e instanceof CommandError && e.status === 401) {
        this.session = { ...this.session, userId: null, childId: null };
        this.saveSession();
        this.status = "ready";
      } else {
        this.status = "error";
        this.errorText = e instanceof Error ? e.message : String(e);
      }
    }
    this.changed();
  }

  /** Testlar uchun: tayyor bazani yuklash. */
  load(db: Database, session: Partial<Session> = {}) {
    this.db = db;
    this.session = { ...this.session, ...session };
    this.status = "ready";
    this.changed();
  }

  // ------------------------------------------------------------ sessiya

  /** Kod yuborish. Demo/dev rejimda kodning o'zi qaytadi. */
  async requestCode(phone: string): Promise<{ devCode?: string }> {
    return this.transport!.requestCode(phone);
  }

  /** Boshqa foydalanuvchilarning o'zgarishlarini tinglash. */
  private startLive() {
    this.unlisten?.();
    this.unlisten = this.transport!.listen((e: LiveEvent) => {
      if (e.type === "reload") void this.refresh();
      else this.apply(e.patch, true);
    });
  }

  /** Bazani jimgina qayta yuklash (yangi bildirishnomalarni aniqlab). */
  async refresh() {
    const uid = this.session.userId;
    if (!uid) return;
    const before = new Set(this.db.notifications.map((n) => n.id));
    try {
      this.db = await this.transport!.bootstrap(uid);
    } catch {
      return;
    }
    this.announce(this.db.notifications.filter((n) => !before.has(n.id)));
    this.changed();
  }

  private announce(items: Database["notifications"]) {
    const mine = items.filter((n) => n.userId === this.session.userId && !n.read);
    if (mine.length) this.onNotify?.(mine);
  }

  async signIn(phone: string, code: string): Promise<AppUser> {
    const userId = await this.transport!.verifyCode(phone, code);
    this.db = await this.transport!.bootstrap(userId);
    const user = this.db.users.find((u) => u.id === userId)!;
    this.session = { ...this.session, userId, childId: user.childIds[0] ?? null };
    this.saveSession();
    this.startLive();
    this.changed();
    return user;
  }

  async signOut() {
    this.unlisten?.();
    this.unlisten = null;
    await this.transport!.signOut();
    this.session = { ...this.session, userId: null, childId: null };
    this.db = emptyDatabase();
    this.saveSession();
    this.changed();
  }

  setLang(lang: Lang) {
    this.session = { ...this.session, lang };
    setCurrentLang(lang);
    this.saveSession();
    this.changed();
  }

  selectChild(id: string) {
    this.session = { ...this.session, childId: id };
    this.saveSession();
    this.changed();
  }

  async resetDemo() {
    await this.transport!.resetDemo?.();
    await this.reload();
  }

  get currentUser(): AppUser | undefined {
    return this.session.userId ? this.userById(this.session.userId) : undefined;
  }

  /** Ota-ona uchun tanlangan farzand. */
  get child(): Student | undefined {
    const u = this.currentUser;
    if (!u) return undefined;
    const id = this.session.childId && u.childIds.includes(this.session.childId) ? this.session.childId : u.childIds[0];
    return id ? this.student(id) : undefined;
  }

  // ------------------------------------------------------------ buyruqlar

  async run<K extends CommandName>(name: K, input: CommandMap[K]): Promise<Patch> {
    const patch = await this.transport!.command(name, input);
    this.apply(patch);
    return patch;
  }

  upload(file: File) {
    return this.transport!.upload(file);
  }

  apply(patch: Patch, fromOthers = false) {
    applyPatch(this.db, patch);
    if (fromOthers) this.announce(patch.upsert?.notifications ?? []);
    this.changed();
  }

  // ------------------------------------------------------------ qidiruv

  userById(id: string): AppUser | undefined {
    return this.db.users.find((u) => u.id === id);
  }
  institution(id?: string): Institution | undefined {
    return id ? this.db.institutions.find((i) => i.id === id) : undefined;
  }
  get myInstitution(): Institution | undefined {
    return this.institution(this.currentUser?.institutionId);
  }
  student(id: string): Student | undefined {
    return this.db.students.find((s) => s.id === id);
  }
  schoolClass(id: string): SchoolClass | undefined {
    return this.db.classes.find((c) => c.id === id);
  }
  lesson(id: string): Lesson | undefined {
    return this.db.lessons.find((l) => l.id === id);
  }
  studentsOfClass(classId: string, includeArchived = false): Student[] {
    return this.db.students.filter((s) => s.classId === classId && (includeArchived || !s.archived)).sort(byName);
  }
  studentsOfInstitution(instId: string, includeArchived = false): Student[] {
    return this.db.students.filter((s) => s.institutionId === instId && (includeArchived || !s.archived)).sort(byName);
  }
  classesOfInstitution(instId: string): SchoolClass[] {
    return this.db.classes.filter((c) => c.institutionId === instId).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }
  teachersOfInstitution(instId: string, includeInactive = false): AppUser[] {
    return this.db.users.filter((u) => u.role === "teacher" && u.institutionId === instId && (includeInactive || u.active)).sort(byName);
  }
  parentsOfStudent(studentId: string): AppUser[] {
    return (this.student(studentId)?.parentIds ?? []).map((id) => this.userById(id)).filter((u): u is AppUser => !!u);
  }
  termsOf(instId: string): Term[] {
    return this.db.terms.filter((t) => t.institutionId === instId).sort((a, b) => a.startDay.localeCompare(b.startDay));
  }
  /** Bugungi (yoki eng yaqin o'tgan) chorak. */
  currentTerm(instId: string, day = this.today): Term | undefined {
    const terms = this.termsOf(instId);
    return terms.find((t) => t.startDay <= day && day <= t.endDay) ?? [...terms].reverse().find((t) => t.startDay <= day) ?? terms[0];
  }

  // ------------------------------------------------------------ jadval

  lessonsOfClass(classId: string): Lesson[] {
    return this.db.lessons.filter((l) => l.classId === classId).sort(byDayStart);
  }
  lessonsOfClassOn(classId: string, weekday: number): Lesson[] {
    return this.db.lessons.filter((l) => l.classId === classId && l.weekday === weekday).sort(byStart);
  }
  lessonsOfTeacherOn(teacherId: string, weekday: number): Lesson[] {
    return this.db.lessons.filter((l) => l.teacherId === teacherId && l.weekday === weekday).sort(byStart);
  }
  classesOfTeacher(teacherId: string): SchoolClass[] {
    const ids = new Set(this.db.lessons.filter((l) => l.teacherId === teacherId).map((l) => l.classId));
    for (const c of this.db.classes) if (c.homeroomTeacherId === teacherId) ids.add(c.id);
    return this.db.classes.filter((c) => ids.has(c.id)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }
  subjectsOfClass(classId: string): string[] {
    return [...new Set(this.db.lessons.filter((l) => l.classId === classId).map((l) => l.subject))].sort();
  }
  subjectsOfTeacherInClass(teacherId: string, classId: string): string[] {
    return [...new Set(this.db.lessons.filter((l) => l.classId === classId && l.teacherId === teacherId).map((l) => l.subject))].sort();
  }
  /** Sinfda dars o'tadigan o'qituvchilar (fanlari bilan). */
  teachersOfClass(classId: string): { teacher: AppUser; subjects: string[] }[] {
    const map = new Map<string, Set<string>>();
    for (const l of this.db.lessons.filter((x) => x.classId === classId)) map.set(l.teacherId, (map.get(l.teacherId) ?? new Set()).add(l.subject));
    const homeroom = this.schoolClass(classId)?.homeroomTeacherId;
    if (homeroom && !map.has(homeroom)) map.set(homeroom, new Set());
    return [...map.entries()]
      .map(([id, subs]) => ({ teacher: this.userById(id)!, subjects: [...subs].sort() }))
      .filter((x) => x.teacher)
      .sort((a, b) => a.teacher.name.localeCompare(b.teacher.name));
  }

  // ------------------------------------------------------------ davomat

  attendanceOfLesson(lessonId: string, day: string): AttendanceRecord[] {
    return this.db.attendance.filter((a) => a.lessonId === lessonId && a.day === day);
  }
  attendanceRecord(studentId: string, lessonId: string, day: string): AttendanceRecord | undefined {
    return this.db.attendance.find((a) => a.studentId === studentId && a.lessonId === lessonId && a.day === day);
  }
  attendanceOfStudentOn(studentId: string, day: string): AttendanceRecord[] {
    return this.db.attendance.filter((a) => a.studentId === studentId && a.day === day);
  }
  daySummary(studentId: string, day: string) {
    const s = this.student(studentId);
    const lessons = s ? this.lessonsOfClassOn(s.classId, isoWeekday(day)) : [];
    return summarizeDay(this.attendanceOfStudentOn(studentId, day), lessons);
  }
  /** O'quvchi davomatining kunlar bo'yicha tarixi (yangisi birinchi). */
  attendanceDays(studentId: string, limit = 30): string[] {
    return [...new Set(this.db.attendance.filter((a) => a.studentId === studentId).map((a) => a.day))].sort().reverse().slice(0, limit);
  }
  attendanceOfStudentBetween(studentId: string, from: string, to: string): AttendanceRecord[] {
    return this.db.attendance.filter((a) => a.studentId === studentId && a.day >= from && a.day <= to);
  }

  // ------------------------------------------------------------ baholar

  gradesOfStudent(studentId: string, opts: { subject?: string; from?: string; to?: string; includeFinal?: boolean } = {}): Grade[] {
    return this.db.grades
      .filter((g) =>
        g.studentId === studentId &&
        (!opts.subject || g.subject === opts.subject) &&
        (opts.includeFinal || (g.type !== "term" && g.type !== "year")) &&
        (!opts.from || g.day >= opts.from) && (!opts.to || g.day <= opts.to))
      .sort((a, b) => b.day.localeCompare(a.day) || b.createdAt - a.createdAt);
  }
  finalGrade(studentId: string, subject: string, termId: string, type: "term" | "year" = "term"): Grade | undefined {
    return this.db.grades.find((g) => g.studentId === studentId && g.subject === subject && g.termId === termId && g.type === type);
  }
  gradesOfLesson(lessonId: string, day: string): Grade[] {
    return this.db.grades.filter((g) => g.lessonId === lessonId && g.day === day);
  }

  // ------------------------------------------------------------ vazifa

  homeworkOfClass(classId: string): Homework[] {
    return this.db.homeworks.filter((h) => h.classId === classId).sort((a, b) => b.dueDay.localeCompare(a.dueDay));
  }
  homeworkOfTeacher(teacherId: string): Homework[] {
    return this.db.homeworks.filter((h) => h.teacherId === teacherId).sort((a, b) => b.dueDay.localeCompare(a.dueDay));
  }
  homework(id: string): Homework | undefined {
    return this.db.homeworks.find((h) => h.id === id);
  }
  submissionsOf(homeworkId: string): Submission[] {
    return this.db.submissions.filter((s) => s.homeworkId === homeworkId);
  }
  submission(homeworkId: string, studentId: string): Submission | undefined {
    return this.db.submissions.find((s) => s.homeworkId === homeworkId && s.studentId === studentId);
  }

  // ------------------------------------------------------------ to'lov

  invoicesOfStudent(studentId: string): Invoice[] {
    return this.db.invoices.filter((i) => i.studentId === studentId).sort((a, b) => b.month.localeCompare(a.month));
  }
  invoicesOfInstitution(instId: string): Invoice[] {
    const ids = new Set(this.db.students.filter((s) => s.institutionId === instId).map((s) => s.id));
    return this.db.invoices.filter((i) => ids.has(i.studentId));
  }
  currentMonth(): string {
    return monthKey(this.now);
  }

  // ------------------------------------------------------------ yozishma

  threadsOf(userId: string): Thread[] {
    return this.db.threads.filter((t) => t.parentId === userId || t.teacherId === userId).sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  }
  thread(id: string): Thread | undefined {
    return this.db.threads.find((t) => t.id === id);
  }
  messagesOf(threadId: string) {
    return this.db.messages.filter((m) => m.threadId === threadId).sort((a, b) => a.time - b.time);
  }
  unreadInThread(threadId: string, userId: string): number {
    return this.db.messages.filter((m) => m.threadId === threadId && !m.readBy.includes(userId)).length;
  }
  unreadMessages(userId: string): number {
    return this.threadsOf(userId).reduce((s, t) => s + this.unreadInThread(t.id, userId), 0);
  }

  // ------------------------------------------------------------ bildirishnomalar

  notificationsOf(userId: string) {
    return this.db.notifications.filter((n) => n.userId === userId).sort((a, b) => b.time - a.time);
  }
  unreadCount(userId: string): number {
    return this.db.notifications.filter((n) => n.userId === userId && !n.read).length;
  }
}

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);
const byStart = (a: Lesson, b: Lesson) => a.start.localeCompare(b.start);
const byDayStart = (a: Lesson, b: Lesson) => a.weekday - b.weekday || a.start.localeCompare(b.start);

export const store = new AppStore();

/** Komponent store o'zgarganda qayta chiziladi. Serverda -1. */
export function useStoreVersion(): number {
  return useSyncExternalStore(store.subscribe, store.getVersion, () => -1);
}

export function useApp(): AppStore {
  useStoreVersion();
  return store;
}
