import 'package:flutter/widgets.dart';

import '../../data/models.dart';
import 'face_attendance_screen.dart';
import 'face_enroll_screen.dart';

/// Telefonda yuz tanish mavjud.
const bool faceRecognitionSupported = true;

Widget faceAttendancePage(Lesson lesson) => FaceAttendanceScreen(lesson: lesson);

Widget faceEnrollPage(String studentId) => FaceEnrollScreen(studentId: studentId);
