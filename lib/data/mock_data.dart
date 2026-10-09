import 'dart:math';

import '../core/format.dart';
import 'models.dart';
import 'repository.dart';

/// Demo kirish raqamlari (hammasi uchun SMS kod: 1111).
class DemoAccounts {
  static const superAdmin = '998900000000';
  static const director = '998901111111';
  static const teacher = '998903333333';
  static const parent = '998905555555';
  static const centerDirector = '998902222222';

  static const all = <(String, String)>[
    (parent, 'Ota-ona (2 farzand)'),
    (teacher, "O'qituvchi (matematika)"),
    (director, 'Direktor (maktab)'),
    (centerDirector, "Direktor (o'quv markazi)"),
    (superAdmin, 'Super admin'),
  ];
}

void seedMockData(AppRepository repo) {
  final rnd = Random(7);
  final now = repo.now;
  final today = Fmt.dayOnly(now);

  // ------------------------------------------------------------ Muassasalar
  final school = Institution(
    id: 'inst_school',
    name: 'Kelajak xususiy maktabi',
    type: InstitutionType.school,
    city: 'Toshkent, Yunusobod',
    createdAt: DateTime(2026, 8, 1),
  );
  final center = Institution(
    id: 'inst_center',
    name: "Bilim o'quv markazi",
    type: InstitutionType.center,
    city: 'Toshkent, Chilonzor',
    createdAt: DateTime(2026, 8, 15),
  );
  final inactive = Institution(
    id: 'inst_demo3',
    name: 'Zukko akademiyasi',
    type: InstitutionType.center,
    city: 'Samarqand',
    active: false,
    createdAt: DateTime(2026, 9, 5),
  );
  repo.institutions.addAll([school, center, inactive]);

  // ------------------------------------------------------------ Foydalanuvchilar
  repo.users.addAll([
    const AppUser(id: 'u_super', name: 'Alisher (super admin)', phone: DemoAccounts.superAdmin, role: UserRole.superAdmin),
    const AppUser(id: 'u_dir', name: 'Nodira Yusupova', phone: DemoAccounts.director, role: UserRole.director, institutionId: 'inst_school'),
    const AppUser(id: 'u_dir2', name: 'Bekzod Aliyev', phone: DemoAccounts.centerDirector, role: UserRole.director, institutionId: 'inst_center'),
  ]);

  const schoolTeachers = <(String, String, String, String)>[
    ('t_math', 'Dilnoza Karimova', DemoAccounts.teacher, 'Matematika'),
    ('t_uzb', 'Gulnora Rahimova', '998906666661', 'Ona tili'),
    ('t_eng', 'Jasur Toshmatov', '998906666662', 'Ingliz tili'),
    ('t_phys', 'Rustam Nazarov', '998906666663', 'Fizika'),
    ('t_hist', 'Malika Ergasheva', '998906666664', 'Tarix'),
    ('t_it', 'Sardor Qodirov', '998906666665', 'Informatika'),
  ];
  for (final t in schoolTeachers) {
    repo.users.add(AppUser(
      id: t.$1, name: t.$2, phone: t.$3, role: UserRole.teacher,
      institutionId: 'inst_school', subject: t.$4,
    ));
  }
  repo.users.add(const AppUser(
    id: 't_ielts', name: 'Kamola Saidova', phone: '998907777771',
    role: UserRole.teacher, institutionId: 'inst_center', subject: 'IELTS',
  ));
  repo.users.add(const AppUser(
    id: 't_sat', name: 'Otabek Mirzayev', phone: '998907777772',
    role: UserRole.teacher, institutionId: 'inst_center', subject: 'SAT Math',
  ));

  // ------------------------------------------------------------ O'quvchilar
  const namesA = [
    'Aziz Karimov', 'Madina Tursunova', 'Sherzod Olimov', 'Zarina Abdullayeva',
    'Javohir Rashidov', 'Sevara Qosimova', 'Bobur Hakimov', 'Nilufar Saidova',
  ];
  const namesB = [
    'Kamila Karimova', 'Doniyor Ismoilov', 'Laylo Yoqubova', 'Temur Salimov',
    'Mohira Jo\'rayeva', 'Ulugbek Nurmatov', 'Shahzoda Fayzullayeva', 'Otabek Usmonov',
  ];
  const namesC = [
    'Diyora Xolmatova', 'Islom Sobirov', 'Farangiz Mahmudova',
    'Sanjar Ibragimov', 'Ruxshona Alimova', 'Akmal Yusupov',
  ];

  // Demo ota-ona: Aziz (5-A) va Kamila (7-B) ning onasi.
  repo.users.add(const AppUser(
    id: 'u_parent', name: 'Feruza Karimova', phone: DemoAccounts.parent,
    role: UserRole.parent, institutionId: 'inst_school',
    childIds: ['s_a0', 's_b0'],
  ));

  SchoolClass makeClass(String id, String inst, String name, String homeroom, String prefix, List<String> names) {
    final ids = <String>[];
    for (var i = 0; i < names.length; i++) {
      final sid = '$prefix$i';
      ids.add(sid);
      final parentIds = <String>[];
      if (sid == 's_a0' || sid == 's_b0') {
        parentIds.add('u_parent');
      } else {
        final pid = 'p_$sid';
        parentIds.add(pid);
        repo.users.add(AppUser(
          id: pid,
          name: '${names[i].split(' ').last} (ota-ona)',
          phone: '99899${(1000000 + repo.users.length * 7919).toString().substring(0, 7)}',
          role: UserRole.parent,
          institutionId: inst,
          childIds: [sid],
        ));
      }
      // Demo ota-onaning farzandlari doim rozilik bergan bo'lsin.
      final consent = sid == 's_a0' || sid == 's_b0' || rnd.nextDouble() < 0.85;
      repo.students.add(Student(
        id: sid,
        institutionId: inst,
        name: names[i],
        classId: id,
        parentIds: parentIds,
        parentConsent: consent,
        // Yuz namunalari bo'sh: ularni o'qituvchi haqiqiy kamera bilan oladi.
      ));
    }
    return SchoolClass(id: id, institutionId: inst, name: name, homeroomTeacherId: homeroom, studentIds: ids);
  }

  final c5a = makeClass('c_5a', 'inst_school', '5-A', 't_uzb', 's_a', namesA);
  final c7b = makeClass('c_7b', 'inst_school', '7-B', 't_math', 's_b', namesB);
  final cIelts = makeClass('c_ielts', 'inst_center', 'IELTS B2 (kechki)', 't_ielts', 's_c', namesC);
  repo.classes.addAll([c5a, c7b, cIelts]);

  // ------------------------------------------------------------ Dars jadvali
  const slots = [('08:30', '09:15'), ('09:25', '10:10'), ('10:20', '11:05'), ('11:20', '12:05'), ('12:15', '13:00')];
  const teacherBySubject = {
    'Matematika': 't_math', 'Ona tili': 't_uzb', 'Ingliz tili': 't_eng',
    'Fizika': 't_phys', 'Tarix': 't_hist', 'Informatika': 't_it',
  };
  const plan5a = {
    1: ['Matematika', 'Ona tili', 'Ingliz tili', 'Tarix'],
    2: ['Ona tili', 'Matematika', 'Informatika', 'Ingliz tili'],
    3: ['Matematika', 'Tarix', 'Ona tili', 'Ingliz tili'],
    4: ['Ingliz tili', 'Matematika', 'Ona tili', 'Informatika'],
    5: ['Matematika', 'Ona tili', 'Tarix', 'Ingliz tili'],
    6: ['Informatika', 'Matematika', 'Ona tili'],
  };
  const plan7b = {
    1: ['Fizika', 'Matematika', 'Ingliz tili', 'Ona tili', 'Tarix'],
    2: ['Matematika', 'Fizika', 'Ona tili', 'Informatika'],
    3: ['Ingliz tili', 'Matematika', 'Fizika', 'Tarix', 'Ona tili'],
    4: ['Matematika', 'Ona tili', 'Informatika', 'Fizika'],
    5: ['Fizika', 'Ingliz tili', 'Matematika', 'Tarix'],
    6: ['Matematika', 'Informatika', 'Ingliz tili'],
  };
  void addPlan(String classId, Map<int, List<String>> plan, String roomPrefix) {
    plan.forEach((day, subjects) {
      for (var i = 0; i < subjects.length; i++) {
        repo.lessons.add(Lesson(
          id: repo.newId('l'),
          classId: classId,
          subject: subjects[i],
          teacherId: teacherBySubject[subjects[i]]!,
          weekday: day,
          start: slots[i].$1,
          end: slots[i].$2,
          room: '$roomPrefix${(i % 3) + 1}',
        ));
      }
    });
  }

  addPlan('c_5a', plan5a, '20');
  addPlan('c_7b', plan7b, '30');
  for (final day in [1, 3, 5]) {
    repo.lessons.add(Lesson(
      id: repo.newId('l'), classId: 'c_ielts', subject: 'IELTS', teacherId: 't_ielts',
      weekday: day, start: '17:00', end: '18:30', room: 'B-4',
    ));
  }
  for (final day in [2, 4]) {
    repo.lessons.add(Lesson(
      id: repo.newId('l'), classId: 'c_ielts', subject: 'SAT Math', teacherId: 't_sat',
      weekday: day, start: '17:00', end: '18:30', room: 'B-2',
    ));
  }

  // ------------------------------------------------------------ Baho va davomat (o'tgan 3 hafta)
  const comments = ['Faol qatnashdi', 'Uy vazifasi to\'liq emas', "Yaxshi javob berdi", null, null, null];
  for (var back = 21; back >= 1; back--) {
    final day = today.subtract(Duration(days: back));
    if (day.weekday == DateTime.sunday) continue;
    for (final c in repo.classes) {
      final dayLessons = repo.lessonsOfClassOn(c.id, day.weekday);
      if (dayLessons.isEmpty) continue;
      for (final sid in c.studentIds) {
        final r = rnd.nextDouble();
        final status = r < 0.86
            ? AttendanceStatus.present
            : r < 0.93
                ? AttendanceStatus.late
                : r < 0.97
                    ? AttendanceStatus.absent
                    : AttendanceStatus.excused;
        final s = repo.student(sid);
        final start = dayLessons.first.start.split(':');
        final markedAt = day.add(Duration(
          hours: int.parse(start[0]),
          minutes: int.parse(start[1]) - 15 + rnd.nextInt(status == AttendanceStatus.late ? 40 : 14),
        ));
        repo.attendance.add(AttendanceRecord(
          id: repo.newId('a'),
          studentId: sid,
          date: day,
          status: status,
          source: s.parentConsent && status != AttendanceStatus.absent && status != AttendanceStatus.excused
              ? AttendanceSource.face
              : AttendanceSource.manual,
          markedAt: markedAt,
          markedBy: c.homeroomTeacherId,
        ));
        if (status == AttendanceStatus.absent || status == AttendanceStatus.excused) continue;
        for (final l in dayLessons) {
          if (rnd.nextDouble() > 0.28) continue;
          final base = sid.endsWith('0') ? 4.4 : 3.9;
          final v = (base + (rnd.nextDouble() * 2 - 1.1)).round().clamp(2, 5).toInt();
          repo.grades.add(Grade(
            id: repo.newId('g'),
            studentId: sid,
            subject: l.subject,
            value: v,
            date: day.add(Duration(hours: 9 + rnd.nextInt(4))),
            teacherId: l.teacherId,
            comment: comments[rnd.nextInt(comments.length)],
          ));
        }
      }
    }
  }

  // Bugun: 5-A yuz tanish orqali belgilangan, 7-B hali belgilanmagan
  // (o'qituvchi demo uchun davomatni o'zi oladi).
  if (today.weekday != DateTime.sunday) {
    for (final sid in c5a.studentIds) {
      final s = repo.student(sid);
      repo.attendance.add(AttendanceRecord(
        id: repo.newId('a'),
        studentId: sid,
        date: today,
        status: sid == 's_a5' ? AttendanceStatus.absent : AttendanceStatus.present,
        source: s.parentConsent && sid != 's_a5' ? AttendanceSource.face : AttendanceSource.manual,
        markedAt: today.add(Duration(hours: 8, minutes: 10 + rnd.nextInt(15))),
        markedBy: 't_uzb',
      ));
    }
  }

  // ------------------------------------------------------------ Uy vazifalari
  void hw(String classId, String subject, String title, String desc, int dueIn, int createdAgo) {
    repo.homeworks.add(Homework(
      id: repo.newId('h'),
      classId: classId,
      subject: subject,
      teacherId: teacherBySubject[subject] ?? 't_ielts',
      title: title,
      description: desc,
      dueDate: today.add(Duration(days: dueIn)),
      createdAt: today.subtract(Duration(days: createdAgo)),
    ));
  }

  hw('c_5a', 'Matematika', 'Kasrlarni qo\'shish', "Darslik 45-bet, 1-10 misollar.", 1, 1);
  hw('c_5a', 'Ona tili', 'Insho: "Mening oilam"', "Kamida 1 bet, chiroyli yozuvda.", 3, 2);
  hw('c_5a', 'Ingliz tili', 'Unit 3 so\'zlari', "20 ta yangi so'zni yodlash, har biriga gap tuzish.", 2, 1);
  hw('c_5a', 'Tarix', 'Amir Temur davri', "12-mavzuni o'qib, 5 ta savolga javob yozish.", -2, 6);
  hw('c_7b', 'Matematika', 'Chiziqli tenglamalar', "Darslik 78-bet, 4-15 misollar.", 1, 0);
  hw('c_7b', 'Fizika', 'Tezlik va tezlanish', "Laboratoriya ishi hisobotini tayyorlash.", 4, 2);
  hw('c_7b', 'Informatika', 'Scratch loyihasi', "Oddiy o'yin yaratib, faylini yuborish.", 6, 3);
  hw('c_ielts', 'IELTS', 'Writing Task 2', 'Opinion essay, 250+ words: "Technology in education".', 2, 1);

  // ------------------------------------------------------------ To'lovlar
  for (final s in repo.students) {
    final fee = s.institutionId == 'inst_school' ? 3500000 : 900000;
    for (var m = 2; m >= 0; m--) {
      final month = DateTime(now.year, now.month - m, 1);
      final inv = Invoice(
        id: repo.newId('inv'),
        studentId: s.id,
        month: month,
        amount: fee,
        dueDate: DateTime(month.year, month.month, 10),
      );
      final r = rnd.nextDouble();
      if (m == 2 || (m == 1 && r < 0.9) || (m == 0 && r < 0.45)) {
        inv.payments.add(PaymentEntry(
          id: repo.newId('p'), amount: fee,
          date: DateTime(month.year, month.month, 3 + rnd.nextInt(6)),
          method: const ['Naqd', 'Karta', 'Click', 'Payme'][rnd.nextInt(4)],
          recordedBy: 'u_dir',
        ));
      } else if (m == 0 && r < 0.7) {
        inv.payments.add(PaymentEntry(
          id: repo.newId('p'), amount: fee ~/ 2,
          date: DateTime(month.year, month.month, 5),
          method: 'Naqd', recordedBy: 'u_dir',
        ));
      }
      repo.invoices.add(inv);
    }
  }
  // Demo ota-ona: Kamilaning joriy oyi to'lanmagan bo'lsin (qarzdorlik ko'rinadi).
  for (final inv in repo.invoicesOfStudent('s_b0')) {
    if (inv.month.month == now.month) inv.payments.clear();
  }

  // ------------------------------------------------------------ Bildirishnomalar
  void note(String title, String body, NotificationType type, Duration ago, {bool read = false}) {
    repo.notifications.add(AppNotification(
      id: repo.newId('n'), userId: 'u_parent', title: title, body: body,
      time: now.subtract(ago), type: type, read: read,
    ));
  }

  note('Aziz Karimov', 'Darsga keldi, 08:14 (yuz tanish orqali)', NotificationType.attendance, Duration(hours: 1));
  note('Kamila Karimova: yangi baho', 'Matematika fanidan 5 baho oldi — Faol qatnashdi', NotificationType.grade, Duration(hours: 20));
  note("To'lov eslatmasi", "Kamila Karimova, ${Fmt.month(now)}: to'lov muddati 10-sanada edi.", NotificationType.payment, Duration(days: 2));
  note('Ota-onalar majlisi', "Shanba kuni soat 10:00 da maktab majlislar zalida ota-onalar yig'ilishi bo'ladi.", NotificationType.announcement, Duration(days: 3), read: true);
}
