import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../core/theme.dart';
import '../../data/models.dart';
import '../../state/app_state.dart';
import '../../widgets/common.dart';
import '../student/student_profile_screen.dart';
import '../student/student_views.dart';
import '../teacher/teacher_shell.dart';

class DirectorShell extends StatefulWidget {
  const DirectorShell({super.key});

  @override
  State<DirectorShell> createState() => _DirectorShellState();
}

class _DirectorShellState extends State<DirectorShell> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final instId = app.currentUser!.institutionId!;
    return Scaffold(
      body: switch (_tab) {
        0 => _DashboardTab(institutionId: instId, onOpenTab: (i) => setState(() => _tab = i)),
        1 => _StudentsTab(institutionId: instId),
        2 => _ClassesTab(institutionId: instId),
        3 => _PaymentsTab(institutionId: instId),
        _ => _AnnouncementTab(institutionId: instId),
      },
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dashboard_outlined), selectedIcon: Icon(Icons.dashboard), label: 'Panel'),
          NavigationDestination(icon: Icon(Icons.people_outline), selectedIcon: Icon(Icons.people), label: "O'quvchilar"),
          NavigationDestination(icon: Icon(Icons.class_outlined), selectedIcon: Icon(Icons.class_), label: 'Sinflar'),
          NavigationDestination(
              icon: Icon(Icons.payments_outlined), selectedIcon: Icon(Icons.payments), label: "To'lovlar"),
          NavigationDestination(icon: Icon(Icons.campaign_outlined), selectedIcon: Icon(Icons.campaign), label: "E'lon"),
        ],
      ),
    );
  }
}

class _DashboardTab extends StatelessWidget {
  const _DashboardTab({required this.institutionId, required this.onOpenTab});

  final String institutionId;
  final void Function(int) onOpenTab;

  @override
  Widget build(BuildContext context) {
    final repo = AppScope.of(context).repo;
    final inst = repo.institution(institutionId)!;
    final students = repo.studentsOfInstitution(institutionId);
    final teachers = repo.teachersOfInstitution(institutionId);
    final stats = repo.attendanceStats(institutionId, repo.today);
    final absent = students.where((s) {
      final a = repo.attendanceOf(s.id, repo.today);
      return a != null && (a.status == AttendanceStatus.absent || a.status == AttendanceStatus.excused);
    }).toList();
    final debtors = students.where((s) => repo.debtOfStudent(s.id) > 0).toList()
      ..sort((a, b) => repo.debtOfStudent(b.id).compareTo(repo.debtOfStudent(a.id)));
    final totalDebt = debtors.fold<int>(0, (sum, s) => sum + repo.debtOfStudent(s.id));
    final monthInvoices = repo.invoicesOfInstitution(institutionId).where(
        (i) => i.month.year == repo.now.year && i.month.month == repo.now.month);
    final monthPaid = monthInvoices.fold<int>(0, (s, i) => s + i.paid);
    final monthTotal = monthInvoices.fold<int>(0, (s, i) => s + i.amount);

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(inst.name, overflow: TextOverflow.ellipsis),
            Text('${inst.type.label} · ${Fmt.weekday(repo.today)}, ${Fmt.date(repo.today)}',
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w400,
                    color: Theme.of(context).colorScheme.onSurfaceVariant)),
          ],
        ),
        actions: const [AccountButton()],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          TwoColumn(children: [
            StatCard(
              label: 'Bugungi davomat',
              value: stats.marked == 0 ? '—' : '${(stats.present * 100 / stats.marked).round()}%',
              caption: 'Belgilangan: ${stats.marked}/${stats.total}',
              icon: Icons.how_to_reg_rounded,
              color: AppColors.success,
            ),
            StatCard(
              label: "O'quvchilar",
              value: '${students.length}',
              caption: "O'qituvchilar: ${teachers.length}",
              icon: Icons.people_rounded,
              onTap: () => onOpenTab(1),
            ),
            StatCard(
              label: "${Fmt.month(repo.now)} tushumi",
              value: Fmt.money(monthPaid),
              caption: monthTotal == 0 ? null : 'Rejaning ${(monthPaid * 100 / monthTotal).round()}%',
              icon: Icons.trending_up_rounded,
              color: AppColors.primary,
              onTap: () => onOpenTab(3),
            ),
            StatCard(
              label: 'Umumiy qarzdorlik',
              value: Fmt.money(totalDebt),
              caption: '${debtors.length} ta qarzdor',
              icon: Icons.warning_amber_rounded,
              color: totalDebt == 0 ? AppColors.success : AppColors.danger,
              onTap: () => onOpenTab(3),
            ),
          ]),
          SectionTitle('Bugun kelmaganlar (${absent.length})'),
          if (absent.isEmpty)
            Card(
              child: ListTile(
                leading: const Icon(Icons.check_circle_outline, color: AppColors.success),
                title: Text(stats.marked == 0 ? 'Davomat hali olinmagan' : "Barcha o'quvchilar kelgan"),
              ),
            )
          else
            Card(
              child: Column(
                children: [
                  for (final s in absent)
                    ListTile(
                      leading: Avatar(s.name, color: AppColors.danger),
                      title: Text(s.name),
                      subtitle: Text(
                          '${repo.schoolClass(s.classId).name} · ${repo.attendanceOf(s.id, repo.today)!.status.label}'),
                      onTap: () => _openStudent(context, s.id),
                    ),
                ],
              ),
            ),
          SectionTitle('Eng katta qarzdorlik',
              trailing: TextButton(onPressed: () => onOpenTab(3), child: const Text('Barchasi'))),
          if (debtors.isEmpty)
            const EmptyState(icon: Icons.celebration_outlined, text: "Qarzdorlik yo'q")
          else
            Card(
              child: Column(
                children: [
                  for (final s in debtors.take(5))
                    ListTile(
                      leading: Avatar(s.name, color: AppColors.warning),
                      title: Text(s.name),
                      subtitle: Text(repo.schoolClass(s.classId).name),
                      trailing: Text(Fmt.money(repo.debtOfStudent(s.id)),
                          style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w700)),
                      onTap: () => _openStudent(context, s.id),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

void _openStudent(BuildContext context, String id) {
  Navigator.of(context).push(MaterialPageRoute<void>(
    builder: (_) => StudentProfileScreen(studentId: id, showPayments: true),
  ));
}

class _StudentsTab extends StatefulWidget {
  const _StudentsTab({required this.institutionId});

  final String institutionId;

  @override
  State<_StudentsTab> createState() => _StudentsTabState();
}

class _StudentsTabState extends State<_StudentsTab> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final repo = AppScope.of(context).repo;
    final all = repo.studentsOfInstitution(widget.institutionId);
    final q = _q.toLowerCase();
    final list = q.isEmpty ? all : all.where((s) => s.name.toLowerCase().contains(q)).toList();
    return Scaffold(
      appBar: AppBar(title: Text("O'quvchilar (${all.length})"), actions: const [AccountButton()]),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          TextField(
            onChanged: (v) => setState(() => _q = v),
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.search),
              hintText: 'Ism bo\'yicha qidirish',
            ),
          ),
          const SizedBox(height: 12),
          if (list.isEmpty)
            const EmptyState(icon: Icons.search_off, text: 'Topilmadi')
          else
            Card(
              child: Column(
                children: [
                  for (final s in list)
                    Builder(builder: (context) {
                      final debt = repo.debtOfStudent(s.id);
                      final att = repo.attendanceOf(s.id, repo.today);
                      return ListTile(
                        leading: Avatar(s.name),
                        title: Text(s.name),
                        subtitle: Text(repo.schoolClass(s.classId).name),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (debt > 0)
                              const Padding(
                                padding: EdgeInsets.only(right: 6),
                                child: Icon(Icons.account_balance_wallet, size: 18, color: AppColors.danger),
                              ),
                            if (att != null)
                              Icon(Icons.circle, size: 10, color: attendanceColor(att.status)),
                          ],
                        ),
                        onTap: () => _openStudent(context, s.id),
                      );
                    }),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _ClassesTab extends StatelessWidget {
  const _ClassesTab({required this.institutionId});

  final String institutionId;

  @override
  Widget build(BuildContext context) {
    final repo = AppScope.of(context).repo;
    final classes = repo.classesOfInstitution(institutionId);
    final teachers = repo.teachersOfInstitution(institutionId);
    return Scaffold(
      appBar: AppBar(title: const Text('Sinflar va guruhlar'), actions: const [AccountButton()]),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          for (final c in classes) ...[
            Card(
              child: ListTile(
                leading: const Icon(Icons.class_outlined),
                title: Text(c.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text("${c.studentIds.length} o'quvchi · rahbar: "
                    '${repo.userById(c.homeroomTeacherId)?.name ?? '—'}'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(
                  builder: (_) => DefaultTabController(
                    length: 2,
                    child: Scaffold(
                      appBar: AppBar(
                        title: Text(c.name),
                        bottom: const TabBar(tabs: [Tab(text: "O'quvchilar"), Tab(text: 'Jadval')]),
                      ),
                      body: TabBarView(children: [
                        _ClassStudentsBody(classId: c.id),
                        ClassScheduleView(classId: c.id),
                      ]),
                    ),
                  ),
                )),
              ),
            ),
            const SizedBox(height: 8),
          ],
          SectionTitle("O'qituvchilar (${teachers.length})"),
          Card(
            child: Column(
              children: [
                for (final t in teachers)
                  ListTile(
                    leading: Avatar(t.name, color: AppColors.primary),
                    title: Text(t.name),
                    subtitle: Text('${t.subject ?? ''} · ${Fmt.phone(t.phone)}'),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// ClassStudentsScreen'ning tanasi (o'z AppBar'isiz).
class _ClassStudentsBody extends StatelessWidget {
  const _ClassStudentsBody({required this.classId});

  final String classId;

  @override
  Widget build(BuildContext context) {
    final repo = AppScope.of(context).repo;
    final students = repo.studentsOfClass(classId);
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Column(
            children: [
              for (final s in students)
                ListTile(
                  leading: Avatar(s.name),
                  title: Text(s.name),
                  subtitle: Text(s.faceEnrolled ? "Yuz ro'yxatda" : "Yuz ro'yxatda emas"),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => _openStudent(context, s.id),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(
            builder: (_) => ClassStudentsScreen(classId: classId, showPayments: true),
          )),
          icon: const Icon(Icons.face_retouching_natural),
          label: const Text('Yuz namunalarini boshqarish'),
        ),
      ],
    );
  }
}

enum _PayFilter { debt, all, paid }

class _PaymentsTab extends StatefulWidget {
  const _PaymentsTab({required this.institutionId});

  final String institutionId;

  @override
  State<_PaymentsTab> createState() => _PaymentsTabState();
}

class _PaymentsTabState extends State<_PaymentsTab> {
  _PayFilter _filter = _PayFilter.debt;
  late DateTime _month;
  bool _init = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_init) {
      final now = AppScope.read(context).repo.now;
      _month = DateTime(now.year, now.month);
      _init = true;
    }
  }

  @override
  Widget build(BuildContext context) {
    final repo = AppScope.of(context).repo;
    final all = repo.invoicesOfInstitution(widget.institutionId);
    final months = all.map((i) => DateTime(i.month.year, i.month.month)).toSet().toList()
      ..sort((a, b) => b.compareTo(a));
    final ofMonth = all.where((i) => i.month.year == _month.year && i.month.month == _month.month).toList();
    final list = (switch (_filter) {
      _PayFilter.debt => ofMonth.where((i) => !i.isPaid).toList(),
      _PayFilter.paid => ofMonth.where((i) => i.isPaid).toList(),
      _PayFilter.all => ofMonth,
    })
      ..sort((a, b) => repo.student(a.studentId).name.compareTo(repo.student(b.studentId).name));
    final paid = ofMonth.fold<int>(0, (s, i) => s + i.paid);
    final remaining = ofMonth.fold<int>(0, (s, i) => s + i.remaining);

    return Scaffold(
      appBar: AppBar(title: const Text("To'lovlar"), actions: const [AccountButton()]),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                for (final m in months)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(Fmt.month(m)),
                      selected: m == _month,
                      onSelected: (_) => setState(() => _month = m),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          TwoColumn(children: [
            StatCard(label: 'Tushgan', value: Fmt.money(paid), icon: Icons.south_west, color: AppColors.success),
            StatCard(label: 'Qoldiq', value: Fmt.money(remaining), icon: Icons.schedule, color: AppColors.danger),
          ]),
          const SizedBox(height: 12),
          SegmentedButton<_PayFilter>(
            segments: const [
              ButtonSegment(value: _PayFilter.debt, label: Text('Qarzdor')),
              ButtonSegment(value: _PayFilter.all, label: Text('Barchasi')),
              ButtonSegment(value: _PayFilter.paid, label: Text("To'langan")),
            ],
            selected: {_filter},
            onSelectionChanged: (v) => setState(() => _filter = v.first),
          ),
          const SizedBox(height: 12),
          if (list.isEmpty)
            const EmptyState(icon: Icons.receipt_long_outlined, text: "Ro'yxat bo'sh")
          else
            for (final inv in list) ...[
              InvoiceCard(invoice: inv, canRecord: true, showStudent: true),
              const SizedBox(height: 8),
            ],
        ],
      ),
    );
  }
}

class _AnnouncementTab extends StatefulWidget {
  const _AnnouncementTab({required this.institutionId});

  final String institutionId;

  @override
  State<_AnnouncementTab> createState() => _AnnouncementTabState();
}

class _AnnouncementTabState extends State<_AnnouncementTab> {
  final _title = TextEditingController();
  final _body = TextEditingController();
  String? _classId; // null = hammaga
  String? _error;

  @override
  void dispose() {
    _title.dispose();
    _body.dispose();
    super.dispose();
  }

  void _send() {
    if (_title.text.trim().isEmpty || _body.text.trim().isEmpty) {
      setState(() => _error = "Sarlavha va matnni to'ldiring");
      return;
    }
    final n = AppScope.read(context).repo.sendAnnouncement(
          institutionId: widget.institutionId,
          classId: _classId,
          title: _title.text.trim(),
          body: _body.text.trim(),
        );
    _title.clear();
    _body.clear();
    setState(() => _error = null);
    FocusScope.of(context).unfocus();
    showSnack(context, "E'lon $n ta ota-onaga yuborildi");
  }

  @override
  Widget build(BuildContext context) {
    final repo = AppScope.of(context).repo;
    final classes = repo.classesOfInstitution(widget.institutionId);
    return Scaffold(
      appBar: AppBar(title: const Text("E'lon yuborish"), actions: const [AccountButton()]),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('Kimga:', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              ChoiceChip(
                label: const Text('Barcha ota-onalar'),
                selected: _classId == null,
                onSelected: (_) => setState(() => _classId = null),
              ),
              for (final c in classes)
                ChoiceChip(
                  label: Text(c.name),
                  selected: _classId == c.id,
                  onSelected: (_) => setState(() => _classId = c.id),
                ),
            ],
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _title,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(labelText: 'Sarlavha', errorText: _error),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _body,
            minLines: 4,
            maxLines: 8,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(labelText: 'Matn', alignLabelWithHint: true),
          ),
          const SizedBox(height: 16),
          FilledButton.icon(onPressed: _send, icon: const Icon(Icons.send), label: const Text('Yuborish')),
          const SizedBox(height: 8),
          Text("Ota-onalar ilovasiga push-xabar sifatida boradi.",
              style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 13)),
        ],
      ),
    );
  }
}
