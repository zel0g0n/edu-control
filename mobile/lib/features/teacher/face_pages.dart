// Yuz tanish ekranlariga kirish nuqtasi.
//
// Telefonda (dart:ffi bor) haqiqiy kamera + ML Kit + TFLite ekranlari,
// brauzerda (web) esa "faqat mobil ilovada" sahifasi ulanadi. Shu tufayli
// web build'ga ML Kit va TFLite kodi umuman kirmaydi.
export 'face_pages_web.dart' if (dart.library.ffi) 'face_pages_native.dart';
