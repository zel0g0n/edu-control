import 'dart:typed_data';

import 'face_config.dart';

enum MatchLevel { confident, review, unknown }

class MatchResult {
  const MatchResult({required this.studentId, required this.score, required this.secondScore, required this.level});

  final String? studentId; // eng yaqin nomzod
  final double score;
  final double secondScore;
  final MatchLevel level;

  static const none = MatchResult(studentId: null, score: 0, secondScore: 0, level: MatchLevel.unknown);
}

double cosine(Float32List a, Float32List b) {
  var s = 0.0;
  final n = a.length < b.length ? a.length : b.length;
  for (var i = 0; i < n; i++) {
    s += a[i] * b[i];
  }
  return s;
}

/// Sinf o'quvchilarining yuz namunalari to'plami.
class FaceGallery {
  FaceGallery(this.templates);

  /// studentId -> bir nechta namuna (turli burchaklar).
  final Map<String, List<Float32List>> templates;

  bool get isEmpty => templates.values.every((t) => t.isEmpty);

  MatchResult match(Float32List embedding, {Set<String> exclude = const {}}) {
    String? best;
    var bestScore = -1.0, second = -1.0;
    templates.forEach((id, list) {
      if (exclude.contains(id) || list.isEmpty) return;
      var s = -1.0;
      for (final t in list) {
        final c = cosine(embedding, t);
        if (c > s) s = c;
      }
      if (s > bestScore) {
        second = bestScore;
        bestScore = s;
        best = id;
      } else if (s > second) {
        second = s;
      }
    });
    if (best == null) return MatchResult.none;
    final margin = bestScore - (second < 0 ? 0 : second);
    final MatchLevel level;
    if (bestScore >= FaceConfig.matchThreshold && margin >= FaceConfig.minMargin) {
      level = MatchLevel.confident;
    } else if (bestScore >= FaceConfig.reviewThreshold) {
      level = MatchLevel.review;
    } else {
      level = MatchLevel.unknown;
    }
    return MatchResult(studentId: best, score: bestScore, secondScore: second, level: level);
  }
}

/// Bitta kuzatilayotgan yuz (ML Kit trackingId bo'yicha) holati.
class TrackState {
  TrackState(this.trackingId);

  final int trackingId;
  final Map<String, int> _votes = {};

  /// Tasdiqlangan o'quvchi (avtomatik yoki o'qituvchi tomonidan).
  String? confirmedStudentId;
  bool confirmedByTeacher = false;

  /// Oxirgi natija (sariq/oq doira uchun).
  MatchResult last = MatchResult.none;
  double bestConfidentScore = 0;

  /// Yangi natijani qo'shadi. Tasdiqlansa o'quvchi id'sini qaytaradi.
  String? addResult(MatchResult r) {
    last = r;
    if (confirmedStudentId != null) return null;
    if (r.level != MatchLevel.confident || r.studentId == null) return null;
    final v = (_votes[r.studentId!] ?? 0) + 1;
    _votes[r.studentId!] = v;
    if (r.score > bestConfidentScore) bestConfidentScore = r.score;
    if (v >= FaceConfig.votesToConfirm) {
      confirmedStudentId = r.studentId;
      return r.studentId;
    }
    return null;
  }
}
