import 'package:flutter/material.dart';

import '../../state/app_state.dart';
import '../../widgets/common.dart';
import '../student/student_views.dart';

class ParentShell extends StatefulWidget {
  const ParentShell({super.key});

  @override
  State<ParentShell> createState() => _ParentShellState();
}

class _ParentShellState extends State<ParentShell> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final user = app.currentUser!;
    final childId = app.selectedChildId;
    final unread = app.repo.unreadCount(user.id);

    final nav = NavigationBar(
      selectedIndex: _tab,
      onDestinationSelected: (i) => setState(() => _tab = i),
      destinations: [
        const NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Bosh'),
        const NavigationDestination(icon: Icon(Icons.star_outline), selectedIcon: Icon(Icons.star), label: 'Baholar'),
        const NavigationDestination(
            icon: Icon(Icons.calendar_month_outlined), selectedIcon: Icon(Icons.calendar_month), label: 'Jadval'),
        const NavigationDestination(
            icon: Icon(Icons.account_balance_wallet_outlined),
            selectedIcon: Icon(Icons.account_balance_wallet),
            label: "To'lov"),
        NavigationDestination(
            icon: badgeIcon(Icons.notifications_outlined, unread),
            selectedIcon: badgeIcon(Icons.notifications, unread),
            label: 'Xabarlar'),
      ],
    );

    if (_tab == 4) {
      return Scaffold(body: const NotificationsView(), bottomNavigationBar: nav);
    }

    if (childId == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Farzandlarim'), actions: const [AccountButton()]),
        body: const EmptyState(
          icon: Icons.child_care,
          text: "Sizga hali farzand biriktirilmagan. Muassasa administratoriga murojaat qiling.",
        ),
      );
    }

    final child = app.repo.student(childId);
    final cls = app.repo.schoolClass(child.classId);
    final body = switch (_tab) {
      0 => StudentOverview(key: ValueKey('o$childId'), studentId: childId, onOpenTab: (i) => setState(() => _tab = i)),
      1 => StudentGradesView(key: ValueKey('g$childId'), studentId: childId),
      2 => ClassScheduleView(key: ValueKey('s$childId'), classId: child.classId),
      _ => StudentPaymentsView(key: ValueKey('p$childId'), studentId: childId),
    };

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 8,
        title: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: user.childIds.length > 1 ? () => _pickChild(context) : null,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Avatar(child.name, radius: 18),
                const SizedBox(width: 10),
                Flexible(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(child.name, overflow: TextOverflow.ellipsis),
                      Text('${cls.name} · ${app.repo.institution(child.institutionId)?.name ?? ''}',
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w400,
                              color: Theme.of(context).colorScheme.onSurfaceVariant)),
                    ],
                  ),
                ),
                if (user.childIds.length > 1) const Icon(Icons.expand_more),
              ],
            ),
          ),
        ),
        actions: const [AccountButton()],
      ),
      body: body,
      bottomNavigationBar: nav,
    );
  }

  void _pickChild(BuildContext context) {
    final app = AppScope.read(context);
    final user = app.currentUser!;
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final id in user.childIds)
              Builder(builder: (_) {
                final s = app.repo.student(id);
                return ListTile(
                  leading: Avatar(s.name),
                  title: Text(s.name),
                  subtitle: Text(app.repo.schoolClass(s.classId).name),
                  trailing: app.selectedChildId == id ? const Icon(Icons.check) : null,
                  onTap: () {
                    app.selectChild(id);
                    Navigator.of(ctx).pop();
                  },
                );
              }),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}
