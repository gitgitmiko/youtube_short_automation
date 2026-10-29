#!/usr/bin/env bash
# Synthesises the sound effects with ffmpeg so no third-party audio (and no copyright claim) is involved.
set -euo pipefail
cd "$(dirname "$0")/../assets/sfx"
ff() { ffmpeg -y -loglevel error "$@"; }

# Clock tick for the countdown.
ff -f lavfi -i "sine=f=1800:d=0.06" -af "afade=t=out:st=0.01:d=0.05,volume=0.6" tick.wav
# Last-second tick, lower and longer.
ff -f lavfi -i "sine=f=1200:d=0.12" -af "afade=t=out:st=0.02:d=0.1,volume=0.7" tick_last.wav
# "Correct" chime: two bell-like partials with a decay.
ff -f lavfi -i "sine=f=1046.5:d=0.9" -f lavfi -i "sine=f=1568:d=0.9" -f lavfi -i "sine=f=2093:d=0.9" \
   -filter_complex "[0][1][2]amix=inputs=3,afade=t=out:st=0.05:d=0.85,volume=1.8" ding.wav
# Whoosh for the hook / transitions: filtered noise with a swell.
ff -f lavfi -i "anoisesrc=d=0.45:c=pink:a=0.5" -af "highpass=f=400,lowpass=f=3000,afade=t=in:d=0.2,afade=t=out:st=0.2:d=0.25" whoosh.wav
# Pop for the options sliding in.
ff -f lavfi -i "sine=f=600:d=0.08" -af "asetrate=44100*1.5,aresample=44100,afade=t=out:st=0.01:d=0.07,volume=0.5" pop.wav
echo "sfx ok"
