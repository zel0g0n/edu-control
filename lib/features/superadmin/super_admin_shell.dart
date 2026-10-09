import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../core/theme.dart';
import '../../data/models.dart';
import '../../state/app_state.dart';
import '../../widgets/common.dart';

/// Super admin (platforma egasi): barcha muassasalar.
/// Rejada bu alohida veb-panel bo'ladi; mock bosqichda ilova ichida.
class SuperAdminShell extends StatelessWidget {
  const SuperAdminShell({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = AppScope.of(context).repo;
    final list = [...repo.institutions]..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    final active = list.where((i) => i.active).length;
    final totalStudents = repo.students.length;
    final totalTeachers = repo.users.where((u) => u.role == UserRole.teacher).length;
    final totalParents = repo.users.where((u) => u.role == UserRole.parent).length;

    return Scaffold(
      appBar: AppBar(title: const Text('Platforma boshqaruvi'), actions: const [AccountButton()]),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _addInstitution(context),
        icon: const Icon(Icons.add_business),
        label: const Text("Muassasa qo'shish"),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
        children: [
          TwoColumn(children: [
            StatCard(
              label: 'Muassasalar',
              value: '${list.length}',
              caption: 'Faol: $active',
              icon: Icons.apartment_rounded,
            ),
            StatCard(
              label: "O'quvchilar",
              value: '$totalStudents',
              icon: Icons.school_rounded,
              color: AppColors.success,
            ),
            StatCard(
              label: "O'qituvchilar",
              value: '$totalTeachers',
              icon: Icons.co_present_rounded,
              color: AppColors.warning,
            ),
            StatCard(
              label: 'Ota-onalar',
              value: '$totalParents',
              icon: Icons.family_restroom_rounded,
              color: AppColors.primary,
            ),
          ]),
          const SectionTitle('Muassasalar'),
          for (final inst in list) ...[
            _InstitutionCard(inst: inst),
            const SizedBox(height: 8),
          ],
        ],
      ),
    );
  }

  Future<void> _addInstitution(BuildContext context) async {
    final repo = AppScope.read(context).repo;
    final name = TextEditingController();
    final city = TextEditingController();
    var type = InstitutionType.school;
    String? error;
    var added = false;

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
              Text('Yangi muassasa', style: Theme.of(ctx).textTheme.titleLarge),
              const SizedBox(height: 16),
              SegmentedButton<InstitutionType>(
                segments: [
                  for (final t in InstitutionType.values) ButtonSegment(value: t, label: Text(t.label)),
                ],
                selected: {type},
                onSelectionChanged: (v) => setSt(() => type = v.first),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: name,
                decoration: InputDecoration(labelText: 'Nomi', errorText: error),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: city,
                decoration: const InputDecoration(labelText: 'Shahar / tuman'),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () {
                  if (name.text.trim().isEmpty) {
                    setSt(() => error = 'Nomini kiriting');
                    return;
                  }
                  repo.addInstitution(name: name.text.trim(), type: type, city: city.text.trim());
                  added = true;
                  Navigator.of(ctx).pop();
                },
                child: const Text("Qo'shish"),
              ),
            ],
          ),
        ),
      ),
    );
    if (added && context.mounted) showSnack(context, "Muassasa qo'shildi");
  }
}

class _InstitutionCard extends StatelessWidget {
  const _InstitutionCard({required this.inst});

  final Institution inst;

  @override
  Widget build(BuildContext context) {
    final repo = AppScope.of(context).repo;
    final students = repo.studentsOfInstitution(inst.id).length;
    final teachers = repo.teachersOfInstitution(inst.id).length;
    final debt = repo
        .studentsOfInstitution(inst.id)
        .fold<int>(0, (s, st) => s + repo.debtOfStudent(st.id));
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
        child: Row(
          children: [
            Avatar(inst.name, color: inst.active ? AppColors.primary : AppColors.muted),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(inst.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  const SizedBox(height: 2),
                  Text('${inst.type.label} · ${inst.city.isEmpty ? '—' : inst.city}'),
                  const SizedBox(height: 4),
                  Text(
                    "$students o'quvchi · $teachers o'qituvchi · qarz ${Fmt.money(debt)}",
                    style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant),
                  ),
                  Text(
                    "Qo'shilgan: ${Fmt.dateFull(inst.createdAt)}",
                    style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant),
                  ),
                ],
              ),
            ),
            Column(
              children: [
                Switch(
                  value: inst.active,
                  onChanged: (v) => repo.setInstitutionActive(inst.id, v),
                ),
                Text(inst.active ? 'Faol' : 'Bloklangan',
                    style: TextStyle(
                        fontSize: 11,
                        color: inst.active ? AppColors.success : AppColors.danger,
                        fontWeight: FontWeight.w600)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
