import 'dart:typed_data';

import 'package:flutter/material.dart';

/// Yuz kesimi (JPEG baytlar) uchun kichik rasm. Bosilsa kattalashadi.
class SnapshotThumb extends StatelessWidget {
  const SnapshotThumb({
    super.key,
    required this.bytes,
    this.size = 48,
    this.circle = false,
    this.title,
    this.enlargeOnTap = true,
  });

  final Uint8List bytes;
  final double size;
  final bool circle;
  final String? title;
  final bool enlargeOnTap;

  @override
  Widget build(BuildContext context) {
    final image = Image.memory(bytes, width: size, height: size, fit: BoxFit.cover, gaplessPlayback: true);
    final clipped = circle
        ? ClipOval(child: image)
        : ClipRRect(borderRadius: BorderRadius.circular(size * 0.22), child: image);
    if (!enlargeOnTap) return clipped;
    return GestureDetector(
      onTap: () => showSnapshotViewer(context, bytes, title: title),
      child: clipped,
    );
  }
}

Future<void> showSnapshotViewer(BuildContext context, Uint8List bytes, {String? title, String? caption}) {
  return showDialog<void>(
    context: context,
    builder: (ctx) => Dialog(
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AspectRatio(aspectRatio: 1, child: Image.memory(bytes, fit: BoxFit.cover)),
          if (title != null || caption != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (title != null)
                    Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  if (caption != null) Text(caption),
                ],
              ),
            ),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Yopish')),
          ),
        ],
      ),
    ),
  );
}
