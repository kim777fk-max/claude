#!/usr/bin/env python3
# Generate an ORIGINAL heroic RPG-battle style BGM (DQ/JRPG flavored, not a copy
# of any existing song). Layers: brass melody, driving string ostinato, bass,
# timpani + percussion. Output: 16-bit stereo WAV.
#
#   battle_bgm.py [OUT.wav] [min_seconds]
import sys, wave, struct
import numpy as np

SR = 44100
OUT = sys.argv[1] if len(sys.argv) > 1 else 'media/in/bgm_battle.wav'
MIN_SEC = float(sys.argv[2]) if len(sys.argv) > 2 else 30.0

def f(semis_from_a4):
    return 440.0 * 2 ** (semis_from_a4 / 12.0)
NAME = {'C':-9,'C#':-8,'D':-7,'D#':-6,'E':-5,'F':-4,'F#':-3,'G':-2,'G#':-1,'A':0,'A#':1,'B':2}
def note(n, octv):
    return f(NAME[n] + (octv - 4) * 12)

def env(n, a, d, s, r, sus=0.7):
    """ADSR envelope over n samples (a/d/r in seconds, s=sustain seconds)."""
    a=int(a*SR); d=int(d*SR); r=int(r*SR); s=max(0, n-a-d-r)
    parts=[np.linspace(0,1,a,endpoint=False) if a else np.array([]),
           np.linspace(1,sus,d,endpoint=False) if d else np.array([]),
           np.full(s, sus),
           np.linspace(sus,0,r,endpoint=True) if r else np.array([])]
    e=np.concatenate(parts) if any(len(p) for p in parts) else np.zeros(n)
    if len(e)<n: e=np.concatenate([e, np.zeros(n-len(e))])
    return e[:n]

def saw_harm(freq, n, npart=10):
    t=np.arange(n)/SR
    out=np.zeros(n)
    for k in range(1,npart+1):
        out+=(1.0/k)*np.sin(2*np.pi*freq*k*t)
    return out/np.max(np.abs(out)+1e-9)

def brass(freq, dur, amp=0.5):
    n=int(dur*SR); t=np.arange(n)/SR
    vib=1+0.006*np.sin(2*np.pi*5.5*t)            # vibrato
    tone=0.6*saw_harm(freq*vib[0], n, 9)
    # rebuild with vibrato properly
    ph=2*np.pi*freq*np.cumsum(vib)/SR
    tone=np.zeros(n)
    for k in range(1,10): tone+=(1.0/k)*np.sin(k*ph)
    tone/=np.max(np.abs(tone)+1e-9)
    e=env(n, 0.02, 0.05, 0, 0.06, sus=0.85)
    return amp*tone*e

def strings(freq, dur, amp=0.35):
    n=int(dur*SR); t=np.arange(n)/SR
    out=np.zeros(n)
    for det in (-0.18,0.0,0.18):                 # ensemble detune
        ph=2*np.pi*(freq*(1+det/100))*t
        for k in range(1,8): out+=(1.0/k)*np.sin(k*ph)
    out/=np.max(np.abs(out)+1e-9)
    trem=1+0.12*np.sin(2*np.pi*6.0*t)
    e=env(n, 0.04, 0.0, 0, 0.04, sus=0.9)
    return amp*out*trem*e

def bass(freq, dur, amp=0.6):
    n=int(dur*SR); t=np.arange(n)/SR
    ph=2*np.pi*freq*t
    tone=np.sin(ph)+0.35*np.sin(2*ph)+0.12*(2*(t*freq-np.floor(0.5+t*freq)))  # +saw bite
    tone/=np.max(np.abs(tone)+1e-9)
    e=env(n, 0.005, 0.05, 0, 0.05, sus=0.8)
    return amp*tone*e

def timpani(freq, dur, amp=0.8):
    n=int(dur*SR); t=np.arange(n)/SR
    pitch=freq*(1+0.6*np.exp(-t*30))             # quick downward pitch drop
    ph=2*np.pi*np.cumsum(pitch)/SR
    tone=np.sin(ph)
    noise=(np.random.rand(n)*2-1)*np.exp(-t*40)*0.5
    e=np.exp(-t*7)
    return amp*(tone*e+noise*e)

def snare(dur, amp=0.5):
    n=int(dur*SR); t=np.arange(n)/SR
    nz=np.random.rand(n)*2-1
    e=np.exp(-t*30)
    return amp*nz*e

def crash(dur, amp=0.5):
    n=int(dur*SR); t=np.arange(n)/SR
    nz=np.random.rand(n)*2-1
    e=np.exp(-t*4.5)
    return amp*nz*e

# ---- arrangement (D minor, heroic, ~150 bpm) ----
BPM=152; beat=60.0/BPM; eighth=beat/2
# chord progression (one bar each): Dm - Bb - F - C - Dm - C - Bb - A
prog=[('D',['D','F','A']), ('A#',['A#','D','F']), ('F',['F','A','C']), ('C',['C','E','G']),
      ('D',['D','F','A']), ('C',['C','E','G']), ('A#',['A#','D','F']), ('A',['A','C#','E'])]
# brass melody per bar (8 eighths) — original heroic line (scale degrees as note names)
mel=[
 ['D','A','D','A','F','A','D','A'],
 ['D','A#','D','F','A#','F','D','A#'],
 ['C','F','A','F','C','A','F','C'],
 ['E','G','C','G','E','C','G','E'],
 ['D','A','D','F','A','D','F','A'],
 ['E','G','C','E','G','C','G','E'],
 ['D','F','A#','D','A#','F','D','F'],
 ['A','C#','E','A','E','C#','A','E'],
]

L=int((MIN_SEC+max(b for b in [len(prog)*4*beat]))*SR)+SR
buf=np.zeros(L+SR*3)

def place(sig, t0):
    s=int(t0*SR); e=s+len(sig)
    if e>len(buf):
        return
    buf[s:e]+=sig

t=0.0
passes=0
while t < MIN_SEC:
    for bi,(root,chord) in enumerate(prog):
        bar_t=t
        # bass: root, octave 2, on each beat (4)
        for b in range(4):
            place(bass(note(root,2), beat*0.95), bar_t+b*beat)
        # strings ostinato: chord tones, eighth notes, octave 4
        for j in range(8):
            cn=chord[j%len(chord)]
            place(strings(note(cn,4), eighth*0.98), bar_t+j*eighth)
        # brass melody, octave 5, eighth notes
        for j,mn in enumerate(mel[bi]):
            place(brass(note(mn,5), eighth*0.96, amp=0.5), bar_t+j*eighth)
        # percussion: timpani on beat 1&3, snare on 2&4, crash at bar 1 of phrase
        place(timpani(note(root,2), beat*1.1), bar_t+0*beat)
        place(timpani(note(root,2), beat*1.1), bar_t+2*beat)
        place(snare(beat*0.5), bar_t+1*beat)
        place(snare(beat*0.5), bar_t+3*beat)
        if bi in (0,4):
            place(crash(beat*2), bar_t)
        t+=4*beat
    passes+=1

# mix down / normalize
buf=buf[:int((t)*SR)]
peak=np.max(np.abs(buf))+1e-9
buf=buf*(0.9/peak)
# soft clip for glue
buf=np.tanh(buf*1.1)*0.92
# simple stereo: duplicate with tiny haas delay
delay=int(0.008*SR)
left=buf
right=np.concatenate([np.zeros(delay), buf])[:len(buf)]
stereo=np.stack([left,right],axis=1)
stereo=(stereo/np.max(np.abs(stereo)+1e-9)*0.92*32767).astype('<i2')

with wave.open(OUT,'w') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(stereo.tobytes())
print('wrote:', OUT, 'duration:', round(len(buf)/SR,2),'s, passes:', passes)
