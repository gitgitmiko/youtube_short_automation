// LLM client with model fallback and JSON extraction. Two backends:
//   "claude:<model>"  -> Claude Code CLI in headless mode (claude -p), using the logged-in Pro subscription
//   anything else     -> 9router's OpenAI-compatible chat endpoint
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { llm, DATA_DIR } = require('./config');

// Empty working dir so the CLI doesn't pick up any project CLAUDE.md.
const CLAUDE_CWD = path.join(DATA_DIR, 'claude-cwd');
fs.mkdirSync(CLAUDE_CWD, { recursive: true });

function chatClaude(model, messages) {
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const user = messages.filter(m => m.role !== 'system').map(m => m.content).join('\n\n');
  const args = ['-p', '--output-format', 'json', '--model', model, '--tools', '', '--strict-mcp-config',
    '--setting-sources', '', '--no-session-persistence', '--system-prompt', system];
  return new Promise((resolve, reject) => {
    const child = execFile(llm.claudeBin, args, { cwd: CLAUDE_CWD, timeout: llm.timeoutMs, maxBuffer: 4e6 }, (err, stdout, stderr) => {
      let out;
      try { out = JSON.parse(stdout); } catch { return reject(new Error(err ? `${err.message} ${stderr}`.slice(0, 300) : 'unparseable CLI output')); }
      if (out.is_error) return reject(new Error(`claude: ${out.result || out.subtype}`));
      resolve(out.result);
    });
    child.stdin.end(user);
  });
}

async function chat(model, messages, temperature) {
  if (model.startsWith('claude:')) return chatClaude(model.slice(7), messages);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), llm.timeoutMs);
  try {
    const res = await fetch(`${llm.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llm.apiKey}` },
      body: JSON.stringify({ model, messages, temperature, stream: false }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    const content = JSON.parse(text).choices?.[0]?.message?.content;
    if (!content) throw new Error('empty response');
    return content;
  } finally {
    clearTimeout(timer);
  }
}

// Pulls the first JSON object out of a reply that may be wrapped in ```json fences or prose.
function parseJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('no JSON object in reply');
  return JSON.parse(raw.slice(start, end + 1));
}

// Asks each model in turn until one returns parseable JSON. Free models are often rate-limited,
// so the whole list is retried for a few rounds with a pause in between.
async function chatJson(models, messages, { temperature = 0.7, log = () => {} } = {}) {
  const errors = [];
  for (let round = 1; round <= llm.rounds; round++) {
    for (const model of models) {
      try {
        const json = parseJson(await chat(model, messages, temperature));
        return { model, json };
      } catch (e) {
        errors.push(`${model}: ${e.message.slice(0, 120)}`);
        log(`llm ${model} failed (round ${round}): ${e.message.slice(0, 160)}`);
      }
    }
    if (round < llm.rounds) await new Promise(r => setTimeout(r, llm.roundDelayMs * round));
  }
  throw new Error(`all models failed -> ${errors.slice(-models.length).join(' | ')}`);
}

module.exports = { chatJson, parseJson };
