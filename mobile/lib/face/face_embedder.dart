import 'dart:math' as math;
import 'dart:typed_data';

import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';
import 'package:tflite_flutter/tflite_flutter.dart';

import 'camera_frame.dart';
import 'face_config.dart';

/// MobileFaceNet: yuz kesimidan 192 o'lchamli raqamli namuna (embedding).
/// Model chiqishi allaqachon L2-normallashtirilgan, shuning uchun
/// ikki namuna orasidagi kosinus o'xshashlik = skalyar ko'paytma.
///
/// Hammasi telefonning o'zida ishlaydi, rasm hech qayerga yuborilmaydi.
class FaceEmbedder {
  FaceEmbedder._(this._interpreter);

  final Interpreter _interpreter;

  static FaceEmbedder? _instance;
  static Future<FaceEmbedder>? _loading;

  static Future<FaceEmbedder> instance() async {
    final ready = _instance;
    if (ready != null) return ready;
    final pending = _loading ??= _create();
    try {
      return await pending;
    } catch (_) {
      _loading = null; // keyingi urinishda qayta yuklansin
      rethrow;
    }
  }

  static Future<FaceEmbedder> _create() async {
    final options = InterpreterOptions()..threads = 2;
    final interpreter = await Interpreter.fromAsset(FaceConfig.modelAsset, options: options);
    return _instance = FaceEmbedder._(interpreter);
  }

  Float32List embed(FrameData frame, Face face) {
    final input = frame.modelInput(face);
    final output = Float32List(FaceConfig.embeddingSize);
    _interpreter.run(input.buffer.asUint8List(), output.buffer.asUint8List());
    return _normalize(output);
  }

  static Float32List _normalize(Float32List v) {
    var sum = 0.0;
    for (final x in v) {
      sum += x * x;
    }
    if (sum <= 0) return v;
    final inv = 1 / math.sqrt(sum);
    for (var i = 0; i < v.length; i++) {
      v[i] = v[i] * inv;
    }
    return v;
  }
}
