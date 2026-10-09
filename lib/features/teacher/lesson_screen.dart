import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../core/theme.dart';
import '../../data/models.dart';
import '../../state/app_state.dart';
import '../../widgets/common.dart';
import '../student/student_views.dart';
import '../../widgets/snapshot.dart';
import 'face_attendance_screen.dart';
import 'roll_call_screen.dart';

/// Dars ekrani: davomat, baho qo'yish va uy vazifasi.
class LessonScreen extends StatelessWidget {
  const LessonScreen({super.key, required this.lesson});

  final Lesson lesson;

  @override
  Widget build(BuildContext context) {
    final repo = AppScope.of(context).repo;
    final cls = repo.schoolClass(lesson.classId);
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: Text('${cls.name} · ${lesson.subject}'),
          bottom: const TabBar(tabs: [
            Tab(text: 'Davomat'),
            Tab(text: 'Baholar'),
            Tab(text: 'Vazifa'),
          ]),
        ),
        body: TabBarView(children: [
          _AttendanceTab(lesson: lesson),
          _GradesTab(lesson: lesson),
          _HomeworkTab(lesson: lesson),
        ]),
      ),
    );
  }
}

class _AttendanceTab extends StatelessWidget {
  const _AttendanceTab({required this.lesson});

  final Lesson lesson;

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final repo = app.repo;
    final students = repo.studentsOfClass(lesson.classId);
    final today = repo.today;
    final marked = students.where((s) => repo.attendanceOf(s.id, today) != null).length;
    final present = students.where((s) {
      final a = repo.attendanceOf(s.id, today);
      return a != null && (a.status == AttendanceStatus.present || a.status == AttendanceStatus.late);
    }).length;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            Expanded(
              child: FilledButton.icon(
                onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(
                  builder: (_) => FaceAttendanceScreen(lesson: lesson),
                )),
                icon: const Icon(Icons.center_focus_strong),
                label: const Text('Kamera'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: FilledButton.tonalIcon(
                style: FilledButton.styleFrom(minimumSize: const Size(64, 52)),
                onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(
                  builder: (_) => RollCallScreen(lesson: lesson),
                )),
                icon: const Icon(Icons.record_voice_over_outlined),
                label: const Text("Yo'qlama"),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Text(
          'Belgilangan: $marked/${students.length} · Kelgan: $present',
          style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
        ),
        const SizedBox(height: 8),
        for (final s in students) ...[
          _AttendanceRow(student: s),
          const SizedBox(height: 8),
        ],
      ],
    );
  }
}

class _AttendanceRow extends StatelessWidget {
  const _AttendanceRow({required this.student});

  final Student student;

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final repo = app.repo;
    final rec = repo.attendanceOf(student.id, repo.today);
    const options = [
      AttendanceStatus.present,
      AttendanceStatus.late,
      AttendanceStatus.absent,
      AttendanceStatus.excused,
    ];
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (rec?.snapshot != null)
                  SnapshotThumb(bytes: rec!.snapshot!, size: 32, circle: true, title: student.name)
                else
                  Avatar(student.name, radius: 16),
                const SizedBox(width: 10),
                Expanded(child: Text(student.name, style: const TextStyle(fontWeight: FontWeight.w600))),
                if (rec?.source == AttendanceSource.face)
                  const Tooltip(
                    message: 'Yuz tanish orqali',
                    child: Icon(Icons.face_retouching_natural, size: 18, color: AppColors.primary),
                  ),
                if (rec != null) ...[
                  const SizedBox(width: 6),
                  Text(Fmt.time(rec.markedAt),
                      style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant)),
                ],
              ],
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final o in options)
                  ChoiceChip(
                    visualDensity: VisualDensity.compact,
                    label: Text(o.label),
                    selected: rec?.status == o,
                    selectedColor: attendanceColor(o).withValues(alpha: 0.2),
                    onSelected: (_) => repo.markAttendance(
                      studentId: student.id,
                      status: o,
                      source: AttendanceSource.manual,
                      markedBy: app.currentUser!.id,
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _GradesTab extends StatelessWidget {
  const _GradesTab({required this.lesson});

  final Lesson lesson;

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final repo = app.repo;
    final students = repo.studentsOfClass(lesson.classId);
    final todayGrades = repo.gradesOfClassSubjectOn(lesson.classId, lesson.subject, repo.today);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text("Bahoni bosing, ota-onaga darhol xabar ketadi. Bugungi bahoni o'chirish uchun uni bosib turing.",
            style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
        const SizedBox(height: 12),
        for (final s in students)
          Builder(builder: (context) {
            final mine = todayGrades.where((g) => g.studentId == s.id).toList();
            final att = repo.attendanceOf(s.id, repo.today);
            final isAbsent = att != null &&
                (att.status == AttendanceStatus.absent || att.status == AttendanceStatus.excused);
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(s.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                          ),
                          for (final g in mine)
                            Padding(
                              padding: const EdgeInsets.only(left: 4),
                              child: GestureDetector(
                                onLongPress: () {
                                  repo.removeGrade(g.id);
                                  showSnack(context, "Baho o'chirildi");
                                },
                                child: GradeBadge(g.value, size: 30),
                              ),
                            ),
                        ],
                      ),
                      if (isAbsent)
                        Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Text('Bugun darsda yo\'q (${att!.status.label.toLowerCase()})',
                              style: const TextStyle(color: AppColors.muted, fontSize: 13)),
                        )
                      else ...[
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            for (final v in const [5, 4, 3, 2])
                              Expanded(
                                child: Padding(
                                  padding: const EdgeInsets.only(right: 6),
                                  child: OutlinedButton(
                                    style: OutlinedButton.styleFrom(
                                      foregroundColor: AppColors.grade(v),
                                      side: BorderSide(color: AppColors.grade(v).withValues(alpha: 0.5)),
                                      padding: EdgeInsets.zero,
                                    ),
                                    onPressed: () => repo.addGrade(
                                      studentId: s.id,
                                      subject: lesson.subject,
                                      value: v,
                                      teacherId: app.currentUser!.id,
                                    ),
                                    child: Text('$v', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            );
          }),
      ],
    );
  }
}

class _HomeworkTab extends StatelessWidget {
  const _HomeworkTab({required this.lesson});

  final Lesson lesson;

  @override
  Widget build(BuildContext context) {
    final repo = AppScope.of(context).repo;
    final list = repo.homeworkOfClass(lesson.classId).where((h) => h.subject == lesson.subject).toList();
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _addHomework(context),
        icon: const Icon(Icons.add),
        label: const Text('Vazifa berish'),
      ),
      body: list.isEmpty
          ? const EmptyState(icon: Icons.menu_book_outlined, text: "Bu fandan hali vazifa berilmagan")
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
              children: [
                for (final h in list) ...[
                  HomeworkCard(homework: h),
                  const SizedBox(height: 8),
                ],
              ],
            ),
    );
  }

  Future<void> _addHomework(BuildContext context) async {
    final app = AppScope.read(context);
    final title = TextEditingController();
    final desc = TextEditingController();
    var due = app.repo.today.add(const Duration(days: 1));
    String? error;
    var saved = false;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSt) => Padding(
          padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Yangi vazifa · ${lesson.subject}', style: Theme.of(ctx).textTheme.titleLarge),
              const SizedBox(height: 16),
              TextField(
                controller: title,
                textCapitalization: TextCapitalization.sentences,
                decoration: InputDecoration(labelText: 'Mavzu', errorText: error),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: desc,
                minLines: 2,
                maxLines: 4,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(labelText: 'Tavsif'),
              ),
              const SizedBox(height: 12),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.event),
                title: Text('Muddat: ${Fmt.weekday(due)}, ${Fmt.date(due)}'),
                trailing: const Text("O'zgartirish"),
                onTap: () async {
                  final picked = await showDatePicker(
                    context: ctx,
                    initialDate: due,
                    firstDate: app.repo.today,
                    lastDate: app.repo.today.add(const Duration(days: 60)),
                  );
                  if (picked != null) setSt(() => due = picked);
                },
              ),
              const SizedBox(height: 8),
              FilledButton(
                onPressed: () {
                  if (title.text.trim().isEmpty) {
                    setSt(() => error = 'Mavzuni kiriting');
                    return;
                  }
                  app.repo.addHomework(
                    classId: lesson.classId,
                    subject: lesson.subject,
                    teacherId: app.currentUser!.id,
                    title: title.text.trim(),
                    description: desc.text.trim(),
                    dueDate: due,
                  );
                  saved = true;
                  Navigator.of(ctx).pop();
                },
                child: const Text('Yuborish'),
              ),
            ],
          ),
        ),
      ),
    );
    if (saved && context.mounted) showSnack(context, "Vazifa yuborildi, ota-onalarga xabar ketdi");
  }
}
