import type { AttendanceSource, AttendanceStatus } from "@edunazorat/shared";

/** Saqlanmaguncha bitta o'quvchi belgisi (kamera -> yo'qlama oralig'ida). */
export interface PendingMark {
  status: AttendanceStatus;
  source: AttendanceSource;
  snapshot?: string;
  score?: number;
}

const drafts = new Map<string, Record<string, PendingMark>>();

/** Kamera natijalarini yo'qlama sahifasiga uzatish (faqat xotirada). */
export function setAttendanceDraft(lessonId: string, marks: Record<string, PendingMark>) {
  drafts.set(lessonId, marks);
}

/** O'chirmasdan o'qiydi: sahifa qayta chizilsa ham natija yo'qolmaydi. */
export function getAttendanceDraft(lessonId: string): Record<string, PendingMark> | undefined {
  return drafts.get(lessonId);
}

export function clearAttendanceDraft(lessonId: string) {
  drafts.delete(lessonId);
}
