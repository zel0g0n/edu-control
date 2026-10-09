import 'package:flutter/material.dart';

import '../core/config.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../data/models.dart';
import '../state/app_state.dart';
import 'snapshot.dart';

class Avatar extends StatelessWidget {
  const Avatar(this.name, {super.key, this.radius = 20, this.color});

  final String name;
  final double radius;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final c = color ?? scheme.primary;
    return CircleAvatar(
      radius: radius,
      backgroundColor: c.withValues(alpha: 0.14),
      child: Text(
        Fmt.initials(name),
        style: TextStyle(color: c, fontWeight: FontWeight.w700, fontSize: radius * 0.7),
      ),
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key, this.trailing});

  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 20, 4, 8),
      child: Row(
        children: [
          Expanded(
            child: Text(text,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

class StatCard extends StatelessWidget {
  const StatCard({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    this.color,
    this.caption,
    this.onTap,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color? color;
  final String? caption;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final c = color ?? scheme.primary;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: c.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, color: c, size: 20),
              ),
              const SizedBox(height: 12),
              Text(value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 2),
              Text(label, style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13)),
              if (caption != null) ...[
                const SizedBox(height: 4),
                Text(caption!, style: TextStyle(color: c, fontSize: 12, fontWeight: FontWeight.w600)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Ikki ustunli karta panjarasi (GridView'siz, balandlik kontentga moslashadi).
class TwoColumn extends StatelessWidget {
  const TwoColumn({super.key, required this.children, this.gap = 12});

  final List<Widget> children;
  final double gap;

  @override
  Widget build(BuildContext context) {
    final rows = <Widget>[];
    for (var i = 0; i < children.length; i += 2) {
      rows.add(IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(child: children[i]),
            SizedBox(width: gap),
            Expanded(child: i + 1 < children.length ? children[i + 1] : const SizedBox()),
          ],
        ),
      ));
      if (i + 2 < children.length) rows.add(SizedBox(height: gap));
    }
    return Column(children: rows);
  }
}

class GradeBadge extends StatelessWidget {
  const GradeBadge(this.value, {super.key, this.size = 36});

  final int value;
  final double size;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.grade(value);
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(size * 0.3),
      ),
      child: Text('$value',
          style: TextStyle(color: c, fontWeight: FontWeight.w800, fontSize: size * 0.45)),
    );
  }
}

Color attendanceColor(AttendanceStatus s) => switch (s) {
      AttendanceStatus.present => AppColors.success,
      AttendanceStatus.late => AppColors.warning,
      AttendanceStatus.absent => AppColors.danger,
      AttendanceStatus.excused => AppColors.muted,
    };

class StatusPill extends StatelessWidget {
  const StatusPill(this.text, {super.key, required this.color, this.icon});

  final String text;
  final Color color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 14, color: color),
            const SizedBox(width: 4),
          ],
          Text(text, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme.onSurfaceVariant;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 24),
      child: Column(
        children: [
          Icon(icon, size: 44, color: c.withValues(alpha: 0.5)),
          const SizedBox(height: 12),
          Text(text, textAlign: TextAlign.center, style: TextStyle(color: c)),
        ],
      ),
    );
  }
}

/// AppBar'dagi profil tugmasi: kim kirgan, muassasa, chiqish.
class AccountButton extends StatelessWidget {
  const AccountButton({super.key});

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final user = app.currentUser;
    if (user == null) return const SizedBox();
    return IconButton(
      tooltip: 'Profil',
      icon: Avatar(user.name, radius: 16),
      onPressed: () => showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        builder: (ctx) {
          final inst = app.repo.institution(user.institutionId);
          return SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Avatar(user.name, radius: 32),
                  const SizedBox(height: 12),
                  Text(user.name, style: Theme.of(ctx).textTheme.titleLarge),
                  const SizedBox(height: 4),
                  Text('${user.role.label} · ${Fmt.phone(user.phone)}'),
                  if (inst != null) ...[
                    const SizedBox(height: 4),
                    Text(inst.name, style: TextStyle(color: Theme.of(ctx).colorScheme.onSurfaceVariant)),
                  ],
                  if (AppConfig.mockMode) ...[
                    const SizedBox(height: 16),
                    const StatusPill('Demo rejim: ma\'lumotlar sinov uchun',
                        color: AppColors.warning, icon: Icons.science_outlined),
                  ],
                  const SizedBox(height: 20),
                  OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                    onPressed: () {
                      Navigator.of(ctx).pop();
                      Navigator.of(context).popUntil((r) => r.isFirst);
                      app.signOut();
                    },
                    icon: const Icon(Icons.logout),
                    label: const Text('Chiqish'),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

IconData notificationIcon(NotificationType t) => switch (t) {
      NotificationType.attendance => Icons.how_to_reg_outlined,
      NotificationType.grade => Icons.star_outline,
      NotificationType.homework => Icons.menu_book_outlined,
      NotificationType.payment => Icons.account_balance_wallet_outlined,
      NotificationType.announcement => Icons.campaign_outlined,
    };

/// Bildirishnomalar ro'yxati (ota-ona va boshqa rollar uchun umumiy).
class NotificationsView extends StatelessWidget {
  const NotificationsView({super.key});

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final user = app.currentUser!;
    final list = app.repo.notificationsOf(user.id);
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Xabarlar'),
        actions: [
          if (app.repo.unreadCount(user.id) > 0)
            TextButton(
              onPressed: () => app.repo.markAllRead(user.id),
              child: const Text("Hammasi o'qildi"),
            ),
          const AccountButton(),
        ],
      ),
      body: list.isEmpty
          ? const EmptyState(icon: Icons.notifications_none, text: "Hozircha xabar yo'q")
          : ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: list.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, i) {
                final n = list[i];
                return Card(
                  color: n.read ? null : scheme.primaryContainer.withValues(alpha: 0.35),
                  child: ListTile(
                    leading: n.image != null
                        ? SnapshotThumb(bytes: n.image!, size: 44, circle: true, title: n.title)
                        : Icon(notificationIcon(n.type), color: scheme.primary),
                    title: Text(n.title, style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text(n.body),
                    trailing: Text(Fmt.relative(n.time, now: app.repo.now),
                        style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant)),
                    onTap: () => app.repo.markRead(n.id),
                  ),
                );
              },
            ),
    );
  }
}

/// Belgi bilan navigatsiya ikonkasini (o'qilmagan soni) ko'rsatadi.
Widget badgeIcon(IconData icon, int count) {
  if (count == 0) return Icon(icon);
  return Badge(label: Text('$count'), child: Icon(icon));
}

void showSnack(BuildContext context, String text) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(text), behavior: SnackBarBehavior.floating));
}
