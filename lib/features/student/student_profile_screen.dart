import 'package:flutter/material.dart';

import '../../core/theme.dart';
import '../../data/models.dart';
import '../../state/app_state.dart';
import '../../widgets/common.dart';
import 'student_views.dart';

/// O'quvchi profili (direktor va o'qituvchi uchun).
class StudentProfileScreen extends StatelessWidget {
  const StudentProfileScreen({super.key, required this.studentId, this.showPayments = false});

  final String studentId;
  final bool showPayments;

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final repo = app.repo;
    final s = repo.student(studentId);
    final parents = repo.parentsOfStudent(studentId);
    final tabs = <(String, Widget)>[
      ('Umumiy', StudentOverview(studentId: studentId)),
      ('Baholar', StudentGradesView(studentId: studentId)),
      (
        'Davomat',
        ListView(padding: const EdgeInsets.all(16), children: [StudentAttendanceView(studentId: studentId)]),
      ),
      if (showPayments) ("To'lov", StudentPaymentsView(studentId: studentId, canRecord: true)),
      ('Ota-ona', _ParentsTab(student: s, parents: parents)),
    ];
    return DefaultTabController(
      length: tabs.length,
      child: Scaffold(
        appBar: AppBar(
          title: Text(s.name),
          bottom: TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            tabs: [for (final t in tabs) Tab(text: t.$1)],
          ),
        ),
        body: TabBarView(children: [for (final t in tabs) t.$2]),
      ),
    );
  }
}

class _ParentsTab extends StatelessWidget {
  const _ParentsTab({required this.student, required this.parents});

  final Student student;
  final List<AppUser> parents;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Column(
            children: [
              for (final p in parents)
                ListTile(
                  leading: Avatar(p.name),
                  title: Text(p.name),
                  subtitle: Text(p.phone.length == 12 ? '+${p.phone}' : p.phone),
                ),
            ],
          ),
        ),
        const SectionTitle('Yuz tanish'),
        Card(
          child: ListTile(
            leading: Icon(
              student.faceEnrolled ? Icons.verified_user : Icons.no_accounts_outlined,
              color: student.faceEnrolled ? AppColors.success : AppColors.muted,
            ),
            title: Text(student.faceEnrolled ? "Ro'yxatdan o'tgan" : "Ro'yxatdan o'tmagan"),
            subtitle: Text(student.parentConsent
                ? 'Ota-ona roziligi berilgan'
                : "Ota-ona roziligi yo'q: davomat qo'lda olinadi"),
          ),
        ),
      ],
    );
  }
}
