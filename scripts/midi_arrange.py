#!/usr/bin/env python3
# Re-arrange a MIDI file by remapping instruments / layering voices, so it can be
# rendered with a SoundFont (see sf_render.sh) in a chosen style.
#
#   midi_arrange.py IN.mid OUT.mid PRESET
#
# PRESET:
#   piano        all parts -> Acoustic Grand Piano
#   organ        all parts -> Church Organ
#   harpsichord  all parts -> Harpsichord
#   strings      all parts -> String Ensemble
#   aria         melody(flute/oboe)->Violin, accompaniment->Strings, + warm pad cushion
#   layers       triple layer: Distortion Guitar + String Ensemble + Saw synth (no drums)
#   metal        all parts -> Distortion Guitar + a programmed metal drum track
#   prog:N       all parts -> GM program number N (0-127)
#
# Requires: mido  (pip install mido)
import sys, mido

IN, OUT, PRESET = sys.argv[1], sys.argv[2], sys.argv[3]
m = mido.MidiFile(IN); TPB = m.ticks_per_beat

def melodic_channels():
    ch = set()
    for tr in m.tracks:
        for msg in tr:
            if msg.type in ('note_on', 'note_off'):
                ch.add(msg.channel)
    return sorted(ch)

def copy_remap(prog_for):
    """Copy tracks, replacing every program_change via prog_for(old)->new."""
    out = mido.MidiFile(ticks_per_beat=TPB)
    for tr in m.tracks:
        nt = mido.MidiTrack()
        for msg in tr:
            if msg.type == 'program_change':
                msg = msg.copy(program=prog_for(msg.program))
            nt.append(msg)
        out.tracks.append(nt)
    return out

def all_note_events(channel_filter=None):
    ev = []
    for tr in m.tracks:
        t = 0
        for msg in tr:
            t += msg.time
            if msg.type in ('note_on', 'note_off') and (channel_filter is None or msg.channel in channel_filter):
                ev.append((t, msg.type, msg.channel, msg.note, msg.velocity))
    ev.sort(key=lambda x: x[0])
    return ev

def events_to_track(ev):
    tr = mido.MidiTrack(); prev = 0
    for t, typ, ch, note, vel in ev:
        tr.append(mido.Message(typ, channel=ch, note=note, velocity=vel, time=t - prev)); prev = t
    return tr

def add_layer(out, offset, program, volume, reverb=70, vel_scale=1.0):
    """Duplicate all notes onto channels (orig+offset) with a program & volume."""
    setup = mido.MidiTrack()
    for c in melodic_channels():
        ch = (c + offset) % 16
        setup.append(mido.Message('program_change', channel=ch, program=program, time=0))
        setup.append(mido.Message('control_change', channel=ch, control=7, value=volume, time=0))
        setup.append(mido.Message('control_change', channel=ch, control=91, value=reverb, time=0))
    out.tracks.insert(0, setup)
    ev = [(t, typ, (c + offset) % 16, n, max(1, int(v * vel_scale)))
          for (t, typ, c, n, v) in all_note_events()]
    out.tracks.append(events_to_track(ev))

def metal_drums(out, max_seconds=1e9):
    """Append a metal drum track (GM kit, channel 9) aligned to the beat grid."""
    tempo = 500000; abs_t = 0.0; abs_tick = 0; nb = 0; Nbeats = 0
    for msg in mido.merge_tracks(m.tracks):
        dt = msg.time
        while abs_tick + dt >= nb * TPB:
            tt = nb * TPB - abs_tick
            abs_t += mido.tick2second(tt, TPB, tempo); abs_tick = nb * TPB; dt -= tt
            if abs_t <= max_seconds: Nbeats = nb
            nb += 1
            if abs_t > max_seconds + 2: break
        if abs_t > max_seconds + 2: break
        abs_t += mido.tick2second(dt, TPB, tempo); abs_tick += dt
        if msg.type == 'set_tempo': tempo = msg.tempo
    ev = []; half = TPB // 2; short = max(10, TPB // 4)
    def hit(t, note, vel, dur=short): ev += [(t, 1, note, vel), (t + dur, 0, note, 0)]
    for i in range(Nbeats):
        t0 = i * TPB
        hit(t0, 36, 122); hit(t0, 42, 86); hit(t0 + half, 42, 80); hit(t0 + half, 36, 104)
        if i % 2 == 1: hit(t0, 38, 118)
        if i % 8 == 0: hit(t0, 49, 110, dur=TPB * 2)
    ev.sort(key=lambda x: (x[0], x[1]))
    dt = mido.MidiTrack(); dt.append(mido.Message('program_change', channel=9, program=0, time=0))
    prev = 0
    for t, kind, note, vel in ev:
        d = t - prev; prev = t
        typ = 'note_on' if kind == 1 else 'note_off'
        dt.append(mido.Message(typ, channel=9, note=note, velocity=vel, time=d))
    out.tracks.append(dt)

# ---- presets ----
SIMPLE = {'piano': 0, 'organ': 19, 'harpsichord': 6, 'strings': 48}
if PRESET in SIMPLE:
    out = copy_remap(lambda p: SIMPLE[PRESET])
elif PRESET.startswith('prog:'):
    n = int(PRESET.split(':', 1)[1]); out = copy_remap(lambda p: n)
elif PRESET == 'aria':
    out = copy_remap(lambda p: {73: 40, 68: 40, 6: 48, 0: 48}.get(p, 48))  # flute/oboe->violin, rest->strings
    add_layer(out, 4, 89, 48, reverb=90, vel_scale=0.7)                    # warm pad cushion
elif PRESET == 'layers':
    out = copy_remap(lambda p: 30)                                         # base = distortion guitar
    add_layer(out, 4, 48, 94, reverb=70)                                   # strings (violins)
    add_layer(out, 10, 81, 72, reverb=70)                                  # saw synth
elif PRESET == 'metal':
    out = copy_remap(lambda p: 30)                                         # distortion guitar
    metal_drums(out)
else:
    sys.exit('unknown preset: ' + PRESET)

out.save(OUT)
print('arranged:', OUT, 'preset:', PRESET, 'channels:', melodic_channels())
