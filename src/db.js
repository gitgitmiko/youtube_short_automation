// Quiz archive (SQLite via node:sqlite): used to avoid repeating questions and to track uploads.
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { DATA_DIR } = require('./config');

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'kuisabon.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS quizzes (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    topic TEXT NOT NULL,
    slot TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    data TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'generated',   -- generated | rendered | uploaded | failed
    video_path TEXT,
    youtube_id TEXT,
    error TEXT
  );
  CREATE INDEX IF NOT EXISTS quizzes_topic ON quizzes(topic, created_at);
  -- One row per /api/run call, so failures before a quiz exists (e.g. every LLM down) are visible too.
  CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT,
    slot TEXT NOT NULL,
    topic TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',   -- running | rendered | failed
    stage TEXT,
    quiz_id TEXT,
    error TEXT
  );
  CREATE INDEX IF NOT EXISTS runs_started ON runs(started_at);
`);
// Backfill: quizzes rendered before the runs table existed.
if (!db.prepare('SELECT 1 FROM runs LIMIT 1').get()) {
  db.exec(`INSERT INTO runs (started_at, finished_at, slot, topic, status, quiz_id, error)
           SELECT created_at, created_at, slot, topic, CASE WHEN status = 'failed' THEN 'failed' ELSE 'rendered' END, id, error
           FROM quizzes WHERE status IN ('rendered', 'uploaded', 'failed') ORDER BY created_at`);
}

module.exports = {
  insert(q) {
    db.prepare('INSERT INTO quizzes (id, topic, slot, question, answer, data) VALUES (?, ?, ?, ?, ?, ?)')
      .run(q.id, q.topic, q.slot, q.question, q.options[q.answer_index], JSON.stringify(q));
  },
  update(id, fields) {
    const keys = Object.keys(fields);
    db.prepare(`UPDATE quizzes SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`)
      .run(...keys.map(k => fields[k]), id);
  },
  get(id) {
    const row = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(id);
    return row && { ...row, data: JSON.parse(row.data) };
  },
  // Questions that count for de-duplication: everything except failed renders.
  history(topic, limit = 500) {
    return db.prepare(`SELECT question, answer FROM quizzes WHERE topic = ? AND status != 'failed'
                       ORDER BY created_at DESC LIMIT ?`).all(topic, limit);
  },
  // Called once when the server starts: a run still marked running was cut off by a restart or crash.
  failStaleRuns() {
    db.exec(`UPDATE runs SET status = 'failed', error = 'service berhenti/restart saat proses berjalan', finished_at = datetime('now')
             WHERE status = 'running'`);
  },
  startRun(slot, topic) {
    return Number(db.prepare('INSERT INTO runs (slot, topic, stage) VALUES (?, ?, ?)').run(slot, topic, 'Membuat soal').lastInsertRowid);
  },
  updateRun(id, fields) {
    const keys = Object.keys(fields);
    db.prepare(`UPDATE runs SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map(k => fields[k]), id);
  },
  // Runs joined with their quiz, newest first. Filters: status (combined), topic, date (YYYY-MM-DD, UTC range given by caller).
  runs({ from, to, topic, limit = 1000, offset = 0 } = {}) {
    const where = [], args = [];
    if (from) { where.push('r.started_at >= ?'); args.push(from); }
    if (to) { where.push('r.started_at < ?'); args.push(to); }
    if (topic) { where.push('r.topic = ?'); args.push(topic); }
    return db.prepare(`SELECT r.*, q.status AS quiz_status, q.youtube_id, q.data, q.error AS quiz_error
                       FROM runs r LEFT JOIN quizzes q ON q.id = r.quiz_id
                       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                       ORDER BY r.started_at DESC, r.id DESC LIMIT ? OFFSET ?`).all(...args, limit, offset);
  },
  recent(limit = 20) {
    return db.prepare(`SELECT id, created_at, topic, slot, question, answer, status, youtube_id, error
                       FROM quizzes ORDER BY created_at DESC LIMIT ?`).all(limit);
  },
};
