import 'package:flutter/material.dart';

import 'core/config.dart';
import 'core/theme.dart';
import 'data/mock_data.dart';
import 'data/models.dart';
import 'data/repository.dart';
import 'features/auth/phone_screen.dart';
import 'features/director/director_shell.dart';
import 'features/parent/parent_shell.dart';
import 'features/superadmin/super_admin_shell.dart';
import 'features/teacher/teacher_shell.dart';
import 'state/app_state.dart';

void main() {
  final repo = AppRepository();
  seedMockData(repo);
  runApp(EduApp(state: AppState(repo)));
}

class EduApp extends StatelessWidget {
  const EduApp({super.key, required this.state});

  final AppState state;

  @override
  Widget build(BuildContext context) {
    return AppScope(
      state: state,
      child: MaterialApp(
        title: AppConfig.appName,
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light(),
        darkTheme: AppTheme.dark(),
        home: const RootGate(),
      ),
    );
  }
}

/// Kirgan foydalanuvchi roliga qarab tegishli qobiqni ko'rsatadi.
class RootGate extends StatelessWidget {
  const RootGate({super.key});

  @override
  Widget build(BuildContext context) {
    final user = AppScope.of(context).currentUser;
    if (user == null) return const PhoneScreen();
    return switch (user.role) {
      UserRole.parent => const ParentShell(),
      UserRole.teacher => const TeacherShell(),
      UserRole.director => const DirectorShell(),
      UserRole.superAdmin => const SuperAdminShell(),
    };
  }
}
