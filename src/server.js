// HTTP API that n8n calls. Binds to the docker bridge so only the host and containers can reach it.
//   GET  /health
//   POST /api/run                     {topic?, slot?}  -> generates + renders, returns metadata + video_url
//   GET  /api/videos/<id>.mp4         the rendered video
//   POST /api/quizzes/<id>/uploaded   {youtube_id}     -> marks the quiz as uploaded
//   POST /api/quizzes/<id>/failed     {error}          -> marks the upload as failed
//   GET  /api/quizzes?limit=20
//   GET  /api/monitor/overview | /api/monitor/history?page&pageSize&status&topic&date | /api/monitor/logs?lines
//        read-only views for the dashboard-gitgit "YouTube" tab
const http = require('http');
const fs = require('fs');
const config = require('./config');
const db = require('./db');
const { runJob } = require('./pipeline');
const monitor = require('./monitor');

let busy = false, stage = null;
db.failStaleRuns();
const log = (...a) => console.log(new Date().toISOString(), ...a);

function send(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', d => { s += d; if (s.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/health') return send(res, 200, { ok: true, busy });
    if (config.server.token && req.headers['x-token'] !== config.server.token) return send(res, 401, { error: 'bad token' });

    if (req.method === 'POST' && url.pathname === '/api/run') {
      if (busy) return send(res, 409, { error: 'a job is already running' });
      busy = true;
      const body = await readJson(req);
      req.setTimeout(0);
      try {
        const r = await runJob({ topic: body.topic, slot: body.slot, log, onStage: s => { stage = s; } });
        return send(res, 200, { ...r, quiz: undefined, question: r.quiz.question, answer: r.quiz.options[r.quiz.answer_index],
          video_url: `http://${config.server.host}:${config.server.port}/api/videos/${r.id}.mp4` });
      } finally { busy = false; }
    }

    let m;
    if (req.method === 'GET' && (m = url.pathname.match(/^\/api\/videos\/([\w-]+)\.mp4$/))) {
      const q = db.get(m[1]);
      if (!q?.video_path || !fs.existsSync(q.video_path)) return send(res, 404, { error: 'video not found' });
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': fs.statSync(q.video_path).size });
      return fs.createReadStream(q.video_path).pipe(res);
    }
    if (req.method === 'POST' && (m = url.pathname.match(/^\/api\/quizzes\/([\w-]+)\/(uploaded|failed)$/))) {
      if (!db.get(m[1])) return send(res, 404, { error: 'quiz not found' });
      const body = await readJson(req);
      db.update(m[1], m[2] === 'uploaded'
        ? { status: 'uploaded', youtube_id: String(body.youtube_id || '') }
        : { status: 'failed', error: String(body.error || 'upload failed').slice(0, 1000) });
      log(`quiz ${m[1]} -> ${m[2]}`);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/api/monitor/overview') return send(res, 200, monitor.overview({ busy, stage }));
    if (req.method === 'GET' && url.pathname === '/api/monitor/history') return send(res, 200, monitor.history(url.searchParams));
    if (req.method === 'GET' && url.pathname === '/api/monitor/logs') return send(res, 200, await monitor.logs(url.searchParams));
    if (req.method === 'GET' && url.pathname === '/api/quizzes') {
      return send(res, 200, db.recent(Number(url.searchParams.get('limit') || 20)));
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    log('error:', e.message);
    if (!res.headersSent) send(res, 500, { error: e.message });
  }
});
server.requestTimeout = 0;
server.headersTimeout = 60000;
server.listen(config.server.port, config.server.host, () => log(`kuisabon listening on ${config.server.host}:${config.server.port}`));
