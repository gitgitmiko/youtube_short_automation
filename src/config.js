// Central configuration. Secrets and machine-specific values come from .env (see .env.example).
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Minimal .env loader so the service has no runtime dependencies besides playwright-core.
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv(path.join(ROOT, '.env'));

const env = (k, d) => process.env[k] ?? d;
const list = (k, d) => env(k, d).split(',').map(s => s.trim()).filter(Boolean);

module.exports = {
  ROOT,
  DATA_DIR: path.join(ROOT, 'data'),
  OUTPUT_DIR: path.join(ROOT, 'output'),
  ASSETS_DIR: path.join(ROOT, 'assets'),

  channelName: 'KUISABON',
  timezone: 'Asia/Jakarta',

  llm: {
    baseUrl: env('NINEROUTER_BASE_URL', 'http://127.0.0.1:20128/v1'),
    apiKey: env('NINEROUTER_API_KEY', ''),
    // Tried in order. "claude:*" goes through the Claude Code CLI (Pro subscription); the rest through 9router.
    // The verifier uses a different model than the writer for an independent check.
    models: list('LLM_MODELS', 'claude:sonnet,gemini/gemini-3-flash-preview,gemini-free,openrouter/nvidia/nemotron-3.5-super-vl:free,openrouter/poolside/laguna-s-2.1:free,openrouter/google/gemma-4-31b-it:free'),
    verifyModels: list('LLM_VERIFY_MODELS', 'claude:opus,openrouter/nvidia/nemotron-3.5-super-vl:free,gemini/gemini-3-flash-preview,openrouter/poolside/laguna-s-2.1:free,gemini-free'),
    timeoutMs: Number(env('LLM_TIMEOUT_MS', 90000)),
    claudeBin: env('CLAUDE_BIN', path.join(require('os').homedir(), '.local', 'bin', 'claude')),
    rounds: Number(env('LLM_ROUNDS', 3)),          // passes over the model list before giving up
    roundDelayMs: Number(env('LLM_ROUND_DELAY_MS', 30000)),
  },

  tts: {
    bin: env('EDGE_TTS_BIN', path.join(ROOT, '.venv', 'bin', 'edge-tts')),
    voice: env('TTS_VOICE', 'id-ID-GadisNeural'),
    rate: env('TTS_RATE', '+8%'),
    pitch: env('TTS_PITCH', '+20Hz'),
  },

  render: {
    fps: Number(env('RENDER_FPS', 30)),
    chromePath: env('CHROME_PATH', path.join(require('os').homedir(),
      '.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell')),
    keepDays: Number(env('KEEP_VIDEOS_DAYS', 7)),
  },

  server: {
    host: env('HOST', '172.18.0.1'),   // docker bridge of the n8n network, reachable from the n8n container
    port: Number(env('PORT', 8797)),
    token: env('SERVICE_TOKEN', ''),
  },

  // Upload times set in the n8n "Jadwal" node (WIB). Only used by the monitoring endpoints; keep in sync.
  uploadTimes: list('UPLOAD_TIMES', '08:00,15:00'),

  // Weekday (0 = Sunday) -> topic key.
  schedule: { 1: 'umum', 2: 'umum', 3: 'sejarah', 4: 'sejarah', 5: 'inggris', 6: 'inggris', 0: 'keuangan' },

  topics: {
    umum: {
      label: 'PENGETAHUAN UMUM',
      brief: 'pengetahuan umum dan logika ringan: sains sehari-hari, geografi, hewan, tubuh manusia, luar angkasa, teka-teki logika sederhana',
      tags: ['pengetahuanumum', 'kuislogika', 'faktaunik'],
    },
    sejarah: {
      label: 'SEJARAH',
      brief: 'sejarah Indonesia (kerajaan Nusantara, pergerakan nasional, kemerdekaan, pahlawan) dan sejarah dunia yang terkenal',
      tags: ['sejarah', 'sejarahindonesia', 'kuissejarah'],
    },
    inggris: {
      label: 'BAHASA INGGRIS',
      brief: 'bahasa Inggris untuk orang Indonesia: arti kosakata, idiom, phrasal verb, sinonim, atau grammar dasar. Pertanyaan ditulis dalam bahasa Indonesia, kata/kalimat bahasa Inggris diberi tanda kutip',
      tags: ['belajarbahasainggris', 'englishquiz', 'kosakatainggris'],
    },
    keuangan: {
      label: 'KEUANGAN & TEKNOLOGI',
      brief: 'literasi keuangan dasar (menabung, bunga, inflasi, investasi, istilah keuangan) dan teknologi/AI/internet secara umum. Hindari angka atau harga yang cepat berubah dan jangan memberi saran investasi',
      tags: ['literasikeuangan', 'teknologi', 'kuisteknologi'],
    },
  },

  slots: {
    pagi: { difficulty: 'mudah sampai sedang' },
    sore: { difficulty: 'sedang sampai agak sulit' },
  },
};
