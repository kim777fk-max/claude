#!/usr/bin/env python3
# Render a MIDI file to a WAV using built-in procedural synthesis (no SoundFont).
# Good offline fallback; for realistic instruments use midi_arrange.py + sf_render.sh.
#
#   midi_render_synth.py IN.mid OUT.wav [VOICE] [MAX_SECONDS]
#   VOICE = organ | chiptune        (default: organ)
#
# Requires: numpy, mido
import sys, wave, numpy as np, mido
MID=sys.argv[1]; OUT=sys.argv[2]
VOICE=sys.argv[3] if len(sys.argv)>3 else 'organ'
MAXS=float(sys.argv[4]) if len(sys.argv)>4 else 80.0
SR=44100

# collect absolute-timed notes: (start, dur, midi_note, vel, channel)
m=mido.MidiFile(MID); t=0.0
on={}; notes=[]
for msg in m:
    t+=msg.time
    if t>MAXS+4: break
    if msg.type=='note_on' and msg.velocity>0:
        on[(msg.channel,msg.note)]=(t,msg.velocity)
    elif msg.type=='note_off' or (msg.type=='note_on' and msg.velocity==0):
        k=(msg.channel,msg.note)
        if k in on:
            st,vel=on.pop(k); notes.append((st,max(0.05,t-st),msg.note,vel,msg.channel))
print('notes to render:',len(notes))

def f_of(midi): return 440.0*2**((midi-69)/12)
DRAW=[(0.5,0.5),(1.0,1.0),(2.0,0.55),(3.0,0.2),(4.0,0.28),(6.0,0.1),(8.0,0.07)]
def organ(freq,dur,amp):
    n=int(dur*SR); t=np.arange(n)/SR; out=np.zeros(n)
    for det in (-3,3):
        fd=freq*2**(det/1200)
        for mult,g in DRAW: out+=g*np.sin(2*np.pi*fd*mult*t)
    out/=(np.max(np.abs(out))+1e-9)
    a=int(0.012*SR); r=min(int(0.06*SR),n//4); e=np.ones(n)
    if a:e[:a]=np.linspace(0,1,a)
    if r:e[-r:]=np.linspace(1,0,r)
    return amp*out*e
def square(freq,dur,amp,duty=0.5):
    n=int(dur*SR); t=np.arange(n)/SR
    w=np.where((freq*t)%1.0<duty,1.0,-1.0)
    a=int(0.003*SR); r=min(int(0.02*SR),n//4); e=np.ones(n)
    if a:e[:a]=np.linspace(0,1,a)
    if r:e[-r:]=np.linspace(1,0,r)
    return amp*w*e
def tri(freq,dur,amp):
    n=int(dur*SR); t=np.arange(n)/SR
    w=2*np.abs(2*((freq*t)%1.0)-1)-1
    a=int(0.003*SR); r=min(int(0.02*SR),n//4); e=np.ones(n)
    if a:e[:a]=np.linspace(0,1,a)
    if r:e[-r:]=np.linspace(1,0,r)
    return amp*w*e

total=min(MAXS, max(s+d for s,d,_,_,_ in notes))+1.0
BUF=np.zeros(int(total*SR)+SR)
for st,dur,note,vel,ch in notes:
    if st>MAXS: continue
    dur=min(dur,MAXS-st+1.0)
    amp=0.25*(vel/127.0)+0.05
    fr=f_of(note)
    if VOICE=='organ': sig=organ(fr,dur,amp)
    elif VOICE=='chiptune': sig=(tri(fr,dur,amp*1.2) if note<52 else square(fr,dur,amp,0.5))
    else: sig=organ(fr,dur,amp)
    s=int(st*SR); e=s+len(sig)
    if e<=len(BUF): BUF[s:e]+=sig
BUF=BUF[:int((min(MAXS,total))*SR)]
BUF=np.tanh(BUF*0.8)
BUF/=(np.max(np.abs(BUF))+1e-9); BUF*=0.9
d=int(0.012*SR); L=BUF; R=np.concatenate([np.zeros(d),BUF])[:len(BUF)]
st=np.stack([L,R],1); st=(st/(np.max(np.abs(st))+1e-9)*0.9*32767).astype('<i2')
with wave.open(OUT,'w') as w:
    w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR);w.writeframes(st.tobytes())
print('wrote',OUT,round(len(BUF)/SR,1),'s')
