import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';

import '../../core/theme.dart';
import '../../face/camera_frame.dart';
import '../../face/face_config.dart';
import '../../face/face_embedder.dart';
import '../../face/face_matcher.dart';
import '../../face/live_camera.dart';
import '../../state/app_state.dart';
import '../../widgets/common.dart';

/// O'quvchi yuzini ro'yxatga olish: 3 ta namuna (to'g'ri, bir tomonga,
/// ikkinchi tomonga). Faqat ota-ona roziligi bo'lsa ochiladi.
class FaceEnrollScreen extends StatefulWidget {
  const FaceEnrollScreen({super.key, required this.studentId});

  final String studentId;

  @override
  State<FaceEnrollScreen> createState() => _FaceEnrollScreenState();
}

enum _Step { front, sideA, sideB, done }

class _FaceEnrollScreenState extends State<FaceEnrollScreen> {
  FaceEmbedder? _embedder;
  String? _modelError;
  _Step _step = _Step.front;
  final List<Float32List> _samples = [];
  Uint8List? _photo;
  int _stable = 0;
  double? _sideSign;
  String _hint = "O'quvchi yuzini ramka ichiga oling";
  bool _saving = false;

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

  String get _instruction => switch (_step) {
        _Step.front => "1/3 · To'g'ri kameraga qarasin",
        _Step.sideA => '2/3 · Boshini biroz bir tomonga bursin',
        _Step.sideB => '3/3 · Endi biroz ikkinchi tomonga',
        _Step.done => 'Tayyor',
      };

  Future<void> _onFaces(FrameData frame, List<Face> faces) async {
    final emb = _embedder;
    if (emb == null || _step == _Step.done || _saving) return;
    if (faces.isEmpty) {
      _setHint("Yuz ko'rinmayapti");
      return;
    }
    if (faces.length > 1) {
      _setHint("Kadrda faqat bitta o'quvchi bo'lsin");
      return;
    }
    final f = faces.first;
    if (f.boundingBox.width < frame.uprightWidth * 0.22) {
      _setHint('Yaqinroq keling');
      return;
    }
    final yaw = f.headEulerAngleY ?? 0;
    final ok = switch (_step) {
      _Step.front => yaw.abs() < 10,
      _Step.sideA => yaw.abs() >= 12 && yaw.abs() <= 35,
      _Step.sideB => yaw.abs() >= 12 && yaw.abs() <= 35 && _sideSign != null && yaw.sign != _sideSign,
      _Step.done => false,
    };
    if (!ok) {
      _stable = 0;
      _setHint(_instruction);
      return;
    }
    _stable++;
    if (_stable < 2) return; // ikki ketma-ket mos kadr: xira tasvirni kamaytiradi
    _stable = 0;

    _samples.add(emb.embed(frame, f));
    if (_step == _Step.front) _photo = frame.faceSnapshotJpeg(f);
    if (_step == _Step.sideA) _sideSign = yaw.sign;
    setState(() {
      _step = _Step.values[_step.index + 1];
      _hint = _instruction;
    });
    if (_step == _Step.done) await _finish();
  }

  void _setHint(String h) {
    if (_hint != h && mounted) setState(() => _hint = h);
  }

  void _restart(String reason) {
    setState(() {
      _samples.clear();
      _photo = null;
      _sideSign = null;
      _step = _Step.front;
      _hint = reason;
    });
  }

  Future<void> _finish() async {
    // 1) Sifat: namunalar bir-biriga yetarlicha o'xshash bo'lishi kerak.
    var minSim = 1.0;
    for (var i = 0; i < _samples.length; i++) {
      for (var j = i + 1; j < _samples.length; j++) {
        final c = cosine(_samples[i], _samples[j]);
        if (c < minSim) minSim = c;
      }
    }
    if (minSim < FaceConfig.reviewThreshold) {
      _restart("Namunalar sifati past (yorug'likni tekshiring). Qaytadan boshlaymiz.");
      return;
    }

    // 2) Takror: bu yuz boshqa o'quvchiga juda o'xshamasligi kerak.
    final app = AppScope.read(context);
    final repo = app.repo;
    final me = repo.student(widget.studentId);
    final others = repo.studentsOfInstitution(me.institutionId).where((s) => s.id != me.id);
    final gallery = FaceGallery(repo.faceTemplatesOf(others));
    MatchResult worst = MatchResult.none;
    for (final smp in _samples) {
      final r = gallery.match(smp);
      if (r.score > worst.score) worst = r;
    }
    setState(() => _saving = true);
    if (worst.studentId != null && worst.score >= FaceConfig.matchThreshold) {
      final other = repo.student(worst.studentId!);
      final go = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text("O'xshash yuz topildi"),
          content: Text(
            "Bu yuz ${other.name} (${repo.schoolClass(other.classId).name}) namunasiga juda o'xshaydi "
            "(${(worst.score * 100).round()}%). To'g'ri o'quvchini tanlaganingizga ishonchingiz komilmi?",
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Qaytadan')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Baribir saqlash')),
          ],
        ),
      );
      if (!mounted) return;
      if (go != true) {
        setState(() => _saving = false);
        _restart(_instruction);
        return;
      }
    }

    repo.saveFaceTemplates(me.id, List.of(_samples), _photo);
    if (!mounted) return;
    Navigator.of(context).pop(true);
    showSnack(context, "${me.name}: yuz namunasi saqlandi");
  }

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context).repo.student(widget.studentId);
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(s.name, style: const TextStyle(color: Colors.white)),
      ),
      body: _modelError != null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(_modelError!, style: const TextStyle(color: Colors.white), textAlign: TextAlign.center),
              ),
            )
          : Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          for (var i = 0; i < 3; i++)
                            Container(
                              margin: const EdgeInsets.symmetric(horizontal: 4),
                              width: 28,
                              height: 6,
                              decoration: BoxDecoration(
                                color: i < _samples.length ? AppColors.success : Colors.white24,
                                borderRadius: BorderRadius.circular(3),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Text(_instruction,
                          style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      Text(_hint, style: const TextStyle(color: Colors.white70)),
                    ],
                  ),
                ),
                Expanded(
                  child: _embedder == null
                      ? const Center(child: CircularProgressIndicator(color: Colors.white))
                      : LiveFaceCamera(
                          minFaceSize: 0.15,
                          paused: _saving,
                          onFaces: _onFaces,
                          overlayBuilder: (context, faces, coords) => IgnorePointer(
                            child: CustomPaint(painter: _EnrollPainter(faces, coords)),
                          ),
                        ),
                ),
                const Padding(
                  padding: EdgeInsets.fromLTRB(16, 12, 16, 20),
                  child: Text(
                    "Rasm saqlanmaydi: faqat raqamli yuz namunasi va o'qituvchi ro'yxati uchun kichik yuz kesimi.",
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.white54, fontSize: 12),
                  ),
                ),
              ],
            ),
    );
  }
}

class _EnrollPainter extends CustomPainter {
  _EnrollPainter(this.faces, this.coords);

  final List<Face> faces;
  final FaceCoords coords;

  @override
  void paint(Canvas canvas, Size size) {
    final guide = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..color = Colors.white38;
    canvas.drawOval(
      Rect.fromCenter(center: size.center(Offset.zero), width: size.width * 0.6, height: size.width * 0.78),
      guide,
    );
    final p = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..color = faces.length == 1 ? AppColors.success : AppColors.warning;
    for (final f in faces) {
      canvas.drawRRect(RRect.fromRectAndRadius(coords.map(f.boundingBox), const Radius.circular(16)), p);
    }
  }

  @override
  bool shouldRepaint(covariant _EnrollPainter old) => old.faces != faces || old.coords.canvas != coords.canvas;
}
