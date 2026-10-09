import 'dart:typed_data';

// Domen modellari. Backend qo'shilganda shu modellar JSON bilan
// seriyalashtiriladi (fromJson/toJson), UI esa o'zgarmaydi.

enum UserRole { superAdmin, director, teacher, parent }

extension UserRoleX on UserRole {
  String get label => switch (this) {
        UserRole.superAdmin => 'Super admin',
        UserRole.director => 'Direktor',
        UserRole.teacher => "O'qituvchi",
        UserRole.parent => 'Ota-ona',
      };
}

enum InstitutionType { school, center }

extension InstitutionTypeX on InstitutionType {
  String get label => switch (this) {
        InstitutionType.school => 'Xususiy maktab',
        InstitutionType.center => "O'quv markazi",
      };
}

class Institution {
  final String id;
  String name;
  final InstitutionType type;
  final String city;
  bool active;
  final DateTime createdAt;

  Institution({
    required this.id,
    required this.name,
    required this.type,
    required this.city,
    this.active = true,
    required this.createdAt,
  });
}

class AppUser {
  final String id;
  final String name;
  final String phone; // 998XXXXXXXXX
  final UserRole role;
  final String? institutionId;
  final String? subject; // o'qituvchi uchun
  final List<String> childIds; // ota-ona uchun

  const AppUser({
    required this.id,
    required this.name,
    required this.phone,
    required this.role,
    this.institutionId,
    this.subject,
    this.childIds = const [],
  });
}

class SchoolClass {
  final String id;
  final String institutionId;
  final String name;
  final String homeroomTeacherId;
  final List<String> studentIds;

  const SchoolClass({
    required this.id,
    required this.institutionId,
    required this.name,
    required this.homeroomTeacherId,
    required this.studentIds,
  });
}

class Student {
  final String id;
  final String institutionId;
  final String name;
  final String classId;
  final List<String> parentIds;

  /// Ota-ona yuz tanishga rozilik berganmi.
  bool parentConsent;

  /// Yuz namunalari (MobileFaceNet embedding, turli burchaklardan).
  /// Rasmning o'zi emas: bundan yuzni qayta tiklab bo'lmaydi.
  List<Float32List> faceTemplates;

  /// Ro'yxatga olishdagi yuz kesimi (o'qituvchi ro'yxatida tanish uchun).
  Uint8List? facePhoto;

  bool get faceEnrolled => faceTemplates.isNotEmpty;

  Student({
    required this.id,
    required this.institutionId,
    required this.name,
    required this.classId,
    required this.parentIds,
    this.parentConsent = false,
    List<Float32List>? faceTemplates,
    this.facePhoto,
  }) : faceTemplates = faceTemplates ?? [];
}

class Lesson {
  final String id;
  final String classId;
  final String subject;
  final String teacherId;
  final int weekday; // 1 = Dushanba ... 6 = Shanba
  final String start; // "08:30"
  final String end;
  final String room;

  const Lesson({
    required this.id,
    required this.classId,
    required this.subject,
    required this.teacherId,
    required this.weekday,
    required this.start,
    required this.end,
    required this.room,
  });
}

class Grade {
  final String id;
  final String studentId;
  final String subject;
  final int value; // 2..5
  final DateTime date;
  final String teacherId;
  final String? comment;

  const Grade({
    required this.id,
    required this.studentId,
    required this.subject,
    required this.value,
    required this.date,
    required this.teacherId,
    this.comment,
  });
}

enum AttendanceStatus { present, late, absent, excused }

extension AttendanceStatusX on AttendanceStatus {
  String get label => switch (this) {
        AttendanceStatus.present => 'Keldi',
        AttendanceStatus.late => 'Kechikdi',
        AttendanceStatus.absent => 'Kelmadi',
        AttendanceStatus.excused => 'Sababli',
      };
}

enum AttendanceSource { manual, face }

class AttendanceRecord {
  final String id;
  final String studentId;
  final DateTime date; // kun (vaqtsiz)
  AttendanceStatus status;
  AttendanceSource source;
  DateTime markedAt;
  String markedBy;

  /// Jonli kuzatuvda olingan FAQAT shu o'quvchining yuz kesimi (JPEG).
  Uint8List? snapshot;

  /// Yuz tanish ishonchi (0..1), o'qituvchi qo'lda tanlagan bo'lsa null.
  double? matchScore;

  AttendanceRecord({
    required this.id,
    required this.studentId,
    required this.date,
    required this.status,
    required this.source,
    required this.markedAt,
    required this.markedBy,
    this.snapshot,
    this.matchScore,
  });
}

class Homework {
  final String id;
  final String classId;
  final String subject;
  final String teacherId;
  final String title;
  final String description;
  final DateTime dueDate;
  final DateTime createdAt;

  const Homework({
    required this.id,
    required this.classId,
    required this.subject,
    required this.teacherId,
    required this.title,
    required this.description,
    required this.dueDate,
    required this.createdAt,
  });
}

class PaymentEntry {
  final String id;
  final int amount;
  final DateTime date;
  final String method; // Naqd, Karta, Click, Payme
  final String recordedBy;

  const PaymentEntry({
    required this.id,
    required this.amount,
    required this.date,
    required this.method,
    required this.recordedBy,
  });
}

class Invoice {
  final String id;
  final String studentId;
  final DateTime month; // oyning 1-kuni
  final int amount;
  final DateTime dueDate;
  final List<PaymentEntry> payments;

  Invoice({
    required this.id,
    required this.studentId,
    required this.month,
    required this.amount,
    required this.dueDate,
    List<PaymentEntry>? payments,
  }) : payments = payments ?? [];

  int get paid => payments.fold(0, (s, p) => s + p.amount);
  int get remaining {
    final r = amount - paid;
    return r < 0 ? 0 : r;
  }
  bool get isPaid => remaining == 0;
  bool isOverdue(DateTime now) => !isPaid && now.isAfter(dueDate);
}

enum NotificationType { attendance, grade, homework, payment, announcement }

class AppNotification {
  final String id;
  final String userId;
  final String title;
  final String body;
  final DateTime time;
  final NotificationType type;
  final Uint8List? image;
  bool read;

  AppNotification({
    required this.id,
    required this.userId,
    required this.title,
    required this.body,
    required this.time,
    required this.type,
    this.image,
    this.read = false,
  });
}
