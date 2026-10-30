// One full job: generate a verified quiz, render the video, and prepare YouTube metadata.
const fs = require('fs');
const path = require('path');
const config = require('./config');
const db = require('./db');
const { generateQuiz, topicFor, slotFor } = require('./quiz');
const { renderQuiz } = require('./render');

function metadata(q) {
  const tags = [...new Set(['kuis', 'kuisabon', 'shorts', 'tebaktebakan', ...q.tags])];
  const title = `${q.title} #shorts`.slice(0, 100);
  const description = [
    q.question,
    '',
    'Kamu jawab apa? Tulis di kolom komentar! 👇',
    '',
    `${config.channelName}: kuis seru bareng Abon si kucing oren, setiap hari. Jangan lupa subscribe!`,
    '',
    tags.slice(0, 12).map(t => `#${t}`).join(' '),
  ].join('\n');
  return { title, description, tags: tags.slice(0, 15) };
}

// Deletes rendered videos older than keepDays.
function cleanup() {
  if (!fs.existsSync(config.OUTPUT_DIR)) return;
  const cutoff = Date.now() - config.render.keepDays * 86400e3;
  for (const d of fs.readdirSync(config.OUTPUT_DIR)) {
    const p = path.join(config.OUTPUT_DIR, d);
    if (fs.statSync(p).mtimeMs < cutoff) fs.rmSync(p, { recursive: true, force: true });
  }
}

async function runJob({ topic = topicFor(), slot = slotFor(), log = console.log, onStage = () => {} } = {}) {
  const started = Date.now();
  const runId = db.startRun(slot, topic);
  const stage = name => { db.updateRun(runId, { stage: name }); onStage(name); };
  let quiz;
  try {
    stage('Membuat soal');
    quiz = await generateQuiz({ topic, slot, log });
    db.updateRun(runId, { quiz_id: quiz.id });
    stage('Render video');
    const { video, duration } = await renderQuiz(quiz, path.join(config.OUTPUT_DIR, quiz.id), log);
    db.update(quiz.id, { status: 'rendered', video_path: video });
    db.updateRun(runId, { status: 'rendered', stage: null, finished_at: new Date().toISOString().slice(0, 19).replace('T', ' ') });
    cleanup();
    log(`done in ${((Date.now() - started) / 1000).toFixed(0)}s -> ${video}`);
    return { id: quiz.id, topic: quiz.topic, slot: quiz.slot, duration, video_path: video, quiz, ...metadata(quiz) };
  } catch (e) {
    const error = String(e.message).slice(0, 1000);
    if (quiz) db.update(quiz.id, { status: 'failed', error });
    db.updateRun(runId, { status: 'failed', error, finished_at: new Date().toISOString().slice(0, 19).replace('T', ' ') });
    throw e;
  } finally {
    onStage(null);
  }
}

module.exports = { runJob, metadata };
