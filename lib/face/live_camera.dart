import 'dart:async';
import 'dart:io' show Platform;

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';

import 'camera_frame.dart';
import 'face_config.dart';

/// Tik kadr koordinatalarini ekrandagi preview koordinatalariga o'giradi.
class FaceCoords {
  const FaceCoords({required this.imageSize, required this.canvas, required this.mirror});

  final Size imageSize;
  final Size canvas;
  final bool mirror;

  Rect map(Rect r) {
    final sx = canvas.width / imageSize.width;
    final sy = canvas.height / imageSize.height;
    var left = r.left * sx, right = r.right * sx;
    if (mirror) {
      final l = canvas.width - right;
      right = canvas.width - left;
      left = l;
    }
    return Rect.fromLTRB(left, r.top * sy, right, r.bottom * sy);
  }
}

typedef FacesCallback = Future<void> Function(FrameData frame, List<Face> faces);
typedef FaceOverlayBuilder = Widget Function(BuildContext context, List<Face> faces, FaceCoords coords);

/// Jonli kamera + ML Kit yuz aniqlash. Hech narsa yozib olinmaydi:
/// kadrlar faqat xotirada qayta ishlanadi va darhol tashlab yuboriladi.
///
/// Imkoniyatlar: ikki barmoq bilan zoom, zoom tugmalari, bosib fokuslash,
/// old/orqa kamera, chiroq.
class LiveFaceCamera extends StatefulWidget {
  const LiveFaceCamera({
    super.key,
    required this.onFaces,
    required this.overlayBuilder,
    this.initialLens = CameraLensDirection.back,
    this.minFaceSize = 0.05,
    this.paused = false,
  });

  final FacesCallback onFaces;
  final FaceOverlayBuilder overlayBuilder;
  final CameraLensDirection initialLens;

  /// Kadr eniga nisbatan eng kichik yuz (sinf uchun kichik qiymat).
  final double minFaceSize;

  /// true bo'lsa kadrlar qayta ishlanmaydi (masalan dialog ochiq).
  final bool paused;

  @override
  State<LiveFaceCamera> createState() => _LiveFaceCameraState();
}

class _LiveFaceCameraState extends State<LiveFaceCamera> with WidgetsBindingObserver {
  List<CameraDescription> _cameras = [];
  CameraController? _controller;
  CameraDescription? _camera;
  late FaceDetector _detector;
  String? _error;
  bool _busy = false;
  DateTime _lastFrame = DateTime.fromMillisecondsSinceEpoch(0);

  List<Face> _faces = const [];
  Size? _imageSize;

  double _minZoom = 1, _maxZoom = 1, _zoom = 1, _baseZoom = 1;
  bool _torch = false;
  Offset? _focusPoint;
  Timer? _focusTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _detector = FaceDetector(
      options: FaceDetectorOptions(
        performanceMode: FaceDetectorMode.accurate,
        enableTracking: true,
        minFaceSize: widget.minFaceSize,
      ),
    );
    _start(widget.initialLens);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _focusTimer?.cancel();
    _stopController(rebuild: false);
    _detector.close();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final c = _controller;
    if (state == AppLifecycleState.inactive || state == AppLifecycleState.paused) {
      if (c != null) _stopController();
    } else if (state == AppLifecycleState.resumed) {
      if (_controller == null && _camera != null) _start(_camera!.lensDirection);
    }
  }

  Future<void> _start(CameraLensDirection lens) async {
    try {
      if (_cameras.isEmpty) _cameras = await availableCameras();
      if (_cameras.isEmpty) {
        setState(() => _error = 'Qurilmada kamera topilmadi');
        return;
      }
      final cam = _cameras.firstWhere((c) => c.lensDirection == lens, orElse: () => _cameras.first);
      final controller = CameraController(
        cam,
        // max emas: ba'zi telefonlarda oqim ishlamaydi (ML Kit tavsiyasi).
        ResolutionPreset.high,
        enableAudio: false,
        imageFormatGroup: Platform.isIOS ? ImageFormatGroup.bgra8888 : ImageFormatGroup.nv21,
      );
      await controller.initialize();
      if (!mounted) {
        await controller.dispose();
        return;
      }
      _minZoom = await controller.getMinZoomLevel();
      _maxZoom = await controller.getMaxZoomLevel();
      _zoom = _minZoom;
      _torch = false;
      await controller.startImageStream(_onImage);
      if (!mounted) return;
      setState(() {
        _controller = controller;
        _camera = cam;
        _error = null;
        _faces = const [];
      });
    } on CameraException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.code == 'CameraAccessDenied' || e.code == 'CameraAccessDeniedWithoutPrompt'
          ? "Kameraga ruxsat berilmagan. Telefon sozlamalaridan ruxsat bering."
          : 'Kamerani ochib bo\'lmadi: ${e.description ?? e.code}');
    }
  }

  Future<void> _stopController({bool rebuild = true}) async {
    final c = _controller;
    if (c == null) return;
    // Avval UI'dan olib tashlaymiz, keyin yopamiz (yopilgan kontroller chizilmasin).
    if (rebuild && mounted) {
      setState(() => _controller = null);
    } else {
      _controller = null;
    }
    try {
      if (c.value.isStreamingImages) await c.stopImageStream();
    } catch (_) {}
    await c.dispose();
  }

  Future<void> _onImage(CameraImage image) async {
    if (_busy || widget.paused || !mounted) return;
    final now = DateTime.now();
    if (now.difference(_lastFrame) < FaceConfig.minFrameInterval) return;
    final c = _controller, cam = _camera;
    if (c == null || cam == null) return;
    _busy = true;
    _lastFrame = now;
    try {
      final frame = FrameData.fromCameraImage(image, cam, c.value.deviceOrientation);
      if (frame == null) return;
      final faces = await _detector.processImage(frame.inputImage);
      if (!mounted) return;
      await widget.onFaces(frame, faces);
      if (!mounted) return;
      setState(() {
        _faces = faces;
        _imageSize = frame.uprightSize;
      });
    } catch (e) {
      debugPrint('Kadrni qayta ishlashda xato: $e');
    } finally {
      _busy = false;
    }
  }

  Future<void> _setZoom(double z) async {
    final c = _controller;
    if (c == null) return;
    final v = z.clamp(_minZoom, _maxZoom).toDouble();
    setState(() => _zoom = v);
    try {
      await c.setZoomLevel(v);
    } catch (_) {}
  }

  Future<void> _focus(Offset local, Size canvas) async {
    final c = _controller;
    if (c == null) return;
    setState(() => _focusPoint = local);
    _focusTimer?.cancel();
    _focusTimer = Timer(const Duration(milliseconds: 900), () {
      if (mounted) setState(() => _focusPoint = null);
    });
    final p = Offset(
      (local.dx / canvas.width).clamp(0.0, 1.0).toDouble(),
      (local.dy / canvas.height).clamp(0.0, 1.0).toDouble(),
    );
    try {
      await c.setFocusPoint(p);
      await c.setExposurePoint(p);
    } catch (_) {
      // Ba'zi kameralar nuqtali fokusni qo'llamaydi.
    }
  }

  Future<void> _toggleTorch() async {
    final c = _controller;
    if (c == null) return;
    try {
      await c.setFlashMode(_torch ? FlashMode.off : FlashMode.torch);
      setState(() => _torch = !_torch);
    } catch (_) {}
  }

  Future<void> _switchCamera() async {
    final current = _camera?.lensDirection ?? CameraLensDirection.back;
    final next = current == CameraLensDirection.back ? CameraLensDirection.front : CameraLensDirection.back;
    await _stopController();
    await _start(next);
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.no_photography_outlined, color: Colors.white70, size: 48),
              const SizedBox(height: 12),
              Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white)),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () {
                  setState(() => _error = null);
                  _start(_camera?.lensDirection ?? widget.initialLens);
                },
                child: const Text('Qayta urinish'),
              ),
            ],
          ),
        ),
      );
    }
    final c = _controller;
    if (c == null || !c.value.isInitialized) {
      return const Center(child: CircularProgressIndicator(color: Colors.white));
    }
    final mirror = _camera?.lensDirection == CameraLensDirection.front;
    final zoomStops = <double>[
      _minZoom,
      if (_maxZoom >= 2) 2,
      if (_maxZoom >= 4) 4,
      if (_maxZoom >= 8) 8,
    ];

    return Stack(
      children: [
        Center(
          child: CameraPreview(
            c,
            child: LayoutBuilder(builder: (context, box) {
              final canvas = Size(box.maxWidth, box.maxHeight);
              final coords = FaceCoords(
                imageSize: _imageSize ?? canvas,
                canvas: canvas,
                mirror: mirror,
              );
              return GestureDetector(
                behavior: HitTestBehavior.opaque,
                onScaleStart: (_) => _baseZoom = _zoom,
                onScaleUpdate: (d) {
                  if (d.pointerCount >= 2) _setZoom(_baseZoom * d.scale);
                },
                onTapUp: (d) => _focus(d.localPosition, canvas),
                child: Stack(
                  children: [
                    const Positioned.fill(child: SizedBox()),
                    if (_imageSize != null) Positioned.fill(child: widget.overlayBuilder(context, _faces, coords)),
                    if (_focusPoint != null)
                      Positioned(
                        left: _focusPoint!.dx - 30,
                        top: _focusPoint!.dy - 30,
                        child: IgnorePointer(
                          child: Container(
                            width: 60,
                            height: 60,
                            decoration: BoxDecoration(
                              border: Border.all(color: Colors.amberAccent, width: 2),
                              borderRadius: BorderRadius.circular(8),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              );
            }),
          ),
        ),
        // Boshqaruv tugmalari (o'ng tomonda).
        Positioned(
          right: 12,
          top: 12,
          child: Column(
            children: [
              _RoundButton(icon: Icons.cameraswitch_outlined, tooltip: 'Kamerani almashtirish', onTap: _switchCamera),
              const SizedBox(height: 10),
              _RoundButton(
                icon: _torch ? Icons.flash_on : Icons.flash_off,
                tooltip: 'Chiroq',
                onTap: _toggleTorch,
              ),
            ],
          ),
        ),
        // Zoom tugmalari (pastda).
        if (_maxZoom > _minZoom)
          Positioned(
            left: 0,
            right: 0,
            bottom: 12,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (final z in zoomStops)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: _ZoomChip(
                      label: '${z == _minZoom ? 1 : z.round()}x',
                      selected: (_zoom - z).abs() < 0.25,
                      onTap: () => _setZoom(z),
                    ),
                  ),
                if (zoomStops.every((z) => (_zoom - z).abs() >= 0.25))
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: _ZoomChip(label: '${_zoom.toStringAsFixed(1)}x', selected: true, onTap: () {}),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}

class _RoundButton extends StatelessWidget {
  const _RoundButton({required this.icon, required this.tooltip, required this.onTap});

  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.black45,
      shape: const CircleBorder(),
      child: IconButton(
        tooltip: tooltip,
        icon: Icon(icon, color: Colors.white),
        onPressed: onTap,
      ),
    );
  }
}

class _ZoomChip extends StatelessWidget {
  const _ZoomChip({required this.label, required this.selected, required this.onTap});

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 44,
        height: 44,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: selected ? Colors.white : Colors.black45,
        ),
        child: Text(label,
            style: TextStyle(
                color: selected ? Colors.black : Colors.white, fontWeight: FontWeight.w700, fontSize: 12)),
      ),
    );
  }
}
