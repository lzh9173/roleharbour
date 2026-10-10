"""Synthesise the promo's 14-second music bed and sound effects.

Usage: python3 -I promo/music.py output/promo/music.wav

Cue times come from promo/timeline.json, which the video page reads too. The result
is loudness-normalised with two-pass ffmpeg loudnorm (-16 LUFS, -2.5 dBTP before AAC encoding).
"""

import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

RATE = 48_000
ROOT = Path(__file__).resolve().parent
TIMELINE = json.loads((ROOT / 'timeline.json').read_text())
CUES = TIMELINE['cues']
DURATION = TIMELINE['duration']
BEAT = 60 / TIMELINE['bpm']
SAMPLES = round(DURATION * RATE)
rng = np.random.default_rng(20261011)


def hz(note: str) -> float:
    names = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
    pitch = names[note[0]] + (1 if '#' in note else 0) - (1 if note[1:2] == 'b' else 0)
    octave = int(note[-1])
    return 440.0 * 2 ** ((pitch + 12 * (octave + 1) - 69) / 12)


def t_axis(seconds: float) -> np.ndarray:
    return np.arange(int(seconds * RATE)) / RATE


def place(bus: np.ndarray, sound: np.ndarray, at: float, gain: float = 1.0, pan: float = 0.0):
    """Mix a mono sound into a stereo bus at time `at` with constant-power panning."""
    start = int(round(at * RATE))
    if start >= SAMPLES:
        return
    end = min(SAMPLES, start + len(sound))
    angle = (pan + 1) * np.pi / 4
    bus[0, start:end] += sound[: end - start] * gain * np.cos(angle)
    bus[1, start:end] += sound[: end - start] * gain * np.sin(angle)


def spectral_filter(x: np.ndarray, low: float = 0.0, high: float = RATE / 2) -> np.ndarray:
    """Zero-phase band-pass by FFT with soft edges; fine for short one-shots."""
    spectrum = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(len(x), 1 / RATE)
    shape = np.ones_like(freqs)
    if low > 0:
        shape *= 1 / (1 + (low / np.maximum(freqs, 1)) ** 4)
    shape *= 1 / (1 + (freqs / high) ** 4)
    return np.fft.irfft(spectrum * shape, len(x))


def lowpass_sweep(x: np.ndarray, cutoff: np.ndarray) -> np.ndarray:
    """One-pole low-pass with a per-sample cutoff in Hz (applied twice for 12 dB/oct)."""
    alpha = 1 - np.exp(-2 * np.pi * cutoff / RATE)
    for _ in range(2):
        y = np.empty_like(x)
        state = 0.0
        for i in range(len(x)):
            state += alpha[i] * (x[i] - state)
            y[i] = state
        x = y
    return x


# ---------------------------------------------------------------------------
# Instruments


def electric_piano(freq: float, seconds: float, velocity: float = 1.0) -> np.ndarray:
    t = t_axis(seconds)
    index = 1.6 * np.exp(-t / 0.35) * velocity
    tine = 0.25 * np.exp(-t / 0.04) * np.sin(2 * np.pi * freq * 14 * t)
    body = np.sin(2 * np.pi * freq * t + index * np.sin(2 * np.pi * freq * t))
    env = np.exp(-t / 1.1) * (1 - np.exp(-t / 0.003))
    release = np.clip((seconds - t) / 0.05, 0, 1)
    return (body + tine) * env * release * velocity


def pluck(freq: float, seconds: float = 0.35) -> np.ndarray:
    t = t_axis(seconds)
    tone = sum(np.sin(2 * np.pi * freq * k * t) / k ** 1.4 for k in range(1, 7))
    return tone * np.exp(-t / 0.09) * (1 - np.exp(-t / 0.002))


def saw(freq: float, t: np.ndarray, harmonics: int = 24) -> np.ndarray:
    return sum(np.sin(2 * np.pi * freq * k * t) / k for k in range(1, harmonics + 1))


def pad(freqs: list[float], seconds: float) -> np.ndarray:
    t = t_axis(seconds)
    voices = sum(saw(f * d, t) for f in freqs for d in (0.996, 1.0, 1.004))
    env = (1 - np.exp(-t / 0.02)) * np.exp(-t / 0.9)
    return spectral_filter(voices * env, high=2800) / (3 * len(freqs))


def kick() -> np.ndarray:
    t = t_axis(0.35)
    phase = 2 * np.pi * np.cumsum(48 + 110 * np.exp(-t / 0.035)) / RATE
    body = np.sin(phase) * np.exp(-t / 0.18)
    click = rng.standard_normal(len(t)) * np.exp(-t / 0.002) * 0.3
    return np.tanh(1.6 * (body + click))


def clap() -> np.ndarray:
    t = t_axis(0.3)
    noise = rng.standard_normal(len(t))
    env = sum(np.exp(-np.maximum(t - d, 0) / 0.008) * (t >= d) for d in (0, 0.011, 0.022))
    env = env + 0.6 * np.exp(-np.maximum(t - 0.03, 0) / 0.08) * (t >= 0.03)
    return spectral_filter(noise * env, low=900, high=5500) * 0.8


def hat(open_: bool = False) -> np.ndarray:
    t = t_axis(0.25 if open_ else 0.06)
    tone = spectral_filter(rng.standard_normal(len(t)), low=7000, high=16000)
    return tone * np.exp(-t / (0.08 if open_ else 0.014))


def sub_bass(freq: float, seconds: float) -> np.ndarray:
    t = t_axis(seconds)
    env = (1 - np.exp(-t / 0.004)) * np.clip((seconds - t) / 0.02, 0, 1)
    return np.tanh(1.4 * np.sin(2 * np.pi * freq * t)) * env


# ---------------------------------------------------------------------------
# Effects


def tick(pitch: float = 2400) -> np.ndarray:
    t = t_axis(0.05)
    return np.sin(2 * np.pi * pitch * t) * np.exp(-t / 0.008)


def impact() -> np.ndarray:
    t = t_axis(1.4)
    phase = 2 * np.pi * np.cumsum(32 + 90 * np.exp(-t / 0.08)) / RATE
    boom = np.sin(phase) * np.exp(-t / 0.5)
    crack = spectral_filter(rng.standard_normal(len(t)), low=200, high=9000) * np.exp(-t / 0.12)
    return np.tanh(1.8 * boom) + 0.5 * crack


def whoosh(seconds: float = 0.45) -> np.ndarray:
    t = t_axis(seconds)
    noise = rng.standard_normal(len(t))
    sweep = lowpass_sweep(noise, 300 + 6000 * (t / seconds) ** 2)
    return sweep * np.sin(np.pi * t / seconds) ** 2 * 2.2


def marker_swipe(seconds: float) -> np.ndarray:
    t = t_axis(seconds)
    noise = spectral_filter(rng.standard_normal(len(t)), low=2500, high=7000)
    scratch = 1 + 0.35 * np.sin(2 * np.pi * 38 * t)
    return noise * scratch * np.sin(np.pi * t / seconds) ** 0.6 * 0.5


def stamp() -> np.ndarray:
    t = t_axis(0.3)
    thud = np.sin(2 * np.pi * 95 * t) * np.exp(-t / 0.06)
    slap = spectral_filter(rng.standard_normal(len(t)), low=400, high=3500) * np.exp(-t / 0.025)
    return thud + 0.7 * slap


def puff() -> np.ndarray:
    t = t_axis(0.5)
    noise = spectral_filter(rng.standard_normal(len(t)), low=200, high=2200)
    return noise * (1 - np.exp(-t / 0.01)) * np.exp(-t / 0.14) * 0.9


def riser(seconds: float) -> np.ndarray:
    t = t_axis(seconds)
    noise = rng.standard_normal(len(t))
    shaped = lowpass_sweep(noise, 400 + 9000 * (t / seconds) ** 3)
    return shaped * (t / seconds) ** 2 * 1.4


def reverb(x: np.ndarray, seconds: float = 2.2, decay: float = 0.7) -> np.ndarray:
    """Convolve each channel with decorrelated exponentially decaying noise."""
    t = t_axis(seconds)
    out = np.zeros_like(x)
    n = x.shape[1] + len(t)
    size = 1 << (n - 1).bit_length()
    for ch in range(2):
        ir = spectral_filter(rng.standard_normal(len(t)), low=150, high=6000) * np.exp(-t / decay)
        ir /= np.sqrt(np.sum(ir ** 2))
        wet = np.fft.irfft(np.fft.rfft(x[ch], size) * np.fft.rfft(ir, size), size)
        out[ch] = wet[: x.shape[1]]
    return out


# ---------------------------------------------------------------------------
# Arrangement

PROGRESSION = [  # Fmaj7, G7, Em7, Am7: one bar each, repeated from the drop
    ('F2', ['F3', 'A3', 'C4', 'E4']),
    ('G2', ['G3', 'B3', 'D4', 'F4']),
    ('E2', ['E3', 'G3', 'B3', 'D4']),
    ('A2', ['A3', 'C4', 'E4', 'G4']),
]
FINAL = ['C3', 'G3', 'C4', 'E4', 'G4', 'B4', 'D5']
BAR = 4 * BEAT


def chords(drop: float, final: float) -> list[tuple[float, float, str, list[str]]]:
    """Whole bars of the progression from the drop; any half bar left goes F then G."""
    out, at, i = [], drop, 0
    while at + BAR <= final + 1e-6:
        root, voicing = PROGRESSION[i % len(PROGRESSION)]
        out.append((at, at + BAR, root, voicing))
        at, i = at + BAR, i + 1
    if final - at > 1e-6:
        middle = at + (final - at) / 2
        out += [(at, middle, *PROGRESSION[0]), (middle, final, *PROGRESSION[1])]
    return out


def arrange() -> np.ndarray:
    drums = np.zeros((2, SAMPLES))
    music = np.zeros((2, SAMPLES))
    fx = np.zeros((2, SAMPLES))
    drop, final = CUES['drop'], CUES['final']
    build = final - 4 * BEAT  # claps double and a riser climbs into the final hit

    # Intro: a filtered A-minor arpeggio on sixteenths opening up towards the drop,
    # silent for a breath just before it.
    intro = np.zeros(SAMPLES)
    arp = ['A3', 'C4', 'E4', 'B4', 'E4', 'C4']
    for i in range(int((drop - 0.1) / (BEAT / 4))):
        start = int(i * BEAT / 4 * RATE)
        note = pluck(hz(arp[i % len(arp)]))
        intro[start : start + len(note)] += note[: SAMPLES - start] * 0.5
    length = int((drop - 0.05) * RATE)
    sweep = 250 + 4200 * (np.arange(length) / length) ** 2
    intro[:length] = lowpass_sweep(intro[:length], sweep)
    intro[length:] = 0
    music[0] += intro * 0.9
    music[1] += intro * 0.9
    intro_beats = int(round(drop / BEAT))
    for i in range(intro_beats):
        place(drums, hat(), i * BEAT, 0.25 + 0.15 * i / intro_beats, 0.3)
    rise_from = CUES['wordSwaps'][0]
    place(fx, riser(drop - 0.1 - rise_from), rise_from, 0.35)

    # Groove from the drop to the final hit.
    sidechain = np.ones(SAMPLES)
    beat_times = np.arange(drop, final - 0.01, BEAT)
    for i, at in enumerate(beat_times):
        if at < final - BEAT:  # the kick drops out for the last beat before the hit
            place(drums, kick(), at, 0.95)
            start = int(at * RATE)
            t = np.arange(SAMPLES - start) / RATE
            sidechain[start:] -= 0.55 * np.exp(-t / 0.13)
        if i % 2 == 1:
            place(drums, clap(), at, 0.55, 0.0)
        place(drums, hat(), at + BEAT / 2, 0.3, 0.35)
        if at >= build:  # snare-like claps doubling into the build
            place(drums, clap(), at + BEAT / 2, 0.25 + 0.3 * (at - build) / (final - build), -0.2)
    sidechain = np.clip(sidechain, 0.35, 1)

    # Stabs at 0, 3/8 and 3/4 of each chord: beats 1, 2-and and 4 of a bar, city-pop style.
    rhythm = [0.0, 0.375, 0.75]
    for start, end, root, voicing in chords(drop, final):
        for offset in rhythm:
            at = start + offset * (end - start)
            if at >= end:
                continue
            for j, note in enumerate(voicing):
                place(music, electric_piano(hz(note), min(0.9, end - at), 0.8), at, 0.12, -0.3 + 0.2 * j)
        for k, at in enumerate(np.arange(start, end - 0.01, BEAT / 2)):
            place(music, sub_bass(hz(root), BEAT / 2 - 0.02), at, 0.38 if k % 2 == 0 else 0.3)
        tones = voicing + [voicing[0][:-1] + str(int(voicing[0][-1]) + 1)]  # root, an octave up
        for k, at in enumerate(np.arange(start, end - 0.01, BEAT / 4)):
            place(music, pluck(hz(tones[k % len(tones)]) * 2, 0.2), at, 0.07, 0.6 if k % 2 else -0.6)
    music *= sidechain

    # Final hit with crash and a tail that rings to the end.
    ring = min(2.6, DURATION - final - 0.2)
    for j, note in enumerate(FINAL):
        place(music, electric_piano(hz(note), ring, 1.0), final, 0.13, -0.4 + 0.13 * j)
    place(music, pad([hz(n) for n in FINAL[1:6]], ring), final, 0.5)
    place(music, sub_bass(hz('C2'), 1.2) * np.exp(-t_axis(1.2) / 0.5), final, 0.5)
    place(drums, kick(), final, 1.0)
    crash = spectral_filter(rng.standard_normal(int(1.8 * RATE)), low=3000, high=15000)
    place(drums, crash * np.exp(-t_axis(1.8) / 0.5), final, 0.35)

    # Effects on the storyboard cues.
    place(fx, impact(), drop, 0.9)
    place(fx, tick(2600), CUES['slam'], 0.35)
    for at in CUES['flashCuts']:
        place(fx, tick(3000), at, 0.3, 0.2)
    for k, at in enumerate(CUES['wordSwaps']):
        place(fx, tick(1800 + 300 * k), at, 0.35, -0.2)
    for at in CUES['whooshes']:
        place(fx, whoosh(), at - 0.32, 0.4)
    for k, at in enumerate(CUES['tiles']):
        place(fx, tick(1500 + 80 * k), at, 0.22, -0.4 + 0.16 * k)
    for k, at in enumerate(CUES['chips']):
        place(fx, tick(2000 + 90 * k), at, 0.2, 0.5 if k % 2 else -0.5)
    place(fx, marker_swipe(CUES['markerEnd'] - CUES['markerStart']), CUES['markerStart'], 0.6)
    for at in CUES['stamps']:
        place(fx, stamp(), at, 0.85)
    place(fx, puff(), CUES['puff'], 0.6)
    place(fx, riser(final - build - 0.2), build + 0.15, 0.3)

    wet = reverb(music * 0.6 + fx * 0.3)
    mix = drums + music + fx + 0.28 * wet
    # Fade the tail to silence by the last frame.
    fade = np.clip((DURATION - 0.05 - np.arange(SAMPLES) / RATE) / 0.6, 0, 1)
    mix *= fade
    return mix / np.max(np.abs(mix)) * 0.89


def write_wav(path: Path, stereo: np.ndarray):
    pcm = (np.clip(stereo.T, -1, 1) * 32767).astype('<i2')
    with wave.open(str(path), 'wb') as out:
        out.setnchannels(2)
        out.setsampwidth(2)
        out.setframerate(RATE)
        out.writeframes(pcm.tobytes())


def loudnorm(raw: Path, out: Path):
    # -2.5 dBTP leaves room for AAC overshoot, so the encoded video stays under -1.5 dBTP.
    target = 'I=-16:TP=-2.5:LRA=11'
    probe = subprocess.run(
        ['ffmpeg', '-hide_banner', '-nostats', '-i', str(raw), '-af', f'loudnorm={target}:print_format=json', '-f', 'null', '-'],
        capture_output=True, text=True, check=True,
    ).stderr
    stats = json.loads(probe[probe.rindex('{') : probe.rindex('}') + 1])
    measured = (
        f"measured_I={stats['input_i']}:measured_TP={stats['input_tp']}:measured_LRA={stats['input_lra']}"
        f":measured_thresh={stats['input_thresh']}:offset={stats['target_offset']}:linear=true"
    )
    subprocess.run(
        ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(raw),
         '-af', f'loudnorm={target}:{measured},aresample={RATE}', '-ar', str(RATE),
         '-t', str(DURATION), '-c:a', 'pcm_s16le', str(out)],
        check=True,
    )


def main():
    out = Path(sys.argv[1])
    out.parent.mkdir(parents=True, exist_ok=True)
    raw = out.with_name(out.stem + '-raw.wav')
    write_wav(raw, arrange())
    loudnorm(raw, out)
    raw.unlink()
    print(out)


if __name__ == '__main__':
    main()
