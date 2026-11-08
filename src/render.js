// Turns a quiz into an MP4: TTS lines + background pictures -> timeline -> mixed audio track -> frames from
// quiz/template.html -> ffmpeg.
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const config = require('./config');
const { speak } = require('./tts');
const { makeVisuals } = require('./visual');

const run = promisify(execFile);
const SFX = name => path.join(config.ASSETS_DIR, 'sfx', `${name}.wav`);
const COUNTDOWN = 5;

function lines(q) {
  const L = 'ABCD';
  return {
    hook: q.hook,
    question: q.question,
    opt0: `${L[0]}. ${q.options[0]}`, opt1: `${L[1]}. ${q.options[1]}`,
    opt2: `${L[2]}. ${q.options[2]}`, opt3: `${L[3]}. ${q.options[3]}`,
    think: 'Waktumu lima detik!',
    reveal: `Jawabannya adalah ${L[q.answer_index]}, ${q.options[q.answer_index]}!`,
    fact: `Tahukah kamu? ${q.fact}`,
    cta: `Kamu jawab apa? Tulis di kolom komentar ya. Jangan lupa follow ${config.channelName}. Meong!`,
  };
}

// Lays the clips out back to back with small gaps; returns segment windows, audio events and duration.
function buildTimeline(clips) {
  const tl = { opts: [] }, events = [], speech = [];
  let t = 0.35;
  const place = (key, gapAfter) => {
    const c = clips[key];
    events.push({ file: c.file, at: t });
    const w = { s: t, e: t + c.duration };
    speech.push(w);
    t = w.e + gapAfter;
    return w;
  };
  events.push({ file: SFX('whoosh'), at: 0.05 });
  tl.hook = place('hook', 0.35);
  tl.question = place('question', 0.3);
  for (let i = 0; i < 4; i++) {
    events.push({ file: SFX('pop'), at: t - 0.05 });
    tl.opts.push(place(`opt${i}`, 0.2));
  }
  tl.think = place('think', 0.1);
  tl.countdown = { s: t, e: t + COUNTDOWN };
  for (let i = 0; i < COUNTDOWN; i++) events.push({ file: SFX(i === COUNTDOWN - 1 ? 'tick_last' : 'tick'), at: t + i });
  t += COUNTDOWN;
  events.push({ file: SFX('ding'), at: t });
  tl.reveal = { s: t };
  t += 0.25;
  const rv = place('reveal', 0.45);
  tl.reveal.e = rv.e;
  tl.fact = place('fact', 0.45);
  tl.cta = place('cta', 0);
  tl.duration = t + 0.9;
  tl.cta.e = tl.duration;
  return { tl, events, speech };
}

async function mixAudio(events, duration, out) {
  const music = fs.existsSync(path.join(config.ASSETS_DIR, 'music'))
    ? fs.readdirSync(path.join(config.ASSETS_DIR, 'music')).filter(f => /\.(mp3|wav|m4a|ogg)$/i.test(f)) : [];
  const args = ['-y', '-loglevel', 'error'];
  events.forEach(e => args.push('-i', e.file));
  const filters = events.map((e, i) => `[${i}]aresample=44100,aformat=channel_layouts=stereo,adelay=${Math.round(e.at * 1000)}:all=1[a${i}]`);
  let inputs = events.map((_, i) => `[a${i}]`).join('');
  let n = events.length;
  if (music.length) {
    // Optional background music: drop a royalty-free track into assets/music/ and it is looped quietly.
    const pick = music[Math.floor(Math.random() * music.length)];
    args.push('-stream_loop', '-1', '-i', path.join(config.ASSETS_DIR, 'music', pick));
    filters.push(`[${n}]aresample=44100,aformat=channel_layouts=stereo,volume=0.12[m]`);
    inputs += '[m]';
    n++;
  }
  filters.push(`${inputs}amix=inputs=${n}:normalize=0:duration=longest,atrim=0:${duration.toFixed(3)},loudnorm=I=-14:TP=-1.5:LRA=11[out]`);
  args.push('-filter_complex', filters.join(';'), '-map', '[out]', '-t', duration.toFixed(3), '-ar', '44100', out);
  await run('ffmpeg', args);
}

async function renderFrames(data, audio, out, log) {
  const fps = config.render.fps, total = Math.ceil(data.tl.duration * fps);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    '-i', audio, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out], { stdio: ['pipe', 'ignore', 'pipe'] });
  let ffErr = '';
  ff.stderr.on('data', d => ffErr += d);
  const done = new Promise((res, rej) => ff.on('close', code => code === 0 ? res() : rej(new Error(`ffmpeg exited ${code}: ${ffErr}`))));

  const browser = await chromium.launch({ executablePath: config.render.chromePath });
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    await page.goto('file://' + path.join(config.ROOT, 'quiz', 'template.html'));
    await page.evaluate(d => window.setup(d), data);
    await page.evaluate(() => Promise.all([document.fonts.ready, window.imagesReady()]));
    for (let f = 0; f < total; f++) {
      await page.evaluate(t => window.renderFrame(t), f / fps);
      const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (f % (fps * 5) === 0) log(`  frame ${f}/${total}`);
    }
  } finally {
    await browser.close();
    ff.stdin.end();
  }
  await done;
}

// Renders `quiz` into <workDir>/video.mp4 and returns its path and duration.
async function renderQuiz(quiz, workDir, log = console.log) {
  fs.mkdirSync(workDir, { recursive: true });
  log('tts + visuals...');
  const entries = Object.entries(lines(quiz));
  const [clips, pics] = await Promise.all([
    Promise.all(entries.map(async ([k, text]) => [k, await speak(text, workDir, k)])).then(Object.fromEntries),
    makeVisuals(quiz, workDir, log),
  ]);
  const visual = pics && { question: 'file://' + pics.question, answer: 'file://' + pics.answer };
  const { tl, events, speech } = buildTimeline(clips);
  log(`timeline: ${tl.duration.toFixed(1)}s`);
  const audio = path.join(workDir, 'audio.wav');
  await mixAudio(events, tl.duration, audio);
  log('rendering frames...');
  const video = path.join(workDir, 'video.mp4');
  await renderFrames({ quiz, tl, speech, visual }, audio, video, log);
  // Keep only the final video (and gflow's log, for diagnosing missing pictures) in the work dir.
  for (const f of fs.readdirSync(workDir)) if (!['video.mp4', 'gflow.log'].includes(f)) fs.rmSync(path.join(workDir, f), { force: true });
  return { video, duration: tl.duration, scenes: pics && pics.scenes };
}

module.exports = { renderQuiz, buildTimeline, lines };
