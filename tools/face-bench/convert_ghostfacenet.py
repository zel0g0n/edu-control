import os, sys
os.environ["TF_USE_LEGACY_KERAS"] = "1"
import tensorflow as tf, tf_keras, tf2onnx, numpy as np
src, dst = sys.argv[1], sys.argv[2]
m0 = tf_keras.models.load_model(src, compile=False)
# mixed_float16 bilan saqlangan bo'lsa: float32 ga o'tkazish (aniqlik yo'qolmasin)
m = tf_keras.models.model_from_json(m0.to_json().replace('"mixed_float16"', '"float32"'))
m.set_weights(m0.get_weights())
print(m.input_shape, m.output_shape, m.count_params())
spec = (tf.TensorSpec((1, 112, 112, 3), tf.float32, name="input"),)
mp, _ = tf2onnx.convert.from_keras(m, input_signature=spec, opset=13, output_path=dst)
x = (np.random.rand(1, 112, 112, 3).astype(np.float32) - 0.5) * 2
import onnxruntime as ort
a = m(x).numpy(); b = ort.InferenceSession(dst).run(None, {"input": x})[0]
print("maxdiff", np.abs(a - b).max(), os.path.getsize(dst))
