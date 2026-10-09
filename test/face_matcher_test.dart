import 'dart:math';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';

import 'package:edu_nazorat/face/face_config.dart';
import 'package:edu_nazorat/face/face_matcher.dart';

Float32List _unit(List<double> v) {
  final n = sqrt(v.fold<double>(0, (s, x) => s + x * x));
  return Float32List.fromList(v.map((x) => x / n).toList());
}

/// a va b orasida `sim` kosinusli vektor (ikki o'lchamli tekislikda).
Float32List _withSimilarity(double sim) {
  final angle = acos(sim);
  return _unit([cos(angle), sin(angle), 0, 0]);
}

void main() {
  final base = _unit([1, 0, 0, 0]);

  test('ishonchli moslik tasdiqlanadi', () {
    final g = FaceGallery({
      'ali': [base],
      'vali': [_unit([0, 0, 1, 0])],
    });
    final r = g.match(_withSimilarity(0.80));
    expect(r.studentId, 'ali');
    expect(r.level, MatchLevel.confident);
  });

  test("past moslik 'tekshiring' bo'ladi", () {
    final g = FaceGallery({'ali': [base]});
    final r = g.match(_withSimilarity((FaceConfig.reviewThreshold + FaceConfig.matchThreshold) / 2));
    expect(r.level, MatchLevel.review);
  });

  test("ikki nomzod juda yaqin bo'lsa avtomatik tasdiqlanmaydi", () {
    final g = FaceGallery({
      'ali': [base],
      'egizak': [_withSimilarity(0.99)],
    });
    final r = g.match(_withSimilarity(0.85));
    expect(r.level, isNot(MatchLevel.confident));
  });

  test('tasdiqlash uchun bir necha kadr kerak', () {
    final t = TrackState(1);
    const r = MatchResult(studentId: 'ali', score: 0.8, secondScore: 0.1, level: MatchLevel.confident);
    String? got;
    for (var i = 0; i < FaceConfig.votesToConfirm; i++) {
      got = t.addResult(r);
    }
    expect(got, 'ali');
    expect(t.confirmedStudentId, 'ali');
  });
}
