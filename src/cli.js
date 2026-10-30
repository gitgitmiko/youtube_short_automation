#!/usr/bin/env node
// Usage:
//   node src/cli.js run [--topic umum|sejarah|inggris|keuangan] [--slot pagi|sore|malam] full job, prints result JSON
//   node src/cli.js quiz [--topic ...] [--slot ...]                                   only generate + verify a quiz
//   node src/cli.js render <id>                                                        re-render a stored quiz
//   node src/cli.js recent                                                             list recent quizzes
const { runJob } = require('./pipeline');
const { generateQuiz } = require('./quiz');
const { renderQuiz } = require('./render');
const path = require('path');
const config = require('./config');
const db = require('./db');

const [cmd, ...rest] = process.argv.slice(2);
const opt = k => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : undefined; };

(async () => {
  if (cmd === 'run') {
    const r = await runJob({ topic: opt('topic'), slot: opt('slot') });
    console.log(JSON.stringify({ ...r, quiz: undefined }, null, 2));
  } else if (cmd === 'quiz') {
    console.log(JSON.stringify(await generateQuiz({ topic: opt('topic'), slot: opt('slot') }), null, 2));
  } else if (cmd === 'render') {
    const q = db.get(rest[0]);
    if (!q) throw new Error(`quiz ${rest[0]} not found`);
    const r = await renderQuiz(q.data, path.join(config.OUTPUT_DIR, q.id));
    db.update(q.id, { status: 'rendered', video_path: r.video, error: null });
    console.log(r.video);
  } else if (cmd === 'recent') {
    console.table(db.recent(Number(opt('limit') || 20)));
  } else {
    console.log('commands: run | quiz | render <id> | recent   (options: --topic, --slot, --limit)');
    process.exit(1);
  }
})().catch(e => { console.error(e.message); process.exit(1); });
