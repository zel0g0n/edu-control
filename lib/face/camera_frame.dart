import 'dart:io' show Platform;
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' show Rect, Size;

import 'package:camera/camera.dart';
import 'package:flutter/services.dart' show DeviceOrientation;
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';
import 'package:image/image.dart' as img;

import 'face_config.dart';

/// Bitta kamera kadri: ML Kit uchun InputImage va yuz kesish uchun
/// piksel o'qish. Kadr faqat xotirada turadi va hech qayerga yozilmaydi.
///
/// Koordinatalar: ML Kit yuz ramkalarini "tik" (upright) kadr
/// koordinatalarida qaytaradi. Android'da xom kadr sensor bo'yicha
/// burilgan bo'ladi, shuning uchun piksel o'qishda burilish hisobga olinadi.
/// iOS'da kamera plagini kadrni allaqachon tik holda beradi.
class FrameData {
  FrameData._({
    required this.bytes,
    required this.rawWidth,
    required this.rawHeight,
    required this.bytesPerRow,
    required this.isNv21,
    required this.pixelRotation,
    required this.inputImage,
    required this.lensDirection,
  });

  final Uint8List bytes;
  final int rawWidth;
  final int rawHeight;
  final int bytesPerRow;
  final bool isNv21; // aks holda BGRA8888 (iOS)
  final int pixelRotation; // 0/90/180/270: xom kadrni tik qilish uchun burilish
  final InputImage inputImage;
  final CameraLensDirection lensDirection;

  int get uprightWidth => pixelRotation == 90 || pixelRotation == 270 ? rawHeight : rawWidth;
  int get uprightHeight => pixelRotation == 90 || pixelRotation == 270 ? rawWidth : rawHeight;
  Size get uprightSize => Size(uprightWidth.toDouble(), uprightHeight.toDouble());

  static const _orientations = {
    DeviceOrientation.portraitUp: 0,
    DeviceOrientation.landscapeLeft: 90,
    DeviceOrientation.portraitDown: 180,
    DeviceOrientation.landscapeRight: 270,
  };

  /// Kamera kadridan FrameData yasaydi (google_ml_kit namunasidagi usul).
  static FrameData? fromCameraImage(
    CameraImage image,
    CameraDescription camera,
    DeviceOrientation deviceOrientation,
  ) {
    final sensor = camera.sensorOrientation;
    InputImageRotation? rotation;
    var pixelRotation = 0;
    if (Platform.isIOS) {
      rotation = InputImageRotationValue.fromRawValue(sensor);
      pixelRotation = 0;
    } else if (Platform.isAndroid) {
      var comp = _orientations[deviceOrientation];
      if (comp == null) return null;
      if (camera.lensDirection == CameraLensDirection.front) {
        comp = (sensor + comp) % 360;
      } else {
        comp = (sensor - comp + 360) % 360;
      }
      rotation = InputImageRotationValue.fromRawValue(comp);
      pixelRotation = comp;
    }
    if (rotation == null) return null;

    final format = InputImageFormatValue.fromRawValue(image.format.raw as int);
    if (format == null) return null;
    if (Platform.isAndroid && format != InputImageFormat.nv21) return null;
    if (Platform.isIOS && format != InputImageFormat.bgra8888) return null;
    if (image.planes.length != 1) return null;
    final plane = image.planes.first;

    final input = InputImage.fromBytes(
      bytes: plane.bytes,
      metadata: InputImageMetadata(
        size: Size(image.width.toDouble(), image.height.toDouble()),
        rotation: rotation,
        format: format,
        bytesPerRow: plane.bytesPerRow,
      ),
    );
    return FrameData._(
      bytes: plane.bytes,
      rawWidth: image.width,
      rawHeight: image.height,
      bytesPerRow: plane.bytesPerRow,
      isNv21: format == InputImageFormat.nv21,
      pixelRotation: pixelRotation,
      inputImage: input,
      lensDirection: camera.lensDirection,
    );
  }

  // ------------------------------------------------------------ Piksel o'qish

  /// Tik koordinatadagi (u, v) nuqtaning RGB qiymati `out`ga yoziladi.
  void _rgbAt(int u, int v, List<int> out) {
    final uw = uprightWidth, uh = uprightHeight;
    if (u < 0) u = 0;
    if (v < 0) v = 0;
    if (u >= uw) u = uw - 1;
    if (v >= uh) v = uh - 1;
    int x, y;
    switch (pixelRotation) {
      case 90:
        x = v;
        y = rawHeight - 1 - u;
      case 180:
        x = rawWidth - 1 - u;
        y = rawHeight - 1 - v;
      case 270:
        x = rawWidth - 1 - v;
        y = u;
      default:
        x = u;
        y = v;
    }
    if (isNv21) {
      final yy = bytes[y * bytesPerRow + x];
      final uvIndex = rawHeight * bytesPerRow + (y >> 1) * bytesPerRow + (x & ~1);
      if (uvIndex + 1 >= bytes.length) {
        out[0] = yy;
        out[1] = yy;
        out[2] = yy;
        return;
      }
      final vv = bytes[uvIndex] - 128;
      final uu = bytes[uvIndex + 1] - 128;
      out[0] = _clamp(yy + 1.402 * vv);
      out[1] = _clamp(yy - 0.344136 * uu - 0.714136 * vv);
      out[2] = _clamp(yy + 1.772 * uu);
    } else {
      final i = y * bytesPerRow + x * 4; // BGRA
      out[0] = bytes[i + 2];
      out[1] = bytes[i + 1];
      out[2] = bytes[i];
    }
  }

  static int _clamp(double v) => v < 0 ? 0 : (v > 255 ? 255 : v.round());

  /// Yuz atrofidagi kvadratni `size`×`size` o'lchamga keltirib, har bir
  /// piksel uchun `emit(px, py, r, g, b)` chaqiradi. Boshning qiyshayishi
  /// (roll) to'g'rilanadi, shunda ko'zlar gorizontal bo'ladi.
  void sampleFace(
    Rect box,
    double rollDeg,
    int size,
    double margin,
    void Function(int px, int py, int r, int g, int b) emit,
  ) {
    final side = math.max(box.width, box.height) * (1 + margin);
    final cx = box.center.dx, cy = box.center.dy;
    // ML Kit: musbat Z burchak = yuz soat miliga teskari qiyshaygan.
    // y pastga qaragan koordinatada buni to'g'rilash uchun teskari ishora.
    final a = -rollDeg * math.pi / 180;
    final cosA = math.cos(a), sinA = math.sin(a);
    final step = side / size;
    final c00 = [0, 0, 0], c10 = [0, 0, 0], c01 = [0, 0, 0], c11 = [0, 0, 0];
    for (var py = 0; py < size; py++) {
      for (var px = 0; px < size; px++) {
        // Chiqish pikselining markazga nisbatan joyi, keyin roll bo'yicha burish.
        final dx = (px + 0.5) * step - side / 2;
        final dy = (py + 0.5) * step - side / 2;
        final sx = cx + dx * cosA - dy * sinA;
        final sy = cy + dx * sinA + dy * cosA;
        // Ikki chiziqli (bilinear) interpolyatsiya.
        final x0 = sx.floor(), y0 = sy.floor();
        final fx = sx - x0, fy = sy - y0;
        _rgbAt(x0, y0, c00);
        _rgbAt(x0 + 1, y0, c10);
        _rgbAt(x0, y0 + 1, c01);
        _rgbAt(x0 + 1, y0 + 1, c11);
        int mix(int ch) {
          final top = c00[ch] + (c10[ch] - c00[ch]) * fx;
          final bottom = c01[ch] + (c11[ch] - c01[ch]) * fx;
          return (top + (bottom - top) * fy).round();
        }

        emit(px, py, mix(0), mix(1), mix(2));
      }
    }
  }

  /// Model kirishi: [1,112,112,3] float32, (x-128)/128.
  Float32List modelInput(Face face) {
    const s = FaceConfig.inputSize;
    final data = Float32List(s * s * 3);
    sampleFace(face.boundingBox, face.headEulerAngleZ ?? 0, s, FaceConfig.modelCropMargin,
        (px, py, r, g, b) {
      final i = (py * s + px) * 3;
      data[i] = (r - 128) / 128;
      data[i + 1] = (g - 128) / 128;
      data[i + 2] = (b - 128) / 128;
    });
    return data;
  }

  /// Ota-onaga yuboriladigan kesim: FAQAT shu yuz (kichik atrof bilan), JPEG.
  Uint8List faceSnapshotJpeg(Face face) {
    const s = FaceConfig.snapshotSize;
    final out = img.Image(width: s, height: s);
    sampleFace(face.boundingBox, face.headEulerAngleZ ?? 0, s, FaceConfig.snapshotMargin,
        (px, py, r, g, b) => out.setPixelRgb(px, py, r, g, b));
    return img.encodeJpg(out, quality: FaceConfig.snapshotJpegQuality);
  }
}
