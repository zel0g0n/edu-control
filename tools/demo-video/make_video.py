import cv2, numpy as np, subprocess, math, json
W,H,FPS,SEC = 1920,1080,18,16
rng = np.random.default_rng(7)
def tile(n): return cv2.imread(f'tile_{n}.png')
enrolled = ['0_2','0_3','0_4','0_6','0_12','1_2','1_5','1_9']   # 1_9 videoda yo'q (kelmagan)
strangers = ['0_10','1_7']
# (tile, row, x) : orqa qator kichik, old qator katta
layout = [('0_3',0,420),('1_7',0,800),('0_12',0,1150),('1_2',0,1500),
          ('0_2',1,330),('0_10',1,760),('1_5',1,1200),('0_6',1,1600),
          ('0_4',2,960)]
ROWS = {0:(330,92),1:(520,150),2:(760,230)}   # markaz y, bosh o'lchami
# fon: sinf xonasi
bg = np.zeros((H,W,3),np.uint8)
for y in range(H): bg[y,:] = (np.array([200,214,226])*(1-0.25*y/H)).astype(np.uint8)
cv2.rectangle(bg,(560,40),(1360,250),(60,90,45),-1); cv2.rectangle(bg,(560,40),(1360,250),(40,60,30),6)
cv2.putText(bg,'Demo dars',(800,170),cv2.FONT_HERSHEY_SIMPLEX,2.2,(230,240,230),4,cv2.LINE_AA)
for x in (80,1660):
    cv2.rectangle(bg,(x,60),(x+180,330),(235,225,200),-1); cv2.rectangle(bg,(x,60),(x+180,330),(150,140,120),5); cv2.line(bg,(x+90,60),(x+90,330),(150,140,120),4)
cv2.rectangle(bg,(0,600),(W,H),(150,170,185),-1)
def head(img, size, ang, light):
    t = cv2.resize(img,(size,size),interpolation=cv2.INTER_AREA).astype(np.float32)
    t = np.clip(t*light[0]+light[1],0,255)
    M = cv2.getRotationMatrix2D((size/2,size/2),ang,1.0)
    t = cv2.warpAffine(t,M,(size,size),borderMode=cv2.BORDER_REFLECT)
    m = np.zeros((size,size),np.float32)
    cv2.ellipse(m,(size//2,int(size*0.52)),(int(size*0.47),int(size*0.5)),0,0,360,1,-1)
    m = cv2.GaussianBlur(m,(0,0),size*0.04)[...,None]
    return t,m
params = {n:(rng.uniform(0,6.28),rng.uniform(0.6,1.3),rng.uniform(-6,6)) for n,_,_ in layout}
light = {n:(rng.uniform(0.82,1.1),rng.uniform(-12,12)) for n,_,_ in layout}
frames = []
proc = {}
for ext,args in (('webm',['-c:v','libvpx-vp9','-b:v','0','-crf','40','-row-mt','1','-deadline','good','-cpu-used','4']),
                 ('mp4',['-c:v','libx264','-crf','27','-preset','medium','-pix_fmt','yuv420p','-movflags','+faststart'])):
    proc[ext]=subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pix_fmt','bgr24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-an',*args,f'sinf-demo.{ext}'],stdin=subprocess.PIPE)
N=FPS*SEC
for f in range(N):
    tt=f/FPS; fr=bg.astype(np.float32).copy()
    for row in (0,1,2):
        cy,size=ROWS[row]
        for n,r,x in layout:
            if r!=row: continue
            ph,sp,a0=params[n]
            dx=6*math.sin(tt*sp+ph); dy=4*math.sin(tt*sp*1.3+ph)
            ang=a0+5*math.sin(tt*0.7*sp+ph)
            # kimdir 6-9 soniyada boshini engashtiradi (vaqtincha tanilmaydi)
            if n=='0_6' and 6<tt<9: ang+=35
            t,m=head(tile(n),size,ang,light[n])
            x0=int(x+dx-size/2); y0=int(cy+dy-size/2)
            # yelka
            cv2.ellipse(fr,(int(x+dx),int(y0+size*1.05)),(int(size*0.62),int(size*0.42)),0,180,360,(90+row*20,70,60),-1)
            fr[y0:y0+size,x0:x0+size]=fr[y0:y0+size,x0:x0+size]*(1-m)+t*m
        # parta
        dy0=cy+int(ROWS[row][1]*0.62)
        cv2.rectangle(fr,(120,dy0),(W-120,dy0+int(30+row*25)),(70,110,150),-1)
    # kamera: sekin surilish va zoom, ozgina shovqin
    z=1.0+0.05*(0.5-0.5*math.cos(tt*2*math.pi/SEC)); px=50*math.sin(tt*2*math.pi/SEC)
    M=np.float32([[z,0,(1-z)*W/2+px],[0,z,(1-z)*H/2]])
    out=cv2.warpAffine(fr,M,(W,H),borderMode=cv2.BORDER_REFLECT)
    out=np.clip(out+rng.normal(0,3,out.shape),0,255).astype(np.uint8)
    for p in proc.values(): p.stdin.write(out.tobytes())
    if f==N//2: cv2.imwrite('poster.jpg',out,[cv2.IMWRITE_JPEG_QUALITY,80])
for p in proc.values(): p.stdin.close(); p.wait()
json.dump({'enrolled':enrolled,'strangers':strangers,'absent':['1_9']},open('meta.json','w'))
