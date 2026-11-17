#!/usr/bin/env python3
"""Cut one short piece from each style's app BGM (houscaper-app public/sound/music, Suno songs)
and join them into the reel soundtrack. Only edits the existing tracks; no music is composed here."""
import subprocess, json, sys
import numpy as np
SRC='/home/claude/houscaper-app/public/sound/music'
ORDER=['hanok','japan','mexico','german','viking','persian','newyork','christmas']
SEG=3.0; END=3.6; SR=48000; FPS=30
def dec(p):
    raw=subprocess.run(['ffmpeg','-v','error','-i',p,'-ac','2','-ar',str(SR),'-f','f32le','-'],check=True,capture_output=True).stdout
    return np.frombuffer(raw,dtype=np.float32).reshape(-1,2).copy()
out=[];info={}
for i,s in enumerate(ORDER):
    x=dec(f'{SRC}/{s}.mp3');L=SEG+(END if i==len(ORDER)-1 else 0)
    m=x.mean(1);hop=SR//20
    e=np.sqrt(np.add.reduceat(m**2,np.arange(0,len(m)-hop,hop))/hop)
    n=int(L*20);best=None
    for st in range(20,len(e)-n-25):   # 0.05 s steps, skip first second and the crossfade tail
        w=e[st:st+n]
        # loud overall, and it must start on a hit (jump in level) so the genre lands at once
        score=w.mean()+0.6*(e[st:st+3].mean()-e[st-3:st].mean())+0.3*w[:20].mean()
        if best is None or score>best[0]:best=(score,st)
    a=best[1]*hop-int(.012*SR);seg=x[a:a+int(L*SR)].copy()
    seg*=0.11/ (np.sqrt((seg**2).mean())+1e-9)
    f=int(.03*SR);seg[:f]*=np.linspace(0,1,f)[:,None];seg[-f:]*=np.linspace(1,0,f)[:,None]
    if i==len(ORDER)-1:
        k=int(1.0*SR);seg[-k:]*=np.linspace(1,0,k)[:,None]**1.5
    out.append(seg);info[s]=round(a/SR,2)
y=np.concatenate(out);y=np.tanh(y*1.0)
open('mix.f32','wb').write(y.astype(np.float32).tobytes())
subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(SR),'-ac','2','-i','mix.f32','-af','loudnorm=I=-14:TP=-1.5:LRA=11','-ar','48000','music-mix.wav'],check=True)
# per-frame spectrum bars for the on-screen equaliser
m=y.mean(1);N=int(len(m)/SR*FPS);bars=[]
edges=np.geomspace(80,9000,17)
for fr in range(N):
    c=int(fr/FPS*SR);w=m[max(0,c-1024):c+1024]
    if len(w)<2048:w=np.pad(w,(0,2048-len(w)))
    sp=np.abs(np.fft.rfft(w*np.hanning(2048)));fq=np.fft.rfftfreq(2048,1/SR)
    bars.append([float(np.log1p(sp[(fq>=lo)&(fq<hi)].mean()*(1+k*.35))) for k,(lo,hi) in enumerate(zip(edges[:-1],edges[1:]))])
b=np.array(bars);b/=np.percentile(b,97,axis=0,keepdims=True);b=np.clip(b,0,1)
json.dump({'order':ORDER,'seg':SEG,'end':END,'start':info,'bars':np.round(b,2).tolist()},open('a/audio.json','w'))
print(info,len(y)/SR)
