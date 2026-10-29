// Text-to-speech via edge-tts. Each line becomes a trimmed mono WAV so the timeline knows exact durations.
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const { tts } = require('./config');

const run = promisify(execFile);

async function duration(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Number(stdout.trim());
}

// Synthesises `text` to <dir>/<name>.wav and returns { file, duration }.
async function speak(text, dir, name) {
  const mp3 = path.join(dir, `${name}.mp3`), wav = path.join(dir, `${name}.wav`);
  for (let attempt = 1; ; attempt++) {
    try {
      await run(tts.bin, ['--voice', tts.voice, `--rate=${tts.rate}`, `--pitch=${tts.pitch}`, '--text', text, '--write-media', mp3], { timeout: 60000 });
      break;
    } catch (e) {
      if (attempt >= 3) throw new Error(`edge-tts failed for "${text.slice(0, 40)}": ${e.message}`);
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  // Trim leading/trailing silence so segments butt up against each other cleanly.
  const trim = 'silenceremove=start_periods=1:start_threshold=-45dB';
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp3, '-af', `${trim},areverse,${trim},areverse`, '-ac', '1', '-ar', '44100', wav]);
  fs.rmSync(mp3, { force: true });
  return { file: wav, duration: await duration(wav) };
}

module.exports = { speak, duration };
