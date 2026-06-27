#!/usr/bin/env python3
# Add musical expression to a (often flat / step-entered) MIDI so it sounds played
# "with feeling": dynamic arc + beat accents, CC11 swells (hairpins) and delayed
# vibrato on long notes, legato overlap, humanized timing, and a final ritardando.
#
#   midi_express.py IN.mid OUT.mid [INTENSITY]   (INTENSITY 0..1, default 0.6)
#
# Best on sustaining timbres (strings/violin/organ). Requires: mido
import sys, random, math, mido
random.seed(7)

IN, OUT = sys.argv[1], sys.argv[2]
INT = float(sys.argv[3]) if len(sys.argv) > 3 else 0.6
m = mido.MidiFile(IN); TPB = m.ticks_per_beat

# --- flatten to absolute-tick events, collect notes + tempo ---
abs_msgs = []          # (tick, msg) for non-note meta/CC we keep (tempo etc.)
notes = []             # [start, end, ch, note, vel]
open_n = {}
total = 0
for tr in m.tracks:
    t = 0
    for msg in tr:
        t += msg.time
        if msg.type == 'note_on' and msg.velocity > 0:
            open_n[(msg.channel, msg.note)] = (t, msg.velocity)
        elif msg.type == 'note_off' or (msg.type == 'note_on' and msg.velocity == 0):
            k = (msg.channel, msg.note)
            if k in open_n:
                st, v = open_n.pop(k); notes.append([st, t, msg.channel, msg.note, v])
        elif msg.type == 'set_tempo':
            abs_msgs.append((t, msg))
    total = max(total, t)
if not notes:
    m.save(OUT); print('no notes'); sys.exit()

# --- dynamic arc: build to ~62% then relax; accent on-beat; humanize ---
def arc(tick):
    x = tick / max(1, total)
    peak = 0.62
    a = (x / peak) if x < peak else (1 - (x - peak) / (1 - peak))
    return 0.78 + 0.22 * a            # 0.78..1.0
for n in notes:
    st = n[0]
    beat_pos = (st % TPB) / TPB
    accent = 1.0 + 0.10 * INT * (1 - min(beat_pos * 2, 1))     # stronger near the beat
    hum = 1.0 + random.uniform(-0.05, 0.05) * INT
    n[4] = max(1, min(127, int(n[4] * arc(st) * accent * hum)))
    # legato: extend each note slightly for a connected line
    n[1] = n[1] + int(TPB * 0.12 * INT)
    # humanized micro-timing
    n[0] = max(0, st + int(random.uniform(-TPB * 0.01, TPB * 0.01) * INT))

# --- build output events: notes -> on/off, plus CC11 swell + CC1 vibrato on long notes ---
ev = []   # (tick, priority, mido.Message)
def add(tick, msg, pr=1): ev.append((max(0, int(tick)), pr, msg))
for st, en, ch, note, vel in notes:
    add(st, mido.Message('note_on', channel=ch, note=note, velocity=vel), 2)
    add(en, mido.Message('note_off', channel=ch, note=note, velocity=0), 0)
    dur = en - st
    if dur > TPB * 0.75:                         # long note -> hairpin + vibrato
        steps = 6
        for i in range(steps + 1):
            f = i / steps
            shape = math.sin(math.pi * f)        # 0->1->0 swell
            val = int(70 + 45 * shape * INT)
            add(st + dur * f, mido.Message('control_change', channel=ch, control=11, value=max(0, min(127, val))), 1)
        # delayed vibrato (mod wheel) ramps in after ~0.3 beat
        vstart = st + int(TPB * 0.3)
        for i in range(4):
            f = i / 3
            add(vstart + (en - vstart) * f,
                mido.Message('control_change', channel=ch, control=1, value=int(55 * f * INT)), 1)

# keep original tempo events; then add a final ritardando over the last ~3 beats
base_tempo = 500000
for t, msg in abs_msgs:
    if t < total * 0.1: base_tempo = msg.tempo
    add(t, msg, 3)
rit_start = total - TPB * 3
for i in range(7):
    f = i / 6
    tt = rit_start + (total - rit_start) * f
    slow = int(base_tempo * (1 + 0.45 * f * INT))   # up to ~45% slower at the very end
    add(tt, mido.MetaMessage('set_tempo', tempo=slow), 3)

ev.sort(key=lambda x: (x[0], -x[1]))
out = mido.MidiFile(ticks_per_beat=TPB)
tr = mido.MidiTrack(); prev = 0
for tick, pr, msg in ev:
    msg = msg.copy(time=tick - prev); prev = tick
    tr.append(msg)
out.tracks.append(tr)
out.save(OUT)
print('expressivized:', OUT, 'notes:', len(notes), 'intensity:', INT)
