#!/usr/bin/env bash
# EduNazorat: birinchi sozlash. Windows'da Git Bash, macOS/Linux'da terminal orqali:
#   cd edu_nazorat
#   bash setup.sh
# Keyin telefonni USB orqali ulang va:  flutter run
set -e

echo "== 1/5 Flutter tekshirilmoqda"
if ! command -v flutter >/dev/null 2>&1; then
  echo "Flutter topilmadi. O'rnating: https://docs.flutter.dev/get-started/install"
  exit 1
fi
flutter --version

echo "== 2/5 android/, ios/ va web/ papkalari yaratilmoqda (lib/ va assets/ ga tegilmaydi)"
flutter create --project-name edu_nazorat --org uz.edunazorat --platforms android,ios,web .

echo "== 3/5 Android: ovoz yozish ruxsati olib tashlanmoqda (ilova ovoz yozmaydi)"
MANIFEST=android/app/src/main/AndroidManifest.xml
if [ -f "$MANIFEST" ] && ! grep -q 'RECORD_AUDIO' "$MANIFEST"; then
  if ! grep -q 'xmlns:tools=' "$MANIFEST"; then
    sed -i.bak 's#<manifest xmlns:android="http://schemas.android.com/apk/res/android"#<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools"#' "$MANIFEST"
  fi
  sed -i.bak 's#^\(\s*\)<application#\1<uses-permission android:name="android.permission.RECORD_AUDIO" tools:node="remove"/>\n\1<application#' "$MANIFEST"
  rm -f "$MANIFEST.bak"
  echo "   AndroidManifest.xml yangilandi"
else
  echo "   (o'tkazib yuborildi)"
fi

echo "== 4/5 iOS: kamera ruxsati matni"
PLIST=ios/Runner/Info.plist
if [ -f "$PLIST" ] && ! grep -q 'NSCameraUsageDescription' "$PLIST"; then
  sed -i.bak "s#<dict>#<dict>\n\t<key>NSCameraUsageDescription</key>\n\t<string>Davomat uchun o'quvchilar yuzini tanish</string>#" "$PLIST"
  rm -f "$PLIST.bak"
  echo "   Info.plist yangilandi (iOS uchun Podfile'da: platform :ios, '15.5')"
fi

echo "== 5/5 Paketlar yuklanmoqda va testlar"
flutter pub get
flutter test || echo "!! Test xato berdi: chiqishni yuboring"

echo
echo "Tayyor. Telefonni ulang (USB debugging yoqilgan) va:  flutter run"
echo "APK yasash:  flutter build apk --release   ->  build/app/outputs/flutter-apk/app-release.apk"
