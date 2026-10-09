import 'dart:typed_data';

import 'package:flutter/foundation.dart';

import '../core/format.dart';
import 'models.dart';

/// Barcha ma'lumotlar manbai. Hozir xotirada (mock), keyinroq shu
/// interfeys REST/WebSocket backendga ulanadi va UI o'zgarmaydi.
class AppRepository extends ChangeNotifier {
  final List<Institution> institutions = [];
  final List<AppUser> users = [];
  final List<SchoolClass> classes = [];
  final List<Student> students = [];
  final List<Lesson> lessons = [];
  final List<Grade> grades = [];
  final List<AttendanceRecord> attendance = [];
  final List<Homework> homeworks = [];
  final List<Invoice> invoices = [];
  final List<AppNotification> notifications = [];

  int _seq = 1000;
  String newId(String prefix) => '$prefix${_seq++}';

  /// Mock bosqichda "hozirgi vaqt" – testlar uchun almashtirish mumkin.
  DateTime Function() clock = DateTime.now;
  DateTime get now => clock();
  DateTime get today => Fmt.dayOnly(now);

  // ---------------------------------------------------------------- Qidiruv

  AppUser? userByPhone(String phone) {
    final digits = phone.replaceAll(RegExp(r'\D'), '');
    for (final u in users) {
      if (u.phone == digits) return u;
    }
    return null;
  }

  AppUser? userById(String id) {
    for (final u in users) {
      if (u.id == id) return u;
    }
    return null;
  }

  Institution? institution(String? id) {
    for (final i in institutions) {
      if (i.id == id) return i;
    }
    return null;
  }

  Student student(String id) => students.firstWhere((s) => s.id == id);

  SchoolClass schoolClass(String id) => classes.firstWhere((c) => c.id == id);

  List<Student> studentsOfClass(String classId) =>
      students.where((s) => s.classId == classId).toList()
        ..sort((a, b) => a.name.compareTo(b.name));

  List<Student> studentsOfInstitution(String institutionId) =>
      students.where((s) => s.institutionId == institutionId).toList()
        ..sort((a, b) => a.name.compareTo(b.name));

  List<SchoolClass> classesOfInstitution(String institutionId) =>
      classes.where((c) => c.institutionId == institutionId).toList()
        ..sort((a, b) => a.name.compareTo(b.name));

  List<AppUser> teachersOfInstitution(String institutionId) => users
      .where((u) => u.role == UserRole.teacher && u.institutionId == institutionId)
      .toList()
    ..sort((a, b) => a.name.compareTo(b.name));

  List<AppUser> parentsOfStudent(String studentId) =>
      student(studentId).parentIds.map(userById).whereType<AppUser>().toList();

  // ---------------------------------------------------------------- Jadval

  List<Lesson> lessonsOfClassOn(String classId, int weekday) =>
      lessons.where((l) => l.classId == classId && l.weekday == weekday).toList()
        ..sort((a, b) => a.start.compareTo(b.start));

  List<Lesson> lessonsOfTeacherOn(String teacherId, int weekday) =>
      lessons.where((l) => l.teacherId == teacherId && l.weekday == weekday).toList()
        ..sort((a, b) => a.start.compareTo(b.start));

  List<SchoolClass> classesOfTeacher(String teacherId) {
    final ids = lessons.where((l) => l.teacherId == teacherId).map((l) => l.classId).toSet();
    for (final c in classes) {
      if (c.homeroomTeacherId == teacherId) ids.add(c.id);
    }
    return classes.where((c) => ids.contains(c.id)).toList()
      ..sort((a, b) => a.name.compareTo(b.name));
  }

  List<String> subjectsOfClass(String classId) =>
      lessons.where((l) => l.classId == classId).map((l) => l.subject).toSet().toList()..sort();

  // ---------------------------------------------------------------- Baholar

  List<Grade> gradesOfStudent(String studentId, {String? subject}) => grades
      .where((g) => g.studentId == studentId && (subject == null || g.subject == subject))
      .toList()
    ..sort((a, b) => b.date.compareTo(a.date));

  double? average(Iterable<Grade> list) {
    if (list.isEmpty) return null;
    return list.fold<int>(0, (s, g) => s + g.value) / list.length;
  }

  List<Grade> gradesOfClassSubjectOn(String classId, String subject, DateTime day) {
    final ids = studentsOfClass(classId).map((s) => s.id).toSet();
    return grades
        .where((g) => ids.contains(g.studentId) && g.subject == subject && Fmt.sameDay(g.date, day))
        .toList();
  }

  void addGrade({
    required String studentId,
    required String subject,
    required int value,
    required String teacherId,
    String? comment,
  }) {
    final g = Grade(
      id: newId('g'),
      studentId: studentId,
      subject: subject,
      value: value,
      date: now,
      teacherId: teacherId,
      comment: comment,
    );
    grades.add(g);
    final s = student(studentId);
    _notifyParents(
      s,
      NotificationType.grade,
      '${s.name}: yangi baho',
      "$subject fanidan $value baho oldi${comment == null || comment.isEmpty ? '' : ' — $comment'}",
    );
    notifyListeners();
  }

  void removeGrade(String gradeId) {
    grades.removeWhere((g) => g.id == gradeId);
    notifyListeners();
  }

  // ---------------------------------------------------------------- Davomat

  AttendanceRecord? attendanceOf(String studentId, DateTime day) {
    for (final a in attendance) {
      if (a.studentId == studentId && Fmt.sameDay(a.date, day)) return a;
    }
    return null;
  }

  List<AttendanceRecord> attendanceHistory(String studentId) =>
      attendance.where((a) => a.studentId == studentId).toList()
        ..sort((a, b) => b.date.compareTo(a.date));

  void markAttendance({
    required String studentId,
    required AttendanceStatus status,
    required AttendanceSource source,
    required String markedBy,
    DateTime? day,
    Uint8List? snapshot,
    double? matchScore,
  }) {
    final d = Fmt.dayOnly(day ?? now);
    final existing = attendanceOf(studentId, d);
    final previous = existing?.status;
    if (existing != null) {
      existing
        ..status = status
        ..source = source
        ..markedAt = now
        ..markedBy = markedBy
        ..snapshot = snapshot ?? existing.snapshot
        ..matchScore = matchScore;
    } else {
      attendance.add(AttendanceRecord(
        id: newId('a'),
        studentId: studentId,
        date: d,
        status: status,
        source: source,
        markedAt: now,
        markedBy: markedBy,
        snapshot: snapshot,
        matchScore: matchScore,
      ));
    }
    if (previous != status) {
      final s = student(studentId);
      final via = source == AttendanceSource.face ? ' (yuz tanish orqali)' : '';
      final body = switch (status) {
        AttendanceStatus.present => 'Darsga keldi, ${Fmt.time(now)}$via',
        AttendanceStatus.late => 'Darsga kechikib keldi, ${Fmt.time(now)}$via',
        AttendanceStatus.absent => 'Bugun darsga kelmadi',
        AttendanceStatus.excused => 'Sababli dars qoldirdi',
      };
      _notifyParents(s, NotificationType.attendance, s.name, body,
          image: status == AttendanceStatus.present || status == AttendanceStatus.late ? snapshot : null);
    }
    notifyListeners();
  }

  /// Muassasa bo'yicha bugungi davomat foizi (belgilanganlar ichida).
  ({int marked, int present, int total}) attendanceStats(String institutionId, DateTime day) {
    final list = studentsOfInstitution(institutionId);
    var marked = 0, present = 0;
    for (final s in list) {
      final a = attendanceOf(s.id, day);
      if (a == null) continue;
      marked++;
      if (a.status == AttendanceStatus.present || a.status == AttendanceStatus.late) present++;
    }
    return (marked: marked, present: present, total: list.length);
  }

  // ---------------------------------------------------------------- Vazifa

  List<Homework> homeworkOfClass(String classId) =>
      homeworks.where((h) => h.classId == classId).toList()
        ..sort((a, b) => b.dueDate.compareTo(a.dueDate));

  void addHomework({
    required String classId,
    required String subject,
    required String teacherId,
    required String title,
    required String description,
    required DateTime dueDate,
  }) {
    homeworks.add(Homework(
      id: newId('h'),
      classId: classId,
      subject: subject,
      teacherId: teacherId,
      title: title,
      description: description,
      dueDate: dueDate,
      createdAt: now,
    ));
    for (final s in studentsOfClass(classId)) {
      _notifyParents(s, NotificationType.homework, '$subject: yangi vazifa',
          '${s.name} uchun: $title (muddat: ${Fmt.date(dueDate)})');
    }
    notifyListeners();
  }

  // ---------------------------------------------------------------- To'lov

  List<Invoice> invoicesOfStudent(String studentId) =>
      invoices.where((i) => i.studentId == studentId).toList()
        ..sort((a, b) => b.month.compareTo(a.month));

  List<Invoice> invoicesOfInstitution(String institutionId) {
    final ids = studentsOfInstitution(institutionId).map((s) => s.id).toSet();
    return invoices.where((i) => ids.contains(i.studentId)).toList()
      ..sort((a, b) => b.month.compareTo(a.month));
  }

  int debtOfStudent(String studentId) =>
      invoicesOfStudent(studentId).fold(0, (s, i) => s + i.remaining);

  void addPayment({
    required String invoiceId,
    required int amount,
    required String method,
    required String recordedBy,
  }) {
    final inv = invoices.firstWhere((i) => i.id == invoiceId);
    inv.payments.add(PaymentEntry(
      id: newId('p'),
      amount: amount,
      date: now,
      method: method,
      recordedBy: recordedBy,
    ));
    final s = student(inv.studentId);
    _notifyParents(
      s,
      NotificationType.payment,
      "To'lov qabul qilindi",
      "${s.name}, ${Fmt.month(inv.month)}: ${Fmt.money(amount)} ($method). "
          "Qoldiq: ${Fmt.money(inv.remaining)}",
    );
    notifyListeners();
  }

  // ---------------------------------------------------------------- Xabarlar

  List<AppNotification> notificationsOf(String userId) =>
      notifications.where((n) => n.userId == userId).toList()
        ..sort((a, b) => b.time.compareTo(a.time));

  int unreadCount(String userId) =>
      notifications.where((n) => n.userId == userId && !n.read).length;

  void markRead(String notificationId) {
    for (final n in notifications) {
      if (n.id == notificationId) n.read = true;
    }
    notifyListeners();
  }

  void markAllRead(String userId) {
    for (final n in notifications) {
      if (n.userId == userId) n.read = true;
    }
    notifyListeners();
  }

  /// Direktor e'loni: muassasadagi barcha (yoki bitta sinf) ota-onalariga.
  int sendAnnouncement({
    required String institutionId,
    String? classId,
    required String title,
    required String body,
  }) {
    final targets = <String>{};
    final list = classId == null ? studentsOfInstitution(institutionId) : studentsOfClass(classId);
    for (final s in list) {
      targets.addAll(s.parentIds);
    }
    for (final uid in targets) {
      notifications.add(AppNotification(
        id: newId('n'),
        userId: uid,
        title: title,
        body: body,
        time: now,
        type: NotificationType.announcement,
      ));
    }
    notifyListeners();
    return targets.length;
  }

  void _notifyParents(Student s, NotificationType type, String title, String body, {Uint8List? image}) {
    for (final pid in s.parentIds) {
      notifications.add(AppNotification(
        id: newId('n'),
        userId: pid,
        title: title,
        body: body,
        time: now,
        type: type,
        image: image,
      ));
    }
  }

  // ---------------------------------------------------------------- Yuz ro'yxati

  /// Ota-ona roziligi. Bekor qilinsa yuz namunalari darhol o'chiriladi.
  void setConsent(String studentId, bool consent) {
    final s = student(studentId);
    s.parentConsent = consent;
    if (!consent) {
      s.faceTemplates = [];
      s.facePhoto = null;
    }
    notifyListeners();
  }

  /// O'qituvchi yuzni ro'yxatga olgach (faqat rozilik bo'lsa).
  void saveFaceTemplates(String studentId, List<Float32List> templates, Uint8List? photo) {
    final s = student(studentId);
    if (!s.parentConsent) {
      throw StateError("Ota-ona roziligisiz yuz namunasi saqlanmaydi");
    }
    s.faceTemplates = templates;
    s.facePhoto = photo;
    notifyListeners();
  }

  /// Sinf (yoki butun muassasa) bo'yicha yuz namunalari.
  Map<String, List<Float32List>> faceTemplatesOf(Iterable<Student> list) => {
        for (final s in list)
          if (s.parentConsent && s.faceTemplates.isNotEmpty) s.id: s.faceTemplates,
      };

  // ---------------------------------------------------------------- Super admin

  void addInstitution({required String name, required InstitutionType type, required String city}) {
    institutions.add(Institution(
      id: newId('i'),
      name: name,
      type: type,
      city: city,
      createdAt: now,
    ));
    notifyListeners();
  }

  void setInstitutionActive(String id, bool active) {
    institution(id)?.active = active;
    notifyListeners();
  }
}
