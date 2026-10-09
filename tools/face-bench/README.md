# Yuz modeli o'lchovi (ixtiyoriy, dasturchi uchun)

Model tanlash va chegaralarni sozlashda ishlatilgan skriptlar. Ilovaning ishlashi uchun kerak emas.

```bash
pip install onnxruntime opencv-python numpy
# LFW (6000 juft, 112x112 tekislangan):
curl -LO https://github.com/leondgarse/Keras_insightface/releases/download/v1.0.0/lfw.bin
# Model (GhostFaceNets, MIT): Keras -> ONNX
curl -LO https://github.com/HamadYA/GhostFaceNets/releases/download/v1.2/GhostFaceNet_W1.3_S1_ArcFace.h5
pip install tensorflow tf_keras tf2onnx
python convert_ghostfacenet.py GhostFaceNet_W1.3_S1_ArcFace.h5 gn_s1.onnx
```

- `evalfr.py`: aniqlik (10-fold), TAR@FAR, uzoqdagi yuz taqlidi (ko'zlar orasi 20/14/10 px).
- `classsim.py`: "30 o'quvchi + 10 begona" ochiq to'plam simulyatsiyasi.

Natijalar asosiy README.md da ("Aniqlik o'lchovi").
