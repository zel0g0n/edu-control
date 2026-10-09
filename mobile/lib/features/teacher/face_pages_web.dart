import 'package:flutter/material.dart';

import '../../data/models.dart';
import '../../widgets/common.dart';
import 'roll_call_screen.dart';

/// Brauzerda yuz tanish kutubxonalari (ML Kit, TFLite) ishlamaydi.
const bool faceRecognitionSupported = false;

Widget faceAttendancePage(Lesson lesson) => _MobileOnlyPage(
      title: 'Kamera orqali davomat',
      text: "Yuz tanish orqali davomat faqat mobil ilovada ishlaydi. "
          "Web versiyada davomatni yo'qlama orqali oling.",
      lesson: lesson,
    );

Widget faceEnrollPage(String studentId) => const _MobileOnlyPage(
      title: "Yuzni ro'yxatga olish",
      text: "O'quvchi yuzini ro'yxatga olish faqat mobil ilovada ishlaydi.",
    );

class _MobileOnlyPage extends StatelessWidget {
  const _MobileOnlyPage({required this.title, required this.text, this.lesson});

  final String title;
  final String text;
  final Lesson? lesson;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const EmptyState(icon: Icons.phone_android, text: ''),
                Text(text, textAlign: TextAlign.center, style: const TextStyle(fontSize: 16)),
                if (lesson != null) ...[
                  const SizedBox(height: 24),
                  FilledButton.icon(
                    onPressed: () => Navigator.of(context).pushReplacement(MaterialPageRoute<void>(
                      builder: (_) => RollCallScreen(lesson: lesson!),
                    )),
                    icon: const Icon(Icons.record_voice_over_outlined),
                    label: const Text("Yo'qlamaga o'tish"),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
