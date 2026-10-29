// Read-only views for the dashboard: today's schedule, history of runs, and service logs.
const { execFile } = require('child_process');
const { promisify } = require('util');
const config = require('./config');
const db = require('./db');
const { topicFor } = require('./quiz');

const run = promisify(execFile);
const TZ_OFFSET = '+07:00';   // Asia/Jakarta has no DST
const STATUSES = ['uploaded', 'rendered', 'running', 'failed'];

const localDate = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: config.timezone });
const toIso = sqlTime => sqlTime && sqlTime.replace(' ', 'T') + 'Z';
// SQLite stores UTC "YYYY-MM-DD HH:MM:SS"; this converts a WIB wall-clock moment to that format.
const sqlUtc = (date, time = '00:00') => new Date(`${date}T${time}:00${TZ_OFFSET}`).toISOString().slice(0, 19).replace('T', ' ');
const youtubeUrl = id => id ? `https://www.youtube.com/shorts/${id}` : null;

// One run as the dashboard sees it. Upload state lives on the quiz (set by n8n), render state on the run.
function view(r) {
  const q = r.data ? JSON.parse(r.data) : null;
  let status = r.status, error = r.error;
  if (r.status === 'rendered' && r.quiz_status === 'uploaded') status = 'uploaded';
  else if (r.status === 'rendered' && r.quiz_status === 'failed') { status = 'failed'; error = `Upload gagal: ${r.quiz_error || '-'}`; }
  const started = toIso(r.started_at), finished = toIso(r.finished_at);
  return {
    id: r.id, started_at: started, finished_at: finished,
    duration_s: finished ? Math.round((new Date(finished) - new Date(started)) / 1000) || null : null,
    slot: r.slot, topic: r.topic, topicLabel: config.topics[r.topic]?.label || r.topic,
    status, stage: r.stage, error,
    quiz: q && {
      id: q.id, question: q.question, answer: q.options[q.answer_index], title: q.title,
      writer: q.model, verifier: q.verifier || null,
      youtube_id: r.youtube_id || null, youtube_url: youtubeUrl(r.youtube_id),
      thumb: r.youtube_id ? `https://i.ytimg.com/vi/${r.youtube_id}/default.jpg` : null,
    },
  };
}

function nextSlot(now = new Date()) {
  for (let day = 0; day < 8; day++) {
    const d = new Date(now.getTime() + day * 86400e3);
    const date = localDate(d);
    for (const time of config.uploadTimes) {
      const at = new Date(`${date}T${time}:00${TZ_OFFSET}`);
      if (at > now) {
        const topic = topicFor(at);
        return { at: at.toISOString(), time, slot: Number(time.slice(0, 2)) < 12 ? 'pagi' : 'sore', topic, topicLabel: config.topics[topic].label };
      }
    }
  }
  return null;
}

function overview({ busy, stage }) {
  const now = new Date(), today = localDate(now);
  const todayRuns = db.runs({ from: sqlUtc(today) }).map(view);
  const weekRuns = db.runs({ from: sqlUtc(localDate(new Date(now - 6 * 86400e3))) }).map(view);
  const count = (list, s) => list.filter(r => r.status === s).length;
  const lastUploaded = db.runs({ limit: 50 }).map(view).find(r => r.status === 'uploaded');

  // Match each scheduled time with the run n8n started around it.
  const schedule = config.uploadTimes.map(time => {
    const at = new Date(`${today}T${time}:00${TZ_OFFSET}`);
    const r = todayRuns.find(x => { const t = new Date(x.started_at) - at; return t >= -10 * 60e3 && t <= 90 * 60e3; });
    const topic = topicFor(at);
    return {
      time, slot: Number(time.slice(0, 2)) < 12 ? 'pagi' : 'sore', topic, topicLabel: config.topics[topic].label,
      status: r ? r.status : now > new Date(at.getTime() + 20 * 60e3) ? 'missed' : 'waiting',
      run: r || null,
    };
  });

  const rotation = [['Senin', 1], ['Selasa', 2], ['Rabu', 3], ['Kamis', 4], ['Jumat', 5], ['Sabtu', 6], ['Minggu', 0]]
    .map(([day, wd]) => ({ day, topicLabel: config.topics[config.schedule[wd]].label }));

  return {
    now: now.toISOString(),
    service: { busy, stage, uptime_s: Math.round(process.uptime()) },
    today: { uploaded: count(todayRuns, 'uploaded'), failed: count(todayRuns, 'failed'), planned: config.uploadTimes.length },
    week: { uploaded: count(weekRuns, 'uploaded'), failed: count(weekRuns, 'failed') },
    next: nextSlot(now),
    last: lastUploaded ? { at: lastUploaded.finished_at, title: lastUploaded.quiz.title, question: lastUploaded.quiz.question,
                           youtube_url: lastUploaded.quiz.youtube_url, thumb: lastUploaded.quiz.thumb } : null,
    schedule, rotation,
    llm: { writers: config.llm.models, verifiers: config.llm.verifyModels },
    topics: Object.fromEntries(Object.entries(config.topics).map(([k, t]) => [k, t.label])),
  };
}

function history(params) {
  const page = Math.max(1, Number(params.get('page')) || 1);
  const pageSize = [10, 25, 50, 100].includes(Number(params.get('pageSize'))) ? Number(params.get('pageSize')) : 10;
  const status = STATUSES.includes(params.get('status')) ? params.get('status') : null;
  const topic = config.topics[params.get('topic')] ? params.get('topic') : null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') || '') ? params.get('date') : null;
  const range = date ? { from: sqlUtc(date), to: sqlUtc(localDate(new Date(new Date(`${date}T12:00:00${TZ_OFFSET}`).getTime() + 86400e3))) } : {};
  // Status is derived from two tables, so filter after mapping (history stays small: 2 runs/day).
  const all = db.runs({ ...range, topic }).map(view).filter(r => !status || r.status === status);
  const totalPages = Math.max(1, Math.ceil(all.length / pageSize));
  const p = Math.min(page, totalPages);
  return { page: p, pageSize, total: all.length, totalPages, runs: all.slice((p - 1) * pageSize, p * pageSize) };
}

async function logs(params) {
  const lines = Math.min(1000, Math.max(20, Number(params.get('lines')) || 200));
  try {
    const { stdout } = await run('journalctl', ['--user', '-u', 'kuisabon', '-n', String(lines), '--no-pager', '-o', 'cat'], { maxBuffer: 4e6 });
    // Per-frame render progress is noise on the dashboard.
    return { lines: stdout.split('\n').filter(l => l && !/^\S+\s+frame \d+\/\d+$/.test(l)) };
  } catch (e) {
    return { lines: [], error: `journalctl tidak bisa dibaca: ${e.message}` };
  }
}

module.exports = { overview, history, logs };
