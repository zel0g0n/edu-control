"""Sinf simulyatsiyasi (ochiq to'plam): 30 o'quvchi ro'yxatda (yaqindan olingan namuna),
kamera ularni eye_px masofada ko'radi + 10 ta begona yuz. Bitta kadr, ovozsiz."""
import numpy as np, sys
from lfw import load
_, same = load("lfw.bin")
pos = np.where(same)[0]
# Bir odam bir necha juftlikda uchraydi (LFW): tanlovda takrorlanmasin (ref model bilan).
REF = np.load("emb_gn_s2_35.npy").astype(np.float32)
def distinct(rng, k):
    order = rng.permutation(pos); chosen = []; vecs = []
    for i in order:
        v = (REF[2*i] + REF[2*i+1]); v /= np.linalg.norm(v)
        if vecs and max(float(v @ u) for u in vecs) > 0.35: continue
        chosen.append(i); vecs.append(v)
        if len(chosen) == k: break
    return np.array(chosen)
def run(model, eye, T, M=0.1, trials=400, seed=0):
    g = np.load(f"emb_{model}_35.npy").astype(np.float32); p = np.load(f"emb_{model}_{eye}.npy").astype(np.float32)
    rng = np.random.default_rng(seed); ok = wrong = fa = n_enr = n_str = 0
    for _ in range(trials):
        pick = distinct(rng, 40); enr, strangers = pick[:30], pick[30:]
        G = g[2*enr]                      # namuna: juftlikning 1-rasmi, yaqindan
        for k, i in enumerate(enr):       # kamera: 2-rasm, uzoqdan
            s = G @ p[2*i+1]; o = np.argsort(s)[::-1]
            if s[o[0]] >= T and s[o[0]] - s[o[1]] >= M:
                ok += o[0] == k; wrong += o[0] != k
            n_enr += 1
        for i in strangers:
            s = G @ p[2*i+1]; o = np.argsort(s)[::-1]
            fa += s[o[0]] >= T and s[o[0]] - s[o[1]] >= M; n_str += 1
    return ok/n_enr, wrong/n_enr, fa/n_str
if __name__ == "__main__":
    model = sys.argv[1]
    for eye in (35, 20, 14, 10):
        best = None
        for T in np.arange(0.20, 0.80, 0.01):
            r = run(model, eye, T, trials=150)
            if r[1] + r[2] <= 0.002: best = (T, r); break
        if best is None: print(model, eye, "0.2% ga yetmadi"); continue
        T, (acc, wr, fa) = best
        acc, wr, fa = run(model, eye, T, trials=400, seed=1)
        print(f"{model:20s} eye={eye:>2}px T={T:.2f}: tanildi {acc*100:5.1f}%  xato odam {wr*100:4.2f}%  begona qabul {fa*100:4.2f}%", flush=True)
