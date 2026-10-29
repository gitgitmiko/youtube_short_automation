// Captures mascot.html frame-by-frame and encodes it to MP4 with ffmpeg.
// Usage: node render_preview.js [outDir]
const { chromium } = require('playwright-core');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const FPS = 30, DURATION = 7;
const outDir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'preview'));
const framesDir = path.join(outDir, 'frames');

(async () => {
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });

  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || require('os').homedir() + '/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell' });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.goto('file://' + path.join(__dirname, 'mascot.html'));

  for (let f = 0; f < FPS * DURATION; f++) {
    await page.evaluate(t => window.renderFrame(t), f / FPS);
    await page.screenshot({ path: path.join(framesDir, `${String(f).padStart(4, '0')}.png`) });
  }
  // Stills of each pose for quick review.
  for (const [name, t] of [['pose_wave', 1.4], ['pose_think', 3.5], ['pose_surprised', 4.9], ['pose_win', 6.0]]) {
    await page.evaluate(t => window.renderFrame(t), t);
    await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  }
  await browser.close();

  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(framesDir, '%04d.png'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', path.join(outDir, 'mascot_preview.mp4')]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(outDir, 'pose_wave.png'), '-i', path.join(outDir, 'pose_think.png'),
    '-i', path.join(outDir, 'pose_surprised.png'), '-i', path.join(outDir, 'pose_win.png'),
    '-filter_complex', '[0][1][2][3]hstack=4,scale=1600:-1', path.join(outDir, 'poses.png')]);
  fs.rmSync(framesDir, { recursive: true, force: true });
  console.log('done:', outDir);
})();
