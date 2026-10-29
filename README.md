# KUISABON — YouTube Shorts kuis otomatis

Setiap pagi (08:00 WIB) dan sore (15:00 WIB) n8n meminta service ini membuat satu video kuis
bersama Abon si kucing oren, lalu mengunggahnya ke YouTube.

```
n8n (Jadwal) ──POST /api/run──▶ kuisabon.service (host, 172.18.0.1:8797)
                                  ├─ Claude Code (Pro): Sonnet tulis soal → Opus verifikasi blind → cek duplikat (SQLite); cadangan: 9router
                                  ├─ edge-tts: suara per baris (hook, soal, A–D, jawaban, fakta, CTA)
                                  ├─ ffmpeg: mix suara + SFX (+ musik opsional), loudness -14 LUFS
                                  └─ Chromium: render quiz/template.html frame-per-frame → MP4 1080×1920
n8n ──GET video──▶ Upload YouTube ──▶ POST /api/quizzes/<id>/uploaded
```

## Topik per hari
| Hari | Topik |
|---|---|
| Senin, Selasa | Pengetahuan umum & logika |
| Rabu, Kamis | Sejarah |
| Jumat, Sabtu | Bahasa Inggris |
| Minggu | Keuangan & teknologi |

Pagi = mudah–sedang, sore = sedang–sulit. Diatur di `src/config.js`.

## Perintah
```bash
node src/cli.js run --topic sejarah --slot pagi   # buat 1 video penuh (tanpa upload)
node src/cli.js quiz --topic umum                 # hanya buat + verifikasi soal
node src/cli.js render <id>                       # render ulang soal yang tersimpan
node src/cli.js recent                            # daftar soal terakhir & statusnya
node mascot/render_preview.js                     # preview animasi Abon → preview/

systemctl --user status kuisabon                  # status service
journalctl --user -u kuisabon -f                  # log
```

## File penting
- `src/` — service: `quiz.js` (prompt, verifikasi, duplikat), `render.js` (timeline, audio, render), `server.js` (API)
- `quiz/template.html` — tampilan video kuis; `mascot/abon.js` — gambar & pose Abon
- `n8n/kuisabon-workflow.json` — workflow n8n (token disamarkan; versi yang di-import ke n8n berisi token asli)
- `assets/music/` — taruh musik bebas royalti (mp3/wav) di sini dan otomatis dipakai pelan di latar
- `.env` — rahasia (API key 9router, token service). Contoh: `.env.example`
- `data/kuisabon.db` — arsip soal; `output/` — video (dihapus otomatis setelah 7 hari)

## Setup ulang dari nol
```bash
npm install
python3 -m venv .venv && .venv/bin/pip install edge-tts
scripts/make-sfx.sh
cp .env.example .env   # isi NINEROUTER_API_KEY dan SERVICE_TOKEN
systemctl --user enable --now kuisabon
```
