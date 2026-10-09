import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../core/theme.dart';
import '../../data/models.dart';
import '../../state/app_state.dart';
import '../../widgets/common.dart';
import '../../widgets/snapshot.dart';

// O'quvchi haqidagi ko'rinishlar: ota-ona ilovasida ham, direktor
// panelidagi o'quvchi profilida ham bir xil ishlatiladi.

/// Bosh sahifa: bugungi davomat, oxirgi baholar, yaqin vazifalar, qarzdorlik.
class StudentOverview extends StatelessWidget {
  const StudentOverview({super.key, required this.studentId, this.onOpenTab});

  final String studentId;

  /// Ota-ona ilovasida bo'limga o'tish (1 = baholar, 2 = jadval, 3 = to'lov).
  final void Function(int tab)? onOpenTab;

  @override
  Widget build(BuildContext context) {
    final repo = AppScope.of(context).repo;
    final s = repo.student(studentId);
    final cls = repo.schoolClass(s.classId);
    final todayRec = repo.attendanceOf(studentId, repo.today);
    final recent = repo.gradesOfStudent(studentId);
    final monthGrades = recent.where((g) => g.date.isAfter(repo.today.subtract(const Duration(days: 30))));
    final avg = repo.average(monthGrades);
    final history = repo.attendanceHistory(studentId).take(30).toList();
    final presentCount = history
        .where((a) => a.status == AttendanceStatus.present || a.status == AttendanceStatus.late)
        .length;
    final debt = repo.debtOfStudent(studentId);
    final hw = repo
        .homeworkOfClass(s.classId)
        .where((h) => !h.dueDate.isBefore(repo.today))
        .toList()
      ..sort((a, b) => a.dueDate.compareTo(b.dueDate));
    final todayLessons = repo.lessonsOfClassOn(s.classId, repo.today.weekday);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        _TodayCard(record: todayRec, className: cls.name, lessonsToday: todayLessons.length),
        const SizedBox(height: 12),
        TwoColumn(children: [
          StatCard(
            label: "Oylik o'rtacha baho",
            value: avg == null ? '—' : avg.toStringAsFixed(1),
            icon: Icons.star_rounded,
            color: avg == null ? AppColors.muted : AppColors.grade(avg.round()),
            onTap: onOpenTab == null ? null : () => onOpenTab!(1),
          ),
          StatCard(
            label: 'Davomat (30 kun)',
            value: history.isEmpty ? '—' : '${(presentCount * 100 / history.length).round()}%',
            icon: Icons.how_to_reg_rounded,
            color: AppColors.success,
            onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(
              builder: (_) => Scaffold(
                appBar: AppBar(title: Text('${s.name}: davomat')),
                body: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [StudentAttendanceView(studentId: studentId)],
                ),
              ),
            )),
          ),
          StatCard(
            label: "To'lov holati",
            value: debt == 0 ? "To'langan" : Fmt.money(debt),
            icon: Icons.account_balance_wallet_rounded,
            color: debt == 0 ? AppColors.success : AppColors.danger,
            caption: debt == 0 ? null : 'Qarzdorlik',
            onTap: onOpenTab == null ? null : () => onOpenTab!(3),
          ),
          StatCard(
            label: 'Bugungi darslar',
            value: '${todayLessons.length} ta',
            icon: Icons.calendar_today_rounded,
            onTap: onOpenTab == null ? null : () => onOpenTab!(2),
          ),
        ]),
        SectionTitle('Oxirgi baholar',
            trailing: onOpenTab == null
                ? null
                : TextButton(onPressed: () => onOpenTab!(1), child: const Text('Barchasi'))),
        if (recent.isEmpty)
          const EmptyState(icon: Icons.star_outline, text: "Hali baho qo'yilmagan")
        else
          Card(
            child: Column(
              children: [
                for (final g in recent.take(5)) GradeTile(grade: g),
              ],
            ),
          ),
        const SectionTitle('Uy vazifalari'),
        if (hw.isEmpty)
          const EmptyState(icon: Icons.menu_book_outlined, text: "Yaqin muddatli vazifa yo'q")
        else
          for (final h in hw.take(4)) ...[
            HomeworkCard(homework: h),
            const SizedBox(height: 8),
          ],
        // Rozilikni faqat ota-ona beradi (ota-ona ilovasida onOpenTab bor).
        if (onOpenTab != null) ...[
          const SectionTitle('Yuz tanish orqali davomat'),
          _ConsentCard(student: s),
        ],
      ],
    );
  }
}

class _ConsentCard extends StatelessWidget {
  const _ConsentCard({required this.student});

  final Student student;

  @override
  Widget build(BuildContext context) {
    final repo = AppScope.of(context).repo;
    final s = student;
    return Card(
      child: Column(
        children: [
          SwitchListTile(
            value: s.parentConsent,
            title: const Text('Roziman'),
            subtitle: const Text(
                "Farzandim davomati o'qituvchi telefoni kamerasi orqali yuz tanish yordamida olinishiga "
                "roziman. Video yozilmaydi: davomat paytida faqat farzandimning o'z yuzi kesib olinib "
                "menga yuboriladi. Rozilik bekor qilinsa, yuz namunasi o'chiriladi."),
            isThreeLine: true,
            onChanged: (v) async {
              if (!v) {
                final ok = await showDialog<bool>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    title: const Text('Rozilikni bekor qilish'),
                    content: const Text(
                        "Farzandingizning yuz namunasi o'chiriladi va davomat qo'lda olinadi."),
                    actions: [
                      TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Yo\'q')),
                      FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Bekor qilish')),
                    ],
                  ),
                );
                if (ok != true) return;
              }
              repo.setConsent(s.id, v);
            },
          ),
          if (s.parentConsent)
            ListTile(
              dense: true,
              leading: Icon(
                s.faceEnrolled ? Icons.verified_user : Icons.hourglass_top,
                color: s.faceEnrolled ? AppColors.success : AppColors.warning,
              ),
              title: Text(s.faceEnrolled
                  ? "Yuz namunasi ro'yxatga olingan"
                  : "Yuz namunasini o'qituvchi maktabda ro'yxatga oladi"),
            ),
        ],
      ),
    );
  }
}

class _TodayCard extends StatelessWidget {
  const _TodayCard({required this.record, required this.className, required this.lessonsToday});

  final AttendanceRecord? record;
  final String className;
  final int lessonsToday;

  @override
  Widget build(BuildContext context) {
    final r = record;
    final Color color;
    final IconData icon;
    final String title;
    final String subtitle;
    if (r == null) {
      color = AppColors.muted;
      icon = Icons.schedule_rounded;
      title = lessonsToday == 0 ? 'Bugun dars yo\'q' : 'Davomat hali belgilanmagan';
      subtitle = className;
    } else {
      color = attendanceColor(r.status);
      icon = switch (r.status) {
        AttendanceStatus.present => Icons.check_circle_rounded,
        AttendanceStatus.late => Icons.watch_later_rounded,
        AttendanceStatus.absent => Icons.cancel_rounded,
        AttendanceStatus.excused => Icons.info_rounded,
      };
      title = switch (r.status) {
        AttendanceStatus.present => 'Bugun maktabga keldi',
        AttendanceStatus.late => 'Bugun kechikib keldi',
        AttendanceStatus.absent => 'Bugun darsga kelmadi',
        AttendanceStatus.excused => 'Bugun sababli yo\'q',
      };
      final showTime = r.status == AttendanceStatus.present || r.status == AttendanceStatus.late;
      subtitle = [
        className,
        if (showTime) Fmt.time(r.markedAt),
        if (r.source == AttendanceSource.face) 'yuz tanish orqali',
      ].join(' · ');
    }
    return Card(
      color: color.withValues(alpha: 0.10),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            if (r?.snapshot != null)
              Container(
                padding: const EdgeInsets.all(2),
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                child: SnapshotThumb(
                  bytes: r!.snapshot!,
                  size: 56,
                  circle: true,
                  title: 'Bugun ${Fmt.time(r.markedAt)} da olingan',
                ),
              )
            else
              Icon(icon, color: color, size: 40),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: color)),
                  const SizedBox(height: 2),
                  Text(subtitle),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class GradeTile extends StatelessWidget {
  const GradeTile({super.key, required this.grade, this.trailing});

  final Grade grade;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final repo = AppScope.of(context).repo;
    final teacher = repo.userById(grade.teacherId);
    final details = [
      Fmt.date(grade.date),
      if (teacher != null) teacher.name,
    ].join(' · ');
    return ListTile(
      leading: GradeBadge(grade.value),
      title: Text(grade.subject, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Text(grade.comment == null ? details : '$details\n${grade.comment}'),
      isThreeLine: grade.comment != null,
      trailing: trailing,
    );
  }
}

class HomeworkCard extends StatelessWidget {
  const HomeworkCard({super.key, required this.homework, this.onTap});

  final Homework homework;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final repo = AppScope.of(context).repo;
    final h = homework;
    final days = Fmt.dayOnly(h.dueDate).difference(repo.today).inDays;
    final (String label, Color color) = days < 0
        ? ("Muddati o'tgan", AppColors.muted)
        : days == 0
            ? ('Bugun', AppColors.danger)
            : days == 1
                ? ('Ertaga', AppColors.warning)
                : ('${Fmt.date(h.dueDate)} gacha', AppColors.primary);
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(h.subject,
                        style: TextStyle(
                            color: Theme.of(context).colorScheme.primary,
                            fontWeight: FontWeight.w700,
                            fontSize: 13)),
                  ),
                  StatusPill(label, color: color),
                ],
              ),
              const SizedBox(height: 6),
              Text(h.title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
              const SizedBox(height: 4),
              Text(h.description, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
            ],
          ),
        ),
      ),
    );
  }
}

/// Fanlar bo'yicha baholar: o'rtacha + ro'yxat.
class StudentGradesView extends StatefulWidget {
  const StudentGradesView({super.key, required this.studentId});

  final String studentId;

  @override
  State<StudentGradesView> createState() => _StudentGradesViewState();
}

class _StudentGradesViewState extends State<StudentGradesView> {
  String? _subject;

  @override
  Widget build(BuildContext context) {
    final repo = AppScope.of(context).repo;
    final s = repo.student(widget.studentId);
    final subjects = repo.subjectsOfClass(s.classId);
    final list = repo.gradesOfStudent(widget.studentId, subject: _subject);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        SizedBox(
          height: 40,
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: [
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: const Text('Barchasi'),
                  selected: _subject == null,
                  onSelected: (_) => setState(() => _subject = null),
                ),
              ),
              for (final sub in subjects)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(sub),
                    selected: _subject == sub,
                    onSelected: (_) => setState(() => _subject = sub),
                  ),
                ),
            ],
          ),
        ),
        if (_subject == null) ...[
          const SectionTitle("Fanlar bo'yicha o'rtacha"),
          Card(
            child: Column(
              children: [
                for (final sub in subjects) _SubjectAverageRow(studentId: widget.studentId, subject: sub),
              ],
            ),
          ),
        ],
        SectionTitle(_subject == null ? 'Barcha baholar' : '$_subject baholari'),
        if (list.isEmpty)
          const EmptyState(icon: Icons.star_outline, text: "Baho yo'q")
        else
          Card(child: Column(children: [for (final g in list) GradeTile(grade: g)])),
      ],
    );
  }
}

class _SubjectAverageRow extends StatelessWidget {
  const _SubjectAverageRow({required this.studentId, required this.subject});

  final String studentId;
  final String subject;

  @override
  Widget build(BuildContext context) {
    final repo = AppScope.of(context).repo;
    final list = repo.gradesOfStudent(studentId, subject: subject);
    final avg = repo.average(list);
    final color = avg == null ? AppColors.muted : AppColors.grade(avg.round());
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: [
          Expanded(flex: 3, child: Text(subject, style: const TextStyle(fontWeight: FontWeight.w600))),
          Expanded(
            flex: 4,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: avg == null ? 0 : (avg - 1) / 4,
                minHeight: 8,
                color: color,
                backgroundColor: color.withValues(alpha: 0.15),
              ),
            ),
          ),
          SizedBox(
            width: 52,
            child: Text(
              avg == null ? '—' : avg.toStringAsFixed(1),
              textAlign: TextAlign.right,
              style: TextStyle(fontWeight: FontWeight.w800, color: color),
            ),
          ),
        ],
      ),
    );
  }
}

/// Haftalik dars jadvali (kun tanlash bilan).
class ClassScheduleView extends StatefulWidget {
  const ClassScheduleView({super.key, required this.classId});

  final String classId;

  @override
  State<ClassScheduleView> createState() => _ClassScheduleViewState();
}

class _ClassScheduleViewState extends State<ClassScheduleView> {
  late int _day;

  @override
  void initState() {
    super.initState();
    final wd = DateTime.now().weekday;
    _day = wd == DateTime.sunday ? 1 : wd;
  }

  @override
  Widget build(BuildContext context) {
    final repo = AppScope.of(context).repo;
    final lessons = repo.lessonsOfClassOn(widget.classId, _day);
    final scheme = Theme.of(context).colorScheme;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        Row(
          children: [
            for (var d = 1; d <= 6; d++)
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 3),
                  child: _DayButton(
                    label: Fmt.weekdaysShort[d - 1],
                    selected: _day == d,
                    isToday: repo.today.weekday == d,
                    onTap: () => setState(() => _day = d),
                  ),
                ),
              ),
          ],
        ),
        SectionTitle(Fmt.weekdays[_day - 1]),
        if (lessons.isEmpty)
          const EmptyState(icon: Icons.free_breakfast_outlined, text: "Bu kunda dars yo'q")
        else
          for (var i = 0; i < lessons.length; i++) ...[
            Card(
              child: ListTile(
                leading: CircleAvatar(
                  backgroundColor: scheme.primaryContainer,
                  child: Text('${i + 1}', style: TextStyle(color: scheme.onPrimaryContainer)),
                ),
                title: Text(lessons[i].subject, style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text(
                    '${lessons[i].start} – ${lessons[i].end} · ${lessons[i].room}-xona\n'
                    '${repo.userById(lessons[i].teacherId)?.name ?? ''}'),
                isThreeLine: true,
              ),
            ),
            const SizedBox(height: 8),
          ],
      ],
    );
  }
}

class _DayButton extends StatelessWidget {
  const _DayButton({required this.label, required this.selected, required this.isToday, required this.onTap});

  final String label;
  final bool selected;
  final bool isToday;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: selected ? scheme.primary : scheme.surfaceContainerLowest,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Container(
          height: 48,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: isToday && !selected ? scheme.primary : scheme.outlineVariant),
          ),
          child: Text(label,
              style: TextStyle(
                  fontWeight: FontWeight.w700,
                  color: selected ? scheme.onPrimary : scheme.onSurface)),
        ),
      ),
    );
  }
}

/// Oylik to'lovlar. `canRecord` bo'lsa (direktor) to'lov kiritish tugmasi chiqadi.
class StudentPaymentsView extends StatelessWidget {
  const StudentPaymentsView({super.key, required this.studentId, this.canRecord = false});

  final String studentId;
  final bool canRecord;

  @override
  Widget build(BuildContext context) {
    final repo = AppScope.of(context).repo;
    final list = repo.invoicesOfStudent(studentId);
    final debt = repo.debtOfStudent(studentId);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        Card(
          color: (debt == 0 ? AppColors.success : AppColors.danger).withValues(alpha: 0.10),
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(debt == 0 ? "Barcha to'lovlar amalga oshirilgan" : 'Umumiy qarzdorlik',
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 6),
                Text(debt == 0 ? '0 so\'m' : Fmt.money(debt),
                    style: TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.w800,
                        color: debt == 0 ? AppColors.success : AppColors.danger)),
              ],
            ),
          ),
        ),
        const SectionTitle('Oylar kesimida'),
        for (final inv in list) ...[
          InvoiceCard(invoice: inv, canRecord: canRecord),
          const SizedBox(height: 8),
        ],
      ],
    );
  }
}

class InvoiceCard extends StatelessWidget {
  const InvoiceCard({super.key, required this.invoice, this.canRecord = false, this.showStudent = false});

  final Invoice invoice;
  final bool canRecord;
  final bool showStudent;

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final repo = app.repo;
    final inv = invoice;
    final overdue = inv.isOverdue(repo.now);
    final (String label, Color color) = inv.isPaid
        ? ("To'langan", AppColors.success)
        : overdue
            ? ("Muddati o'tgan", AppColors.danger)
            : inv.paid > 0
                ? ('Qisman', AppColors.warning)
                : ('Kutilmoqda', AppColors.primary);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    showStudent ? repo.student(inv.studentId).name : Fmt.month(inv.month),
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                  ),
                ),
                StatusPill(label, color: color),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              showStudent
                  ? '${Fmt.month(inv.month)} · muddat ${Fmt.date(inv.dueDate)}'
                  : 'Muddat: ${Fmt.date(inv.dueDate)}',
              style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 13),
            ),
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: inv.amount == 0 ? 1 : inv.paid / inv.amount,
                minHeight: 6,
                color: color,
                backgroundColor: color.withValues(alpha: 0.15),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(child: Text("To'landi: ${Fmt.money(inv.paid)}")),
                Text('Jami: ${Fmt.money(inv.amount)}', style: const TextStyle(fontWeight: FontWeight.w600)),
              ],
            ),
            if (inv.payments.isNotEmpty) ...[
              const Divider(height: 20),
              for (final p in inv.payments)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Row(
                    children: [
                      const Icon(Icons.check, size: 16, color: AppColors.success),
                      const SizedBox(width: 6),
                      Expanded(child: Text('${Fmt.date(p.date)} · ${p.method}')),
                      Text(Fmt.money(p.amount)),
                    ],
                  ),
                ),
            ],
            if (canRecord && !inv.isPaid) ...[
              const SizedBox(height: 10),
              Align(
                alignment: Alignment.centerRight,
                child: FilledButton.tonalIcon(
                  onPressed: () => showRecordPaymentSheet(context, inv),
                  icon: const Icon(Icons.add),
                  label: const Text("To'lov kiritish"),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

Future<void> showRecordPaymentSheet(BuildContext context, Invoice inv) {
  final app = AppScope.read(context);
  final ctrl = TextEditingController(text: '${inv.remaining}');
  var method = 'Naqd';
  String? error;
  return showModalBottomSheet<void>(
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
            Text("To'lov kiritish", style: Theme.of(ctx).textTheme.titleLarge),
            const SizedBox(height: 4),
            Text('${app.repo.student(inv.studentId).name} · ${Fmt.month(inv.month)} · '
                'qoldiq ${Fmt.money(inv.remaining)}'),
            const SizedBox(height: 16),
            TextField(
              controller: ctrl,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(labelText: "Summa (so'm)", errorText: error),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              children: [
                for (final m in const ['Naqd', 'Karta', 'Click', 'Payme'])
                  ChoiceChip(
                    label: Text(m),
                    selected: method == m,
                    onSelected: (_) => setSt(() => method = m),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () {
                final amount = int.tryParse(ctrl.text.replaceAll(RegExp(r'\D'), ''));
                if (amount == null || amount <= 0) {
                  setSt(() => error = "Summani kiriting");
                  return;
                }
                if (amount > inv.remaining) {
                  setSt(() => error = 'Qoldiqdan ko\'p: ${Fmt.money(inv.remaining)}');
                  return;
                }
                app.repo.addPayment(
                  invoiceId: inv.id,
                  amount: amount,
                  method: method,
                  recordedBy: app.currentUser!.id,
                );
                Navigator.of(ctx).pop();
                showSnack(context, "To'lov saqlandi, ota-onaga xabar yuborildi");
              },
              child: const Text('Saqlash'),
            ),
          ],
        ),
      ),
    ),
  );
}

/// Davomat tarixi (oxirgi 30 yozuv).
class StudentAttendanceView extends StatelessWidget {
  const StudentAttendanceView({super.key, required this.studentId});

  final String studentId;

  @override
  Widget build(BuildContext context) {
    final repo = AppScope.of(context).repo;
    final list = repo.attendanceHistory(studentId).take(30).toList();
    if (list.isEmpty) {
      return const EmptyState(icon: Icons.event_busy_outlined, text: "Davomat ma'lumoti yo'q");
    }
    return Card(
      child: Column(
        children: [
          for (final a in list)
            ListTile(
              dense: true,
              leading: a.snapshot != null
                  ? SnapshotThumb(
                      bytes: a.snapshot!,
                      size: 36,
                      circle: true,
                      title: '${Fmt.date(a.date)}, ${Fmt.time(a.markedAt)}',
                    )
                  : Icon(
                      a.source == AttendanceSource.face ? Icons.face_retouching_natural : Icons.edit_note,
                      color: attendanceColor(a.status),
                    ),
              title: Text('${Fmt.weekday(a.date)}, ${Fmt.date(a.date)}'),
              subtitle: Text(a.source == AttendanceSource.face ? 'Yuz tanish orqali' : "Qo'lda belgilandi"),
              trailing: StatusPill(
                a.status == AttendanceStatus.present || a.status == AttendanceStatus.late
                    ? '${a.status.label} ${Fmt.time(a.markedAt)}'
                    : a.status.label,
                color: attendanceColor(a.status),
              ),
            ),
        ],
      ),
    );
  }
}
