// Background pictures for a quiz: an LLM describes two scenes (the question, then the answer) and gflow draws
// them through Google Flow. Abon stays the SVG mascot on top; these only replace the plain background.
// Any failure returns null and the video falls back to the gradient background.
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { chatJson } = require('./llm');

const run = promisify(execFile);

const STYLE = 'Bright colorful 2D cartoon illustration, clean thick outlines, soft cel shading, cheerful saturated colors, '
  + 'fully painted detailed background, vertical 9:16 composition with the main subject in the upper half and a calm, '
  + 'simple lower third. Absolutely no text, no letters, no words, no numbers, no captions, no logos, no cats. Scene: ';

const SYS = `Kamu ilustrator untuk channel YouTube Shorts kuis Indonesia. Dari satu soal pilihan ganda, tulis DUA deskripsi gambar dalam BAHASA INGGRIS (masing-masing maks 45 kata):
1. "question": adegan yang menggambarkan isi PERTANYAAN agar penonton langsung paham konteksnya. DILARANG membocorkan atau mengisyaratkan jawaban yang benar, dan jangan condong ke salah satu pilihan.
2. "answer": adegan yang menggambarkan JAWABAN BENAR dan faktanya, ditampilkan setelah jawaban dibuka. Harus terlihat jelas BERBEDA dari gambar pertama: ganti momen, sudut kamera (close-up/dari atas/wide), tempat, atau waktu, agar penonton merasakan pergantian adegan.
Aturan: adegan konkret dengan tempat, benda latar, dan cahaya yang jelas; utamakan suasana Indonesia bila cocok. Ide abstrak (logika, angka, keuangan, idiom) diubah jadi metafora visual yang mudah dipahami. Orang digambar sebagai tokoh kartun generik. Tanpa teks/huruf/angka/papan bertulisan, tanpa tokoh nyata, merek, bendera, atau karakter terkenal; tanpa kucing; sopan, tanpa kekerasan atau darah.
Balas HANYA JSON: {"question": "...", "answer": "..."}`;

async function describe(quiz, log) {
  const user = JSON.stringify({ pertanyaan: quiz.question, pilihan: quiz.options,
    jawaban_benar: quiz.options[quiz.answer_index], fakta: quiz.fact }, null, 1);
  const { json } = await chatJson(config.llm.models, [{ role: 'system', content: SYS }, { role: 'user', content: user }], { log });
  if (typeof json.question !== 'string' || typeof json.answer !== 'string') throw new Error('bad scene JSON');
  return { question: json.question.trim(), answer: json.answer.trim() };
}

function gflow(args, timeout) {
  const g = config.visual;
  // The lock is shared with any other project driving the same gflow Chrome profile: two at once fail with
  // "Profile locked". flock -w waits for the other run instead.
  return run('flock', ['-w', String(g.lockWaitSec), g.lockFile, g.bin, ...args], {
    timeout: timeout + g.lockWaitSec * 1000, maxBuffer: 8e6, env: { ...process.env, DISPLAY: g.display, GFLOW_CLI_UI_MODE: 'classic' } });
}

// gflow drives a real Chrome on a virtual display; bring Xvfb up if nothing restarted it after a reboot.
async function ensureDisplay(log) {
  const n = config.visual.display.replace(':', '');
  if (fs.existsSync(`/tmp/.X11-unix/X${n}`)) return;
  log(`no X server on ${config.visual.display}; starting Xvfb`);
  fs.rmSync(`/tmp/.X${n}-lock`, { force: true });
  require('child_process').spawn('Xvfb', [config.visual.display, '-screen', '0', '1920x1080x24', '-nolisten', 'tcp'],
    { stdio: 'ignore', detached: true }).unref();
  for (let i = 0; i < 50 && !fs.existsSync(`/tmp/.X11-unix/X${n}`); i++) await new Promise(r => setTimeout(r, 200));
}

// One Flow project holds every KUISABON picture; its id is kept in data/.
async function projectId() {
  const file = path.join(config.DATA_DIR, 'gflow-project.txt');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const { stdout } = await gflow(['project', 'create', '--name', 'kuisabon', '--json'], 300e3);
  const id = JSON.parse(stdout.slice(stdout.indexOf('{'))).project_id;
  if (!id) throw new Error('gflow project create returned no id');
  fs.writeFileSync(file, id);
  return id;
}

// Writes <workDir>/bg-question.jpg and bg-answer.jpg. Returns {question, answer} file paths, or null.
async function makeVisuals(quiz, workDir, log = console.log) {
  if (!config.visual.enabled) return null;
  try {
    const scenes = await describe(quiz, log);
    log(`visual question: ${scenes.question}`);
    log(`visual answer: ${scenes.answer}`);
    await ensureDisplay(log);
    const project = await projectId();
    const out = {}, logs = [];
    // Flow now and then turns a prompt away ("unusual activity"); a single retry after a pause usually gets it.
    for (let attempt = 1; attempt <= 2; attempt++) {
      const todo = ['question', 'answer'].filter(k => !out[k]);
      if (!todo.length) break;
      if (attempt > 1) {
        log(`visual: retrying ${todo.join(' + ')} after a pause`);
        await new Promise(r => setTimeout(r, config.visual.retryDelayMs));
      }
      const tmp = path.join(workDir, 'gflow');
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.mkdirSync(tmp, { recursive: true });
      const prompts = path.join(tmp, 'p.txt');
      fs.writeFileSync(prompts, todo.map(k => STYLE + scenes[k]).join('\n') + '\n');
      const r = await gflow(['image', 't2i', '--prompts-file', prompts, '--aspect', '9:16', '--model', config.visual.model,
        '--jitter', '10-30', '--project', project, '--out', tmp], config.visual.timeoutMs).catch(e => e);
      logs.push(`--- attempt ${attempt}\n${r.stdout || ''}\n${r.stderr || r.message || ''}`.slice(-6000));
      todo.forEach((key, n) => {
        const src = fs.readdirSync(tmp).find(f => f.startsWith(`prompt_${n}_`) && /\.(jpe?g|png)$/i.test(f));
        if (!src) return;
        out[key] = path.join(workDir, `bg-${key}${path.extname(src)}`);
        fs.renameSync(path.join(tmp, src), out[key]);
      });
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    fs.writeFileSync(path.join(workDir, 'gflow.log'), logs.join('\n'));
    if (!out.question) throw new Error('gflow made no question picture (see gflow.log)');
    if (!out.answer) log('visual: no answer picture; the question picture stays after the reveal');
    out.answer ||= out.question;
    out.scenes = scenes;
    return out;
  } catch (e) {
    log(`visual skipped: ${e.message.slice(0, 300)}`);
    return null;
  }
}

module.exports = { makeVisuals };
