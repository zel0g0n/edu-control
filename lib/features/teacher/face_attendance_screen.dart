import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';

import '../../core/theme.dart';
import '../../data/models.dart';
import '../../face/camera_frame.dart';
import '../../face/face_config.dart';
import '../../face/face_embedder.dart';
import '../../face/face_matcher.dart';
import '../../face/live_camera.dart';
import '../../state/app_state.dart';
import '../../widgets/common.dart';
import '../../widgets/snapshot.dart';
import 'roll_call_screen.dart';

/// Jonli kamera orqali davomat.
///
/// O'qituvchi kamerani sinfga qaratadi: tanilgan o'quvchilar yashil doira
/// va ism bilan belgilanadi. Sariq doira: ishonch past, bosib tasdiqlanadi.
/// Oq doira: tanilmadi, bosib o'quvchini tanlash yoki yaqinlashtirish mumkin.
///
/// Hech narsa yozib olinmaydi. Har bir tanilgan o'quvchi uchun faqat
/// UNING yuz kesimi saqlanadi va davomat saqlanganda ota-onasiga boradi.
class FaceAttendanceScreen extends StatefulWidget {
  const FaceAttendanceScreen({super.key, required this.lesson});

  final Lesson lesson;

  @override
  State<FaceAttendanceScreen> createState() => _FaceAttendanceScreenState();
}

enum _ViewKind { confirmed, review, unknown, small, turned }

class _FaceView {
  _FaceView({
    required this.kind,
    required this.box,
    required this.frame,
    required this.face,
    this.studentId,
    this.score,
  });

  final _ViewKind kind;
  final Rect box; // tik kadr koordinatalari
  final FrameData frame;
  final Face face;
  final String? studentId;
  final double? score;
}

class _Recognized {
  _Recognized({required this.snapshot, required this.score, required this.byTeacher, required this.trackingId});

  Uint8List snapshot;
  double? score;
  bool byTeacher;
  int? trackingId;
}

class _FaceAttendanceScreenState extends State<FaceAttendanceScreen> {
  FaceEmbedder? _embedder;
  String? _modelError;
  late FaceGallery _gallery;
  late List<Student> _students;
  bool _init = false;

  final Map<int, TrackState> _tracks = {};
  final Map<String, _Recognized> _recognized = {};
  Set<int> _visibleTracks = {};
  List<_FaceView> _views = const [];
  bool _paused = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final e = await FaceEmbedder.instance();
      if (mounted) setState(() => _embedder = e);
    } catch (e) {
      if (mounted) setState(() => _modelError = 'Yuz tanish modeli yuklanmadi: $e');
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_init) return;
    _init = true;
    final repo = AppScope.read(context).repo;
    _students = repo.studentsOfClass(widget.lesson.classId);
    _gallery = FaceGallery(repo.faceTemplatesOf(_students));
  }

  Student _student(String id) => _students.firstWhere((s) => s.id == id);

  // ---------------------------------------------------------------- Kadrlar

  Future<void> _onFaces(FrameData frame, List<Face> faces) async {
    final emb = _embedder;
    if (emb == null || _paused) return;
    var budget = FaceConfig.maxEmbeddingsPerFrame;
    final views = <_FaceView>[];
    final visible = <int>{};

    for (final f in faces) {
      final id = f.trackingId;
      TrackState? t;
      if (id != null) {
        visible.add(id);
        t = _tracks.putIfAbsent(id, () => TrackState(id));
      }
      _FaceView view(_ViewKind k, {String? sid, double? score}) =>
          _FaceView(kind: k, box: f.boundingBox, frame: frame, face: f, studentId: sid, score: score);

      // 1) Bu yuz allaqachon tasdiqlangan.
      final confirmed = t?.confirmedStudentId;
      if (confirmed != null && _recognized.containsKey(confirmed)) {
        views.add(view(_ViewKind.confirmed, sid: confirmed, score: _recognized[confirmed]!.score));
        continue;
      }
      // 2) Tanish uchun juda kichik yoki burilgan.
      if (f.boundingBox.width < FaceConfig.minFaceWidthPx) {
        views.add(view(_ViewKind.small));
        continue;
      }
      if ((f.headEulerAngleY ?? 0).abs() > FaceConfig.maxYawDeg) {
        views.add(view(_ViewKind.turned));
        continue;
      }
      if (_gallery.isEmpty || budget == 0) {
        final last = t?.last;
        views.add(view(
          last != null && last.level == MatchLevel.review ? _ViewKind.review : _ViewKind.unknown,
          sid: last?.studentId,
          score: last?.score,
        ));
        continue;
      }
      budget--;

      // 3) Tanish.
      final r = _gallery.match(emb.embed(frame, f));
      if (t == null) {
        // Kuzatuv raqami yo'q: avtomatik tasdiqlamaymiz, faqat ko'rsatamiz.
        views.add(view(r.level == MatchLevel.unknown ? _ViewKind.unknown : _ViewKind.review,
            sid: r.studentId, score: r.score));
        continue;
      }
      final newly = t.addResult(r);
      if (newly != null) {
        final other = _recognized[newly]?.trackingId;
        if (other != null && other != id && _visibleTracks.contains(other)) {
          // Bir vaqtda ikki yuz bitta o'quvchiga mos keldi: o'qituvchi hal qiladi.
          t.confirmedStudentId = null;
          views.add(view(_ViewKind.review, sid: newly, score: r.score));
          continue;
        }
        _confirm(newly, frame, f, score: r.score, byTeacher: false, trackingId: id);
        views.add(view(_ViewKind.confirmed, sid: newly, score: r.score));
        continue;
      }
      views.add(view(
        r.level == MatchLevel.unknown ? _ViewKind.unknown : _ViewKind.review,
        sid: r.studentId,
        score: r.score,
      ));
    }

    // Ko'rinmay qolgan kuzatuvlarni tozalash (tasdiqlanganlar natijasi saqlanadi).
    _tracks.removeWhere((id, t) => !visible.contains(id) && t.confirmedStudentId == null);
    _visibleTracks = visible;
    if (mounted) setState(() => _views = views);
  }

  void _confirm(String studentId, FrameData frame, Face face,
      {double? score, required bool byTeacher, int? trackingId}) {
    final snap = frame.faceSnapshotJpeg(face);
    final prev = _recognized[studentId];
    if (prev != null) {
      prev
        ..snapshot = snap
        ..score = score
        ..byTeacher = byTeacher
        ..trackingId = trackingId ?? prev.trackingId;
    } else {
      _recognized[studentId] =
          _Recognized(snapshot: snap, score: score, byTeacher: byTeacher, trackingId: trackingId);
      HapticFeedback.lightImpact();
    }
    if (trackingId != null) {
      final t = _tracks.putIfAbsent(trackingId, () => TrackState(trackingId));
      t
        ..confirmedStudentId = studentId
        ..confirmedByTeacher = byTeacher;
    }
  }

  void _unconfirm(String studentId) {
    final r = _recognized.remove(studentId);
    final tid = r?.trackingId;
    if (tid != null) _tracks.remove(tid);
  }

  // ---------------------------------------------------------------- O'qituvchi amallari

  Future<void> _onTapView(_FaceView v) async {
    setState(() => _paused = true);
    try {
      switch (v.kind) {
        case _ViewKind.small:
          showSnack(context, 'Yuz juda kichik: ikki barmoq bilan yaqinlashtiring');
        case _ViewKind.turned:
          showSnack(context, "O'quvchi kameraga qarashini kuting");
        case _ViewKind.confirmed:
          await _confirmedActions(v);
        case _ViewKind.review:
          await _reviewActions(v);
        case _ViewKind.unknown:
          await _assign(v);
      }
    } finally {
      if (mounted) setState(() => _paused = false);
    }
  }

  Future<void> _reviewActions(_FaceView v) async {
    final sid = v.studentId;
    if (sid == null) return _assign(v);
    final s = _student(sid);
    final preview = v.frame.faceSnapshotJpeg(v.face);
    final answer = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Bu ${s.name}mi?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SnapshotThumb(bytes: preview, size: 96, enlargeOnTap: false),
                if (s.facePhoto != null) ...[
                  const SizedBox(width: 12),
                  SnapshotThumb(bytes: s.facePhoto!, size: 96, enlargeOnTap: false),
                ],
              ],
            ),
            const SizedBox(height: 8),
            Text(
              s.facePhoto != null
                  ? "Chapda: hozirgi kadr, o'ngda: ro'yxatdagi namuna"
                  : 'Moslik: ${((v.score ?? 0) * 100).round()}%',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, 'other'), child: const Text('Boshqa o\'quvchi')),
          FilledButton(onPressed: () => Navigator.pop(ctx, 'yes'), child: const Text('Ha')),
        ],
      ),
    );
    if (!mounted) return;
    if (answer == 'yes') {
      setState(() => _confirm(sid, v.frame, v.face, score: v.score, byTeacher: true, trackingId: v.face.trackingId));
    } else if (answer == 'other') {
      await _assign(v);
    }
  }

  Future<void> _confirmedActions(_FaceView v) async {
    final sid = v.studentId!;
    final s = _student(sid);
    final r = _recognized[sid];
    final answer = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (r != null) SnapshotThumb(bytes: r.snapshot, size: 110, circle: true, enlargeOnTap: false),
            const SizedBox(height: 8),
            Text(s.name, style: Theme.of(ctx).textTheme.titleLarge),
            Text(r == null
                ? ''
                : r.byTeacher
                    ? "O'qituvchi tasdiqlagan"
                    : 'Avtomatik tanildi · ${((r.score ?? 0) * 100).round()}%'),
            const SizedBox(height: 8),
            ListTile(
              leading: const Icon(Icons.swap_horiz),
              title: const Text("Bu boshqa o'quvchi"),
              onTap: () => Navigator.pop(ctx, 'reassign'),
            ),
            ListTile(
              leading: const Icon(Icons.remove_circle_outline, color: AppColors.danger),
              title: const Text('Belgini olib tashlash'),
              onTap: () => Navigator.pop(ctx, 'remove'),
            ),
          ],
        ),
      ),
    );
    if (!mounted) return;
    if (answer == 'remove') {
      setState(() => _unconfirm(sid));
    } else if (answer == 'reassign') {
      setState(() => _unconfirm(sid));
      await _assign(v);
    }
  }

  /// O'qituvchi yuzni o'zi o'quvchiga biriktiradi.
  Future<void> _assign(_FaceView v) async {
    final preview = v.frame.faceSnapshotJpeg(v.face);
    final remaining = _students.where((s) => !_recognized.containsKey(s.id)).toList();
    final sid = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.7,
        maxChildSize: 0.95,
        builder: (ctx, scroll) => ListView(
          controller: scroll,
          children: [
            Center(child: SnapshotThumb(bytes: preview, size: 96, circle: true, enlargeOnTap: false)),
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: Text('Bu kim?', textAlign: TextAlign.center, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            ),
            if (remaining.isEmpty)
              const EmptyState(icon: Icons.check_circle_outline, text: "Barcha o'quvchilar belgilangan"),
            for (final s in remaining)
              ListTile(
                leading: s.facePhoto != null
                    ? SnapshotThumb(bytes: s.facePhoto!, size: 40, circle: true, enlargeOnTap: false)
                    : Avatar(s.name),
                title: Text(s.name),
                subtitle: v.studentId == s.id && v.score != null
                    ? Text('Taxminiy moslik: ${(v.score! * 100).round()}%')
                    : null,
                onTap: () => Navigator.pop(ctx, s.id),
              ),
          ],
        ),
      ),
    );
    if (sid == null || !mounted) return;
    setState(() => _confirm(sid, v.frame, v.face, byTeacher: true, trackingId: v.face.trackingId));
  }

  // ---------------------------------------------------------------- Yakunlash

  Future<void> _finish() async {
    setState(() => _paused = true);
    final repo = AppScope.read(context).repo;
    final p = widget.lesson.start.split(':');
    final lateAfter = repo.today.add(Duration(hours: int.parse(p[0]), minutes: int.parse(p[1]) + 10));
    final status = repo.now.isAfter(lateAfter) ? AttendanceStatus.late : AttendanceStatus.present;
    final presets = <String, PendingMark>{
      for (final e in _recognized.entries)
        e.key: PendingMark(
          status,
          source: AttendanceSource.face,
          snapshot: e.value.snapshot,
          score: e.value.byTeacher ? null : e.value.score,
        ),
    };
    final saved = await Navigator.of(context).push<bool>(MaterialPageRoute(
      builder: (_) => RollCallScreen(lesson: widget.lesson, presets: presets, fromCamera: true),
    ));
    if (!mounted) return;
    if (saved == true) {
      Navigator.of(context).pop();
    } else {
      setState(() => _paused = false);
    }
  }

  // ---------------------------------------------------------------- UI

  @override
  Widget build(BuildContext context) {
    final repo = AppScope.of(context).repo;
    final enrolled = _students.where((s) => s.parentConsent && s.faceEnrolled).length;
    final cls = repo.schoolClass(widget.lesson.classId);

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text('${cls.name} · kamera', style: const TextStyle(color: Colors.white)),
        actions: [
          Center(
            child: Padding(
              padding: const EdgeInsets.only(right: 16),
              child: Text('${_recognized.length}/${_students.length}',
                  style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800)),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          if (enrolled == 0)
            const _Banner(
              "Sinfda hech kimning yuz namunasi yo'q. Avval \"Sinflar\" bo'limida o'quvchilar yuzini ro'yxatga oling. "
              "Hozircha doirani bosib o'quvchini qo'lda tanlashingiz mumkin.",
            )
          else if (enrolled < _students.length)
            _Banner('Yuz namunasi bor: $enrolled/${_students.length}. Qolganlarini doirani bosib yoki yo\'qlamada belgilang.'),
          Expanded(
            child: _modelError != null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(_modelError!, style: const TextStyle(color: Colors.white), textAlign: TextAlign.center),
                    ),
                  )
                : _embedder == null
                    ? const Center(child: CircularProgressIndicator(color: Colors.white))
                    : LiveFaceCamera(
                        paused: _paused,
                        onFaces: _onFaces,
                        overlayBuilder: (context, faces, coords) => _Overlay(
                          views: _views,
                          coords: coords,
                          nameOf: (id) => _student(id).name.split(' ').first,
                          onTap: _onTapView,
                        ),
                      ),
          ),
          _RecognizedStrip(
            items: [
              for (final e in _recognized.entries) (_student(e.key), e.value.snapshot),
            ],
          ),
        ],
      ),
      bottomNavigationBar: Container(
        color: Colors.black,
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Row(
              children: [
                const _Legend(),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: _finish,
                    icon: const Icon(Icons.checklist),
                    label: const Text('Yakunlash'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Overlay extends StatelessWidget {
  const _Overlay({required this.views, required this.coords, required this.nameOf, required this.onTap});

  final List<_FaceView> views;
  final FaceCoords coords;
  final String Function(String id) nameOf;
  final void Function(_FaceView v) onTap;

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        for (final v in views) _circle(v),
      ],
    );
  }

  Widget _circle(_FaceView v) {
    final r = coords.map(v.box);
    final d = (r.width > r.height ? r.width : r.height) * 1.15;
    final center = r.center;
    final (Color color, String? label, bool dashed) = switch (v.kind) {
      _ViewKind.confirmed => (AppColors.success, v.studentId == null ? null : nameOf(v.studentId!), false),
      _ViewKind.review => (Colors.amber, v.studentId == null ? '?' : '${nameOf(v.studentId!)}?', false),
      _ViewKind.unknown => (Colors.white, '?', false),
      _ViewKind.small => (Colors.white70, 'yaqinroq', true),
      _ViewKind.turned => (Colors.white70, null, true),
    };
    final hit = d < 44 ? 44.0 : d; // kichik yuzlarni ham bosish oson bo'lsin
    final w = hit < 120 ? 120.0 : hit; // ism yozuvi sig'ishi uchun
    return Positioned(
      left: center.dx - w / 2,
      top: center.dy - hit / 2,
      width: w,
      height: hit + 26,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => onTap(v),
        child: Column(
          children: [
            SizedBox(
              width: hit,
              height: hit,
              child: Center(
                child: Container(
                  width: d,
                  height: d,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: color, width: dashed ? 1.5 : 3),
                    color: v.kind == _ViewKind.confirmed ? color.withValues(alpha: 0.12) : null,
                  ),
                ),
              ),
            ),
            if (label != null)
              Container(
                constraints: const BoxConstraints(maxWidth: 140),
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(6)),
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: color == AppColors.success ? Colors.white : Colors.black,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _RecognizedStrip extends StatelessWidget {
  const _RecognizedStrip({required this.items});

  final List<(Student, Uint8List)> items;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return const SizedBox(
        height: 64,
        child: Center(
          child: Text("Tanilgan o'quvchilar shu yerda chiqadi", style: TextStyle(color: Colors.white54)),
        ),
      );
    }
    return SizedBox(
      height: 84,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
        scrollDirection: Axis.horizontal,
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (context, i) {
          final (s, snap) = items[items.length - 1 - i]; // eng oxirgisi birinchi
          return SizedBox(
            width: 56,
            child: Column(
              children: [
                Container(
                  padding: const EdgeInsets.all(2),
                  decoration: const BoxDecoration(color: AppColors.success, shape: BoxShape.circle),
                  child: SnapshotThumb(bytes: snap, size: 44, circle: true, title: s.name),
                ),
                const SizedBox(height: 4),
                Text(s.name.split(' ').first,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Colors.white, fontSize: 11)),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(12, 0, 12, 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.warning.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(text, style: const TextStyle(color: Colors.white, fontSize: 12.5)),
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend();

  @override
  Widget build(BuildContext context) {
    Widget dot(Color c, String t) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 1),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: c, width: 2)),
              ),
              const SizedBox(width: 6),
              Text(t, style: const TextStyle(color: Colors.white70, fontSize: 11)),
            ],
          ),
        );
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        dot(AppColors.success, 'tanildi'),
        dot(Colors.amber, 'tekshiring'),
        dot(Colors.white, 'bosib tanlang'),
      ],
    );
  }
}
