#!/usr/bin/env python3
# Generate a soft music-box (オルゴール) lullaby WAV from a public-domain melody.
# No external deps (pure stdlib). Output: 16-bit PCM mono WAV.
import math, struct, sys, wave

SR = 44100

def note_freq(n):  # n = semitones relative to A4(440)
    return 440.0 * (2 ** (n / 12.0))

# note name -> semitone offset from A4
BASE = {'C':-9,'D':-7,'E':-5,'F':-4,'G':-2,'A':0,'B':2}
def freq(name, octave):
    return note_freq(BASE[name] + (octave - 4) * 12)

def pluck(freq_hz, dur, amp=0.5):
    """One music-box note: bell-like partials with fast exponential decay."""
    n = int(SR * dur)
    out = [0.0] * n
    # partial (multiple, gain, decay) — music box: strong 2nd/3rd, quick decay, slight ring
    partials = [(1.0, 1.0, 4.5), (2.0, 0.55, 5.5), (3.0, 0.33, 6.5),
                (4.01, 0.16, 7.5), (5.4, 0.08, 9.0)]
    for i in range(n):
        t = i / SR
        s = 0.0
        for mult, g, dec in partials:
            s += g * math.sin(2 * math.pi * freq_hz * mult * t) * math.exp(-dec * t)
        # tiny attack to avoid click
        atk = min(1.0, t / 0.004)
        out[i] = s * amp * atk
    return out

def add(buf, start, samples):
    end = start + len(samples)
    if end > len(buf):
        buf.extend([0.0] * (end - len(buf)))
    for i, s in enumerate(samples):
        buf[start + i] += s

# Usage:
#   musicbox_gen.py [OUT.wav] [mode] [min_seconds]
#   mode = twinkle (default) | campfire
#   min_seconds = loop the piece until at least this long (default: one pass)
mode = sys.argv[2] if len(sys.argv) > 2 else 'twinkle'
min_seconds = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0

buf = []

if mode == 'twinkle':
    # --- Twinkle Twinkle Little Star (public domain), slow & gentle ---
    Q = 0.62   # quarter-note seconds (slow, sleepy)
    H = Q * 2  # half note
    # (name, octave, beats) — melody one octave up for music-box sparkle
    melody = [
     ('C',5,1),('C',5,1),('G',5,1),('G',5,1),('A',5,1),('A',5,1),('G',5,2),
     ('F',5,1),('F',5,1),('E',5,1),('E',5,1),('D',5,1),('D',5,1),('C',5,2),
     ('G',5,1),('G',5,1),('F',5,1),('F',5,1),('E',5,1),('E',5,1),('D',5,2),
     ('G',5,1),('G',5,1),('F',5,1),('F',5,1),('E',5,1),('E',5,1),('D',5,2),
     ('C',5,1),('C',5,1),('G',5,1),('G',5,1),('A',5,1),('A',5,1),('G',5,2),
     ('F',5,1),('F',5,1),('E',5,1),('E',5,1),('D',5,1),('D',5,1),('C',5,2),
    ]
    # soft low harmony note at the start of each 7-note phrase, for warmth
    harmony_at = {0:('C',4), 7:('F',4), 14:('G',4), 21:('G',4), 28:('C',4), 35:('F',4)}
    t = 0.0
    for idx, (name, octv, beats) in enumerate(melody):
        dur = Q * beats
        add(buf, int(t * SR), pluck(freq(name, octv), dur + 0.25, amp=0.5))
        if idx in harmony_at:
            hn, ho = harmony_at[idx]
            add(buf, int(t * SR), pluck(freq(hn, ho), H + 0.4, amp=0.22))
        t += dur

elif mode == 'campfire':
    # --- Warm, slow music-box arpeggio over a cozy progression (campfire night).
    # I-vi-IV-V in C, played as gentle rolling arpeggios with a low warm root.
    E = 0.42  # eighth-note seconds (slow, unhurried)
    # each chord: (root note/oct, [arpeggio notes as (name, octave)])
    prog = [
        (('C',3), [('C',4),('E',4),('G',4),('C',5),('G',4),('E',4)]),  # C
        (('A',2), [('A',3),('C',4),('E',4),('A',4),('E',4),('C',4)]),  # Am
        (('F',2), [('F',3),('A',3),('C',4),('F',4),('C',4),('A',3)]),  # F
        (('G',2), [('G',3),('B',3),('D',4),('G',4),('D',4),('B',3)]),  # G
    ]
    def render_pass(t0):
        t = t0
        for (rn, ro), arp in prog:
            # warm low root, long soft decay, under the whole bar
            add(buf, int(t * SR), pluck(freq(rn, ro), len(arp) * E + 1.2, amp=0.30))
            for j, (nn, no) in enumerate(arp):
                add(buf, int((t + j * E) * SR), pluck(freq(nn, no), E * 2 + 0.5, amp=0.42))
            t += len(arp) * E
        return t
    t = render_pass(0.0)
    while t < min_seconds:
        t = render_pass(t)
else:
    sys.exit('unknown mode: ' + mode)

# normalize to avoid clipping
peak = max((abs(x) for x in buf), default=1.0) or 1.0
scale = 0.85 / peak
out = sys.argv[1] if len(sys.argv) > 1 else 'media/in/bgm_musicbox.wav'
with wave.open(out, 'w') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, x * scale)) * 32767)) for x in buf))
print('wrote:', out, 'duration:', round(len(buf)/SR, 2), 's')
