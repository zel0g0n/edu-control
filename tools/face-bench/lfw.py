import pickle, numpy as np, cv2, sys
def load(path):
    with open(path,'rb') as f:
        try: bins, issame = pickle.load(f)
        except UnicodeDecodeError:
            f.seek(0); bins, issame = pickle.load(f, encoding='bytes')
    imgs = np.stack([cv2.imdecode(np.frombuffer(b, np.uint8), cv2.IMREAD_COLOR)[:, :, ::-1] for b in bins])  # RGB
    return imgs, np.array(issame, bool)
if __name__ == "__main__":
    imgs, same = load(sys.argv[1]); print(imgs.shape, imgs.dtype, same.shape, same.mean())
    cv2.imwrite("sample.png", np.concatenate(list(imgs[:8]),1)[:, :, ::-1])
