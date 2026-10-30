// Quiz generation: write with one model, verify blind with another, reject duplicates, shuffle options.
const crypto = require('crypto');
const config = require('./config');
const db = require('./db');
const { chatJson } = require('./llm');

const LIMITS = { hook: 60, question: 120, option: 34, fact: 180, title: 70 };

function topicFor(date = new Date()) {
  const wd = new Date(date.toLocaleString('en-US', { timeZone: config.timezone })).getDay();
  return config.schedule[wd];
}
const slotForHour = h => h < 12 ? 'pagi' : h < 18 ? 'sore' : 'malam';
function slotFor(date = new Date()) {
  const h = Number(date.toLocaleString('en-US', { timeZone: config.timezone, hour: 'numeric', hour12: false }));
  return slotForHour(h);
}

// ---- de-duplication -------------------------------------------------------------
const STOP = new Set('apa yang adalah di ke dari dan atau ini itu siapa kapan mana manakah berapa dalam untuk dengan pada sebagai the of a an is'.split(' '));
const tokens = s => new Set(s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)));
function similarity(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach(w => B.has(w) && inter++);
  return inter / (A.size + B.size - inter);
}
function duplicateReason(q, history) {
  const answer = q.options[q.answer_index].toLowerCase().trim();
  for (const h of history) {
    if (similarity(q.question, h.question) >= 0.6) return `mirip soal lama: "${h.question}"`;
  }
  // Same answer as one of the last 30 quizzes of this topic -> too repetitive.
  if (history.slice(0, 30).some(h => h.answer.toLowerCase().trim() === answer)) return `jawaban "${answer}" baru saja dipakai`;
  return null;
}

// ---- validation -----------------------------------------------------------------
function validate(q) {
  const errs = [];
  for (const k of ['hook', 'question', 'fact', 'title']) {
    if (typeof q[k] !== 'string' || !q[k].trim()) errs.push(`${k} kosong`);
    else if (q[k].length > LIMITS[k]) errs.push(`${k} terlalu panjang (${q[k].length}/${LIMITS[k]})`);
  }
  if (!Array.isArray(q.options) || q.options.length !== 4) errs.push('options harus 4');
  else {
    q.options.forEach((o, i) => { if (typeof o !== 'string' || !o.trim() || o.length > LIMITS.option) errs.push(`opsi ${i} tidak valid/terlalu panjang`); });
    if (new Set(q.options.map(o => String(o).toLowerCase().trim())).size !== 4) errs.push('ada opsi yang sama');
  }
  if (![0, 1, 2, 3].includes(q.answer_index)) errs.push('answer_index harus 0-3');
  return errs;
}

// ---- prompts --------------------------------------------------------------------
function writerPrompt(topic, slot, avoid, feedback) {
  const t = config.topics[topic];
  return [
    { role: 'system', content:
`Kamu penulis soal untuk channel YouTube Shorts kuis berbahasa Indonesia bernama ${config.channelName}, dibawakan maskot kucing oren bernama Abon.
Tulis SATU soal pilihan ganda. Aturan:
- Topik: ${t.brief}.
- Tingkat kesulitan: ${config.slots[slot].difficulty}. Menarik untuk penonton umum Indonesia.
- Hanya ada SATU jawaban yang benar dan tidak bisa diperdebatkan. Fakta harus benar dan bisa dicek (ensiklopedia/buku pelajaran).
- Hindari berita terkini, angka yang cepat berubah, politik praktis, SARA, dan hal kontroversial.
- 3 pilihan salah harus masuk akal (pengecoh), sejenis dengan jawaban benar.
- Pastikan TIDAK ADA pengecoh yang juga bisa dianggap benar, termasuk karena pengecualian teknis atau definisi lain (contoh buruk: "planet yang rotasinya berlawanan" karena Venus dan Uranus sama-sama retrograde).
- Bahasa santai tapi baku dan jelas. Jangan menyebut jawaban di dalam hook, pertanyaan, atau judul.
- Batas panjang: hook <= ${LIMITS.hook} karakter, question <= ${LIMITS.question}, tiap option <= ${LIMITS.option}, fact <= ${LIMITS.fact}, title <= ${LIMITS.title}.
Balas HANYA JSON:
{"hook": "kalimat pembuka yang bikin penasaran, contoh: Cuma 1 dari 10 orang yang tahu ini!",
 "question": "...", "options": ["...", "...", "...", "..."], "answer_index": 0,
 "fact": "satu fakta menarik singkat yang menjelaskan jawabannya",
 "title": "judul video yang memancing rasa penasaran, tanpa hashtag",
 "tags": ["3-6 tag tanpa #"]}` },
    { role: 'user', content:
`Buat soal baru.${avoid.length ? `\nJANGAN membuat soal yang mirip dengan soal-soal ini:\n- ${avoid.join('\n- ')}` : ''}${feedback ? `\nPercobaan sebelumnya ditolak karena: ${feedback}. Perbaiki.` : ''}` },
  ];
}
function verifierPrompt(q) {
  return [
    { role: 'system', content:
`Kamu pemeriksa fakta yang teliti untuk soal kuis. Jawab soal secara mandiri, lalu nilai kualitasnya. Balas HANYA JSON:
{"answer_index": 0-3, "confidence": 0.0-1.0, "ambiguous": true/false, "fact_correct": true/false, "issues": "masalah yang ditemukan atau kosong"}
- Periksa SETIAP pilihan satu per satu: apakah ada pilihan lain yang juga bisa dianggap benar, termasuk karena pengecualian teknis, definisi berbeda, atau sumber yang berbeda?
- ambiguous = true jika lebih dari satu pilihan bisa dianggap benar atau soalnya tidak jelas. Jika ragu, pilih true.
- fact_correct = false jika ada informasi yang salah di soal atau fakta.` },
    { role: 'user', content: `Soal: ${q.question}\n${q.options.map((o, i) => `${i}. ${o}`).join('\n')}\nFakta yang akan ditampilkan: ${q.fact}` },
  ];
}

function shuffle(q) {
  const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
  return { ...q, options: order.map(i => q.options[i]), answer_index: order.indexOf(q.answer_index) };
}

// Generates a verified, non-duplicate quiz. Throws after maxAttempts.
async function generateQuiz({ topic = topicFor(), slot = slotFor(), maxAttempts = 5, log = console.log } = {}) {
  if (!config.topics[topic]) throw new Error(`unknown topic "${topic}"`);
  const history = db.history(topic);
  const avoid = history.slice(0, 25).map(h => h.question);
  let feedback = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    log(`quiz attempt ${attempt}/${maxAttempts} (topic=${topic}, slot=${slot})`);
    const { model, json } = await chatJson(config.llm.models, writerPrompt(topic, slot, avoid, feedback), { temperature: 0.9, log });
    const q = { ...json, answer_index: Number(json.answer_index) };

    const errs = validate(q);
    if (errs.length) { feedback = errs.join('; '); log(`  rejected (format): ${feedback}`); continue; }
    const dup = duplicateReason(q, history);
    if (dup) { feedback = dup; avoid.unshift(q.question); log(`  rejected (duplicate): ${dup}`); continue; }

    const vr = await chatJson(config.llm.verifyModels, verifierPrompt(q), { temperature: 0, log });
    const v = vr.json;
    log(`  verified by ${vr.model}: answer ${v.answer_index}, confidence ${v.confidence}`);
    const ok = Number(v.answer_index) === q.answer_index && Number(v.confidence) >= 0.8 && v.fact_correct !== false && v.ambiguous !== true;
    if (!ok) {
      feedback = `pemeriksa fakta tidak setuju (jawabannya ${v.answer_index}, yakin ${v.confidence}, ambigu ${v.ambiguous}, fakta benar ${v.fact_correct}): ${v.issues || '-'}`;
      log(`  rejected (verify): ${feedback}`);
      continue;
    }

    const quiz = {
      ...shuffle(q),
      id: `${new Date().toISOString().slice(0, 10)}-${slot}-${crypto.randomBytes(3).toString('hex')}`,
      topic, slot, model, verifier: vr.model,
      topicLabel: config.topics[topic].label,
      tags: [...new Set([...(Array.isArray(q.tags) ? q.tags : []), ...config.topics[topic].tags].map(t => String(t).replace(/^#/, '').replace(/\s+/g, '').toLowerCase()))],
    };
    db.insert(quiz);
    log(`  accepted: ${quiz.question} -> ${quiz.options[quiz.answer_index]}`);
    return quiz;
  }
  throw new Error(`no valid quiz after ${maxAttempts} attempts; last reason: ${feedback}`);
}

module.exports = { generateQuiz, topicFor, slotFor, slotForHour, similarity, validate };
