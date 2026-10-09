import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../core/theme.dart';
import '../../data/models.dart';
import '../../state/app_state.dart';
import '../../widgets/common.dart';
import '../student/student_profile_screen.dart';
import '../../widgets/snapshot.dart';
import 'face_enroll_screen.dart';
import 'lesson_screen.dart';

class TeacherShell extends StatefulWidget {
  const TeacherShell({super.key});

  @override
  State<TeacherShell> createState() => _TeacherShellState();
}

class _TeacherShellState extends State<TeacherShell> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final unread = app.repo.unreadCount(app.currentUser!.id);
    return Scaffold(
      body: switch (_tab) {
        0 => const _TodayTab(),
        1 => const _ClassesTab(),
        _ => const NotificationsView(),
      },
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: [
          const NavigationDestination(icon: Icon(Icons.today_outlined), selectedIcon: Icon(Icons.today), label: 'Bugun'),
          const NavigationDestination(icon: Icon(Icons.groups_outlined), selectedIcon: Icon(Icons.groups), label: 'Sinflar'),
          NavigationDestination(
              icon: badgeIcon(Icons.notifications_outlined, unread),
              selectedIcon: badgeIcon(Icons.notifications, unread),
              label: 'Xabarlar'),
        ],
      ),
    );
  }
}

class _TodayTab extends StatelessWidget {
  const _TodayTab();

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final repo = app.repo;
    final user = app.currentUser!;
    final today = repo.today;
    final lessons = repo.lessonsOfTeacherOn(user.id, today.weekday);
    final nowHm = Fmt.time(repo.now);

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Salom, ${user.name.split(' ').first}'),
            Text('${Fmt.weekday(today)}, ${Fmt.date(today)} · ${user.subject ?? ''}',
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w400,
                    color: Theme.of(context).colorScheme.onSurfaceVariant)),
          ],
        ),
        actions: const [AccountButton()],
      ),
      body: lessons.isEmpty
          ? const EmptyState(icon: Icons.weekend_outlined, text: "Bugun sizda dars yo'q")
          : ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: lessons.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, i) {
                final l = lessons[i];
                final cls = repo.schoolClass(l.classId);
                final students = repo.studentsOfClass(l.classId);
                final marked = students.where((s) => repo.attendanceOf(s.id, today) != null).length;
                final isNow = l.start.compareTo(nowHm) <= 0 && l.end.compareTo(nowHm) > 0;
                final isPast = l.end.compareTo(nowHm) <= 0;
                return Card(
                  clipBehavior: Clip.antiAlias,
                  shape: isNow
                      ? RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                          side: BorderSide(color: Theme.of(context).colorScheme.primary, width: 2),
                        )
                      : null,
                  child: InkWell(
                    onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(
                      builder: (_) => LessonScreen(lesson: l),
                    )),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        children: [
                          Column(
                            children: [
                              Text(l.start, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                              Text(l.end, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
                            ],
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Text(cls.name,
                                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                                    const SizedBox(width: 8),
                                    if (isNow) const StatusPill('Hozir', color: AppColors.primary),
                                    if (isPast && !isNow)
                                      const StatusPill('Tugadi', color: AppColors.muted),
                                  ],
                                ),
                                const SizedBox(height: 2),
                                Text('${l.subject} · ${l.room}-xona'),
                                const SizedBox(height: 6),
                                Text(
                                  'Davomat: $marked/${students.length}',
                                  style: TextStyle(
                                    color: marked == students.length ? AppColors.success : AppColors.warning,
                                    fontWeight: FontWeight.w600,
                                    fontSize: 13,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const Icon(Icons.chevron_right),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
    );
  }
}

class _ClassesTab extends StatelessWidget {
  const _ClassesTab();

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final classes = app.repo.classesOfTeacher(app.currentUser!.id);
    return Scaffold(
      appBar: AppBar(title: const Text('Sinflarim'), actions: const [AccountButton()]),
      body: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: classes.length,
        separatorBuilder: (_, __) => const SizedBox(height: 8),
        itemBuilder: (context, i) {
          final c = classes[i];
          final isHomeroom = c.homeroomTeacherId == app.currentUser!.id;
          return Card(
            child: ListTile(
              leading: CircleAvatar(child: Text(c.name.split(' ').first)),
              title: Text(c.name, style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text("${c.studentIds.length} o'quvchi${isHomeroom ? ' · sinf rahbari' : ''}"),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(
                builder: (_) => ClassStudentsScreen(classId: c.id),
              )),
            ),
          );
        },
      ),
    );
  }
}

/// Sinf o'quvchilari ro'yxati + yuz namunasini ro'yxatga olish (demo).
class ClassStudentsScreen extends StatelessWidget {
  const ClassStudentsScreen({super.key, required this.classId, this.showPayments = false});

  final String classId;
  final bool showPayments;

  @override
  Widget build(BuildContext context) {
    final repo = AppScope.of(context).repo;
    final cls = repo.schoolClass(classId);
    final students = repo.studentsOfClass(classId);
    final enrolled = students.where((s) => s.faceEnrolled).length;
    return Scaffold(
      appBar: AppBar(title: Text(cls.name)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: ListTile(
              leading: const Icon(Icons.face_retouching_natural, color: AppColors.primary),
              title: Text("Yuz namunasi: $enrolled/${students.length}"),
              subtitle: const Text("Ota-ona roziligi bo'lgan o'quvchini bosib, yuzini ro'yxatga oling"),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Column(
              children: [
                for (final s in students)
                  ListTile(
                    leading: s.facePhoto != null
                        ? SnapshotThumb(bytes: s.facePhoto!, size: 40, circle: true, title: s.name)
                        : Avatar(s.name),
                    title: Text(s.name),
                    subtitle: Text(s.faceEnrolled
                        ? "Yuz ro'yxatda (${s.faceTemplates.length} namuna)"
                        : s.parentConsent
                            ? "Yuz ro'yxatga olinmagan"
                            : "Ota-ona roziligi yo'q"),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (s.parentConsent)
                          IconButton(
                            tooltip: s.faceEnrolled ? 'Qayta ro\'yxatga olish' : "Yuzni ro'yxatga olish",
                            icon: Icon(s.faceEnrolled ? Icons.refresh : Icons.add_a_photo_outlined),
                            onPressed: () => _enroll(context, s),
                          ),
                        Icon(
                          s.faceEnrolled ? Icons.verified_user : Icons.no_accounts_outlined,
                          color: s.faceEnrolled ? AppColors.success : AppColors.muted,
                        ),
                      ],
                    ),
                    onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(
                      builder: (_) => StudentProfileScreen(studentId: s.id, showPayments: showPayments),
                    )),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _enroll(BuildContext context, Student s) async {
    await Navigator.of(context).push<bool>(MaterialPageRoute(
      builder: (_) => FaceEnrollScreen(studentId: s.id),
    ));
  }
}
