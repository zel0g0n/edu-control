import numpy as np, cv2, time, sys, onnxruntime as ort
from lfw import load

def degrade(imgs, eye_px):
    """Uzoqdagi yuz: ko'zlar orasi eye_px bo'lgan kichik yuzni 112 ga qaytadan cho'zish."""
    if eye_px is None: return imgs
    s = max(8, int(round(112 * eye_px / 35.0)))
    out = np.empty_like(imgs)
    for i, im in enumerate(imgs):
        small = cv2.resize(im, (s, s), interpolation=cv2.INTER_AREA)
        out[i] = cv2.resize(small, (112, 112), interpolation=cv2.INTER_LINEAR)
    return out

def metrics(e1, e2, same):
    sim = (e1 * e2).sum(1)
    # 10-fold accuracy
    n = len(same); idx = np.arange(n); folds = np.array_split(idx, 10); accs = []
    for k in range(10):
        test = folds[k]; train = np.setdiff1d(idx, test)
        ths = np.linspace(-1, 1, 801)
        best = ths[np.argmax([((sim[train] > t) == same[train]).mean() for t in ths])]
        accs.append(((sim[test] > best) == same[test]).mean())
    neg = np.sort(sim[~same])[::-1]; pos = sim[same]
    def tar(far):
        k = max(1, int(far * len(neg))); th = neg[k - 1]
        return (pos > th).mean()
    return dict(acc=np.mean(accs), tar1e2=tar(1e-2), tar1e3=tar(1e-3), pos_mean=pos.mean(), neg_max=neg[0], neg_p999=neg[int(0.001*len(neg))])

class Onnx:
    def __init__(self, path, layout="NHWC", norm=(128.,128.), bgr=False, threads=2):
        o = ort.SessionOptions(); o.intra_op_num_threads = threads
        self.s = ort.InferenceSession(path, o, providers=["CPUExecutionProvider"])
        self.inp = self.s.get_inputs()[0]; self.layout, self.norm, self.bgr = layout, norm, bgr
        shp = self.inp.shape; self.fixed_batch = isinstance(shp[0], int)
    def __call__(self, imgs, flip=False):
        x = imgs[..., ::-1] if self.bgr else imgs
        x = (x.astype(np.float32) - self.norm[0]) / self.norm[1]
        if self.layout == "NCHW": x = x.transpose(0, 3, 1, 2)
        bs = 1 if self.fixed_batch else 64
        outs = []
        for i in range(0, len(x), bs):
            outs.append(self.s.run(None, {self.inp.name: np.ascontiguousarray(x[i:i+bs])})[0])
        e = np.concatenate(outs).reshape(len(x), -1)
        if flip:
            xf = x[..., ::-1] if self.layout == "NCHW" else x[:, :, ::-1, :]
            o2 = [self.s.run(None, {self.inp.name: np.ascontiguousarray(xf[i:i+bs])})[0] for i in range(0, len(xf), bs)]
            e = e + np.concatenate(o2).reshape(len(x), -1)
        return e / np.linalg.norm(e, axis=1, keepdims=True)

def bench(name, model, imgs, same, eyes=(None, 20, 14, 10), flip=False):
    t = time.time(); rows = []
    for eye in eyes:
        d = degrade(imgs, eye); e = model(d, flip=flip)
        np.save(f"emb_{name.split()[0]}{'_flip' if flip else ''}_{eye or 35}.npy", e.astype(np.float16))
        m = metrics(e[0::2], e[1::2], same); m["eye"] = eye or 35; rows.append(m)
    dt = time.time() - t
    for m in rows:
        print(f"{name:28s} eye={m['eye']:>3}px acc={m['acc']*100:6.2f}% TAR@1e-2={m['tar1e2']*100:6.2f}% TAR@1e-3={m['tar1e3']*100:6.2f}% pos={m['pos_mean']:.2f} negmax={m['neg_max']:.2f}")
    print(f"  ({dt:.0f}s)", flush=True)
    return rows

if __name__ == "__main__":
    imgs, same = load("lfw.bin")
    m = Onnx("mobilefacenet.onnx")
    print(m.inp.shape, [o.shape for o in m.s.get_outputs()])
    bench("mobilefacenet (hozirgi)", m, imgs, same)
    bench("mobilefacenet +flip", m, imgs, same, flip=True)
