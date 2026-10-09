import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/config.dart';
import '../../core/format.dart';
import '../../state/app_state.dart';

class OtpScreen extends StatefulWidget {
  const OtpScreen({super.key, required this.phone});

  final String phone;

  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> {
  final _ctrl = TextEditingController();
  String? _error;
  int _secondsLeft = 60;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _startTimer(initial: true);
  }

  void _startTimer({bool initial = false}) {
    _timer?.cancel();
    // initState ichida setState chaqirib bo'lmaydi.
    if (initial) {
      _secondsLeft = 60;
    } else {
      setState(() => _secondsLeft = 60);
    }
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return;
      if (_secondsLeft <= 1) {
        t.cancel();
        setState(() => _secondsLeft = 0);
      } else {
        setState(() => _secondsLeft--);
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  void _verify() {
    // Mock: haqiqiy SMS yuborilmaydi. Backend qo'shilganda bu yerda
    // server kodni tekshiradi va token qaytaradi.
    if (_ctrl.text != AppConfig.demoOtpCode) {
      setState(() => _error = "Kod noto'g'ri");
      return;
    }
    final app = AppScope.read(context);
    final user = app.repo.userByPhone(widget.phone);
    if (user == null) return;
    Navigator.of(context).popUntil((r) => r.isFirst);
    app.signIn(user);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
          children: [
            Text('SMS kodni kiriting',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            Text('${Fmt.phone(widget.phone)} raqamiga 4 xonali kod yuborildi.',
                style: TextStyle(color: scheme.onSurfaceVariant)),
            const SizedBox(height: 28),
            TextField(
              controller: _ctrl,
              autofocus: true,
              keyboardType: TextInputType.number,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 28, letterSpacing: 16, fontWeight: FontWeight.w700),
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(4),
              ],
              onChanged: (v) {
                if (_error != null) setState(() => _error = null);
                if (v.length == 4) _verify();
              },
              decoration: InputDecoration(hintText: '••••', errorText: _error),
            ),
            const SizedBox(height: 16),
            FilledButton(onPressed: _verify, child: const Text('Kirish')),
            const SizedBox(height: 12),
            Center(
              child: _secondsLeft > 0
                  ? Text('Qayta yuborish: $_secondsLeft s',
                      style: TextStyle(color: scheme.onSurfaceVariant))
                  : TextButton(onPressed: _startTimer, child: const Text('Kodni qayta yuborish')),
            ),
            if (AppConfig.mockMode)
              Padding(
                padding: const EdgeInsets.only(top: 24),
                child: Text('Demo rejim: kod ${AppConfig.demoOtpCode}',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12)),
              ),
          ],
        ),
      ),
    );
  }
}
