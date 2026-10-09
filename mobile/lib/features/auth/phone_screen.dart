import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/config.dart';
import '../../core/format.dart';
import '../../data/mock_data.dart';
import '../../state/app_state.dart';
import 'otp_screen.dart';

class PhoneScreen extends StatefulWidget {
  const PhoneScreen({super.key});

  @override
  State<PhoneScreen> createState() => _PhoneScreenState();
}

class _PhoneScreenState extends State<PhoneScreen> {
  final _ctrl = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  String get _digits => '998${_ctrl.text.replaceAll(RegExp(r'\D'), '')}';

  void _submit() {
    if (_digits.length != 12) {
      setState(() => _error = "Raqamni to'liq kiriting (9 ta raqam)");
      return;
    }
    final user = AppScope.read(context).repo.userByPhone(_digits);
    if (user == null) {
      setState(() => _error = "Bu raqam tizimda topilmadi. Muassasa administratoriga murojaat qiling.");
      return;
    }
    final inst = AppScope.read(context).repo.institution(user.institutionId);
    if (inst != null && !inst.active) {
      setState(() => _error = "Muassasa faoliyati to'xtatilgan. Administrator bilan bog'laning.");
      return;
    }
    setState(() => _error = null);
    Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => OtpScreen(phone: _digits),
    ));
  }

  void _fillDemo(String phone) {
    _ctrl.text = phone.substring(3);
    setState(() => _error = null);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 48, 24, 24),
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: scheme.primary,
                borderRadius: BorderRadius.circular(18),
              ),
              child: const Icon(Icons.school_rounded, color: Colors.white, size: 34),
            ),
            const SizedBox(height: 24),
            Text(AppConfig.appName,
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            Text(
              "Farzandingizning baholari, davomati va to'lovlari bir joyda.",
              style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 15),
            ),
            const SizedBox(height: 32),
            TextField(
              controller: _ctrl,
              keyboardType: TextInputType.phone,
              autofocus: false,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(9),
              ],
              onSubmitted: (_) => _submit(),
              decoration: InputDecoration(
                labelText: 'Telefon raqam',
                prefixText: '+998 ',
                hintText: '90 123 45 67',
                errorText: _error,
                errorMaxLines: 3,
              ),
            ),
            const SizedBox(height: 16),
            FilledButton(onPressed: _submit, child: const Text('SMS kod olish')),
            if (AppConfig.mockMode) ...[
              const SizedBox(height: 36),
              Text('Demo hisoblar (SMS kod: ${AppConfig.demoOtpCode})',
                  style: TextStyle(color: scheme.onSurfaceVariant, fontWeight: FontWeight.w600)),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final a in DemoAccounts.all)
                    ActionChip(
                      label: Text(a.$2),
                      tooltip: Fmt.phone(a.$1),
                      onPressed: () => _fillDemo(a.$1),
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
