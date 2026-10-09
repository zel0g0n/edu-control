import 'package:flutter/widgets.dart';

import '../data/models.dart';
import '../data/repository.dart';

/// Ilova holati: ma'lumotlar ombori + kirgan foydalanuvchi.
/// Tashqi state-management paketisiz, InheritedNotifier orqali uzatiladi.
class AppState extends ChangeNotifier {
  AppState(this.repo) {
    repo.addListener(notifyListeners);
  }

  final AppRepository repo;
  AppUser? currentUser;

  /// Ota-ona uchun tanlangan farzand.
  String? selectedChildId;

  void signIn(AppUser user) {
    currentUser = user;
    selectedChildId = user.childIds.isNotEmpty ? user.childIds.first : null;
    notifyListeners();
  }

  void signOut() {
    currentUser = null;
    selectedChildId = null;
    notifyListeners();
  }

  void selectChild(String id) {
    selectedChildId = id;
    notifyListeners();
  }

  @override
  void dispose() {
    repo.removeListener(notifyListeners);
    super.dispose();
  }
}

class AppScope extends InheritedNotifier<AppState> {
  const AppScope({super.key, required AppState state, required super.child})
      : super(notifier: state);

  static AppState of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AppScope>();
    assert(scope != null, 'AppScope topilmadi');
    return scope!.notifier!;
  }

  /// Qayta chizishga obuna bo'lmasdan (masalan tugma bosilganda) olish.
  static AppState read(BuildContext context) {
    final scope = context.getInheritedWidgetOfExactType<AppScope>();
    return scope!.notifier!;
  }
}
