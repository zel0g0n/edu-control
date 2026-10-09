/// Tashqi `intl` paketisiz o'zbekcha sana va pul formatlash.
class Fmt {
  static const _months = [
    'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
    'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
  ];
  static const _monthsTitle = [
    'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
    'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
  ];
  static const weekdaysShort = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];
  static const weekdays = [
    'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba',
  ];

  static String date(DateTime d) => '${d.day}-${_months[d.month - 1]}';

  static String dateFull(DateTime d) => '${d.day}-${_months[d.month - 1]} ${d.year}';

  static String month(DateTime d) => '${_monthsTitle[d.month - 1]} ${d.year}';

  static String time(DateTime d) =>
      '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';

  static String weekday(DateTime d) => weekdays[d.weekday - 1];

  static String money(int amount) {
    final s = amount.abs().toString();
    final buf = StringBuffer();
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) buf.write(' ');
      buf.write(s[i]);
    }
    return "${amount < 0 ? '-' : ''}$buf so'm";
  }

  static String phone(String raw) {
    final d = raw.replaceAll(RegExp(r'\D'), '');
    if (d.length != 12) return raw;
    return '+${d.substring(0, 3)} ${d.substring(3, 5)} ${d.substring(5, 8)} '
        '${d.substring(8, 10)} ${d.substring(10, 12)}';
  }

  static String relative(DateTime d, {DateTime? now}) {
    final n = now ?? DateTime.now();
    final diff = n.difference(d);
    if (diff.inMinutes < 1) return 'hozir';
    if (diff.inMinutes < 60) return '${diff.inMinutes} daqiqa oldin';
    if (diff.inHours < 24 && n.day == d.day) return 'bugun ${time(d)}';
    if (diff.inDays < 2) return 'kecha ${time(d)}';
    return date(d);
  }

  static bool sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  static DateTime dayOnly(DateTime d) => DateTime(d.year, d.month, d.day);

  static String initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return '?';
    if (parts.length == 1) return parts.first[0].toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
}
