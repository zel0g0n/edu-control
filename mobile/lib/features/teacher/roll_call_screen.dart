import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../../core/theme.dart';
import '../../data/models.dart';
import '../../state/app_state.dart';
import '../../widgets/common.dart';
import '../../widgets/snapshot.dart';

/// Bitta o'quvchi uchun belgi (saqlanmaguncha faqat ekranda).
class PendingMark {
  PendingMark(this.status, {this.source = AttendanceSource.manual, this.snapshot, this.score});

  AttendanceStatus status;
  AttendanceSource source;
  Uint8List? snapshot;
  double? score;
}

/// Yo'qlama: o'quvchilarni birma-bir chaqirib yoki ro'yxatdan belgilash.
/// Kamera davomatidan keyin ham shu ekran ochiladi: tanilganlar allaqachon
/// belgilangan bo'ladi, o'qituvchi faqat qolganlarini yakunlaydi.
class RollCallScreen extends StatefulWidget {
  const RollCallScreen({super.key, required this.lesson, this.presets = const {}, this.fromCamera = false});

  final Lesson lesson;
  final Map<String, PendingMark> presets;
  final bool fromCamera;

  @override
  State<RollCallScreen> createState() => _RollCallScreenState();
}

class _RollCallScreenState extends State<RollCallScreen> {
  final Map<String, PendingMark> _marks = {};
  late List<Student> _students;
  bool _oneByOne = true;
  int _index = 0;
  bool _init = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_init) return;
    _init = true;
    final repo = AppScope.read(context).repo;
    _students = repo.studentsOfClass(widget.lesson.classId);
    for (final s in _students) {
      final rec = repo.attendanceOf(s.id, repo.today);
      if (rec != null) _marks[s.id] = PendingMark(rec.status, source: rec.source, snapshot: rec.snapshot, score: rec.matchScore);
    }
    _marks.addAll(widget.presets);
    // Kameradan kelganda: tanilganlar oxirida, belgilanmaganlar oldinda.
    if (widget.fromCamera) {
      _students.sort((a, b) {
        final am = widget.presets.containsKey(a.id) ? 1 : 0;
        final bm = widget.presets.containsKey(b.id) ? 1 : 0;
        return am != bm ? am - bm : a.name.compareTo(b.name);
      });
    }
    _index = _firstUnmarked(0) ?? 0;
  }

  int? _firstUnmarked(int from) {
    for (var i = 0; i < _students.length; i++) {
      final k = (from + i) % _students.length;
      if (!_marks.containsKey(_students[k].id)) return k;
    }
    return null;
  }

  void _mark(Student s, AttendanceStatus st) {
    setState(() {
      final prev = _marks[s.id];
      // Kamera tanigan o'quvchining holati o'zgartirilsa ham, yuz kesimi qoladi.
      _marks[s.id] = PendingMark(
        st,
        source: prev?.source ?? AttendanceSource.manual,
        snapshot: prev?.snapshot,
        score: prev?.score,
      );
      if (_oneByOne) {
        final next = _firstUnmarked(_index + 1);
        if (next != null) _index = next;
      }
    });
  }

  Future<void> _save() async {
    final unmarked = _students.where((s) => !_marks.containsKey(s.id)).toList();
    if (unmarked.isNotEmpty) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text('${unmarked.length} ta o\'quvchi belgilanmagan'),
          content: const Text("Ular \"kelmadi\" deb saqlansinmi? Ota-onalariga xabar boradi."),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Ortga')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Ha, saqlash')),
          ],
        ),
      );
      if (ok != true) return;
      for (final s in unmarked) {
        _marks[s.id] = PendingMark(AttendanceStatus.absent);
      }
    }
    if (!mounted) return;
    final app = AppScope.read(context);
    for (final s in _students) {
      final m = _marks[s.id]!;
      app.repo.markAttendance(
        studentId: s.id,
        status: m.status,
        source: m.source,
        markedBy: app.currentUser!.id,
        snapshot: m.snapshot,
        matchScore: m.score,
      );
    }
    final present = _marks.values
        .where((m) => m.status == AttendanceStatus.present || m.status == AttendanceStatus.late)
        .length;
    Navigator.of(context).pop(true);
    showSnack(context, 'Davomat saqlandi: $present/${_students.length} keldi. Ota-onalarga xabar yuborildi');
  }

  @override
  Widget build(BuildContext context) {
    final repo = AppScope.of(context).repo;
    final marked = _students.where((s) => _marks.containsKey(s.id)).length;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.fromCamera ? 'Davomatni yakunlash' : "Yo'qlama"),
        actions: [
          IconButton(
            tooltip: _oneByOne ? "Ro'yxat ko'rinishi" : 'Birma-bir',
            icon: Icon(_oneByOne ? Icons.view_list_outlined : Icons.person_outline),
            onPressed: () => setState(() => _oneByOne = !_oneByOne),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(6),
          child: LinearProgressIndicator(
            value: _students.isEmpty ? 0 : marked / _students.length,
            minHeight: 6,
          ),
        ),
      ),
      body: _students.isEmpty
          ? const EmptyState(icon: Icons.group_off_outlined, text: "Sinfda o'quvchi yo'q")
          : _oneByOne
              ? _buildOneByOne(repo.schoolClass(widget.lesson.classId).name)
              : _buildList(),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: FilledButton(
            onPressed: _students.isEmpty ? null : _save,
            child: Text('Saqlash ($marked/${_students.length})'),
          ),
        ),
      ),
    );
  }

  Widget _buildOneByOne(String className) {
    final s = _students[_index];
    final m = _marks[s.id];
    final scheme = Theme.of(context).colorScheme;
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Row(
          children: [
            IconButton.filledTonal(
              onPressed: _index == 0 ? null : () => setState(() => _index--),
              icon: const Icon(Icons.chevron_left),
            ),
            Expanded(
              child: Text('${_index + 1} / ${_students.length} · $className',
                  textAlign: TextAlign.center, style: TextStyle(color: scheme.onSurfaceVariant)),
            ),
            IconButton.filledTonal(
              onPressed: _index >= _students.length - 1 ? null : () => setState(() => _index++),
              icon: const Icon(Icons.chevron_right),
            ),
          ],
        ),
        const SizedBox(height: 24),
        Center(child: _StudentFace(student: s, snapshot: m?.snapshot, size: 128)),
        const SizedBox(height: 16),
        Text(s.name,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: 8),
        Center(
          child: m == null
              ? Text('Belgilanmagan', style: TextStyle(color: scheme.onSurfaceVariant))
              : StatusPill(
                  m.source == AttendanceSource.face ? '${m.status.label} · kamera' : m.status.label,
                  color: attendanceColor(m.status),
                  icon: m.source == AttendanceSource.face ? Icons.face_retouching_natural : null,
                ),
        ),
        const SizedBox(height: 28),
        Row(
          children: [
            Expanded(child: _BigButton(status: AttendanceStatus.present, selected: m?.status, onTap: () => _mark(s, AttendanceStatus.present))),
            const SizedBox(width: 12),
            Expanded(child: _BigButton(status: AttendanceStatus.absent, selected: m?.status, onTap: () => _mark(s, AttendanceStatus.absent))),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: _BigButton(status: AttendanceStatus.late, selected: m?.status, onTap: () => _mark(s, AttendanceStatus.late))),
            const SizedBox(width: 12),
            Expanded(child: _BigButton(status: AttendanceStatus.excused, selected: m?.status, onTap: () => _mark(s, AttendanceStatus.excused))),
          ],
        ),
      ],
    );
  }

  Widget _buildList() {
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: _students.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (context, i) {
        final s = _students[i];
        final m = _marks[s.id];
        return Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    _StudentFace(student: s, snapshot: m?.snapshot, size: 40),
                    const SizedBox(width: 10),
                    Expanded(child: Text(s.name, style: const TextStyle(fontWeight: FontWeight.w600))),
                    if (m?.source == AttendanceSource.face)
                      const Icon(Icons.face_retouching_natural, size: 18, color: AppColors.primary),
                  ],
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final o in AttendanceStatus.values)
                      ChoiceChip(
                        visualDensity: VisualDensity.compact,
                        label: Text(o.label),
                        selected: m?.status == o,
                        selectedColor: attendanceColor(o).withValues(alpha: 0.2),
                        onSelected: (_) => _mark(s, o),
                      ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _StudentFace extends StatelessWidget {
  const _StudentFace({required this.student, required this.snapshot, required this.size});

  final Student student;
  final Uint8List? snapshot;
  final double size;

  @override
  Widget build(BuildContext context) {
    final bytes = snapshot ?? student.facePhoto;
    if (bytes == null) return Avatar(student.name, radius: size / 2);
    return SnapshotThumb(bytes: bytes, size: size, circle: true);
  }
}

class _BigButton extends StatelessWidget {
  const _BigButton({required this.status, required this.selected, required this.onTap});

  final AttendanceStatus status;
  final AttendanceStatus? selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = attendanceColor(status);
    final isSel = selected == status;
    return Material(
      color: isSel ? c : c.withValues(alpha: 0.10),
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: SizedBox(
          height: 68,
          child: Center(
            child: Text(status.label,
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: isSel ? Colors.white : c)),
          ),
        ),
      ),
    );
  }
}
