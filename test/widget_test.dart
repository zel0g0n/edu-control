import 'package:flutter_test/flutter_test.dart';

import 'package:edu_nazorat/data/mock_data.dart';
import 'package:edu_nazorat/data/models.dart';
import 'package:edu_nazorat/data/repository.dart';
import 'package:edu_nazorat/main.dart';
import 'package:edu_nazorat/state/app_state.dart';

AppRepository _repo() {
  final repo = AppRepository()..clock = () => DateTime(2026, 9, 30, 10, 0); // chorshanba
  seedMockData(repo);
  return repo;
}

void main() {
  test('demo raqamlar tizimda bor', () {
    final repo = _repo();
    for (final a in DemoAccounts.all) {
      expect(repo.userByPhone(a.$1), isNotNull, reason: a.$2);
    }
  });

  test('davomat belgilansa ota-onaga xabar ketadi', () {
    final repo = _repo();
    final before = repo.notificationsOf('u_parent').length;
    repo.markAttendance(
      studentId: 's_b0',
      status: AttendanceStatus.present,
      source: AttendanceSource.face,
      markedBy: 't_math',
    );
    final list = repo.notificationsOf('u_parent');
    expect(list.length, before + 1);
    expect(list.first.body, contains('yuz tanish'));
  });

  test("to'lov qarzdorlikni kamaytiradi", () {
    final repo = _repo();
    final debt = repo.debtOfStudent('s_b0');
    expect(debt, greaterThan(0));
    final inv = repo.invoicesOfStudent('s_b0').firstWhere((i) => !i.isPaid);
    repo.addPayment(invoiceId: inv.id, amount: inv.remaining, method: 'Naqd', recordedBy: 'u_dir');
    expect(repo.debtOfStudent('s_b0'), lessThan(debt));
  });

  testWidgets('kirish ekrani ochiladi', (tester) async {
    await tester.pumpWidget(EduApp(state: AppState(_repo())));
    expect(find.text('SMS kod olish'), findsOneWidget);
  });
}
