// Abon, the KUISABON mascot: a sitting orange tabby cat. renderFrame(t) draws the scene at
// time t (seconds), so frames can be captured deterministically (same idea as Remotion's useCurrentFrame).

const C = {
  fur: '#F28C28', furShade: '#D9731F', stripe: '#C25E12', white: '#FFF4E6',
  pink: '#F59AAE', earPink: '#F7B2BF',
  shirt: '#141414', shirtHi: '#262626',
  line: '#3A2214', mouth: '#5A1A1F', tongue: '#F07A86',
  iris: '#8CCB5E', blush: '#FF7F8A',
};

function rng(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }

// ---- head parts -----------------------------------------------------------------
function ears(t, perk) {
  const twitch = Math.sin(t * 9) > 0.92 ? 6 : 0;   // occasional ear flick
  const l = `M352 770 L${372 - perk} ${520 - perk} L505 655 Z`, li = `M382 735 L${392 - perk * 0.7} ${585 - perk * 0.7} L470 665 Z`;
  return `
    <g transform="rotate(${-twitch} 430 690)"><path d="${l}" fill="${C.fur}" stroke="${C.furShade}" stroke-width="6" stroke-linejoin="round"/><path d="${li}" fill="${C.earPink}"/></g>
    <g transform="scale(-1 1) translate(-1080 0)"><path d="${l}" fill="${C.fur}" stroke="${C.furShade}" stroke-width="6" stroke-linejoin="round"/><path d="${li}" fill="${C.earPink}"/></g>`;
}
function headShape() {
  // Round head with fluffy cheek tufts.
  return `<path d="M335 850 Q322 648 540 640 Q758 648 745 850 L782 888 L748 905 L772 945 L728 955 Q690 1072 540 1078 Q390 1072 352 955 L308 945 L332 905 L298 888 Z"
            fill="${C.fur}" stroke="${C.furShade}" stroke-width="6" stroke-linejoin="round"/>
          <!-- tabby stripes -->
          <g fill="${C.stripe}">
            <path d="M528 648 L540 735 L552 648 Z"/>
            <path d="M478 655 Q482 700 500 722 Q494 690 498 652 Z"/>
            <path d="M602 655 Q598 700 580 722 Q586 690 582 652 Z"/>
            <path d="M300 888 L380 900 L310 912 Z"/><path d="M318 935 L385 932 L330 950 Z"/>
            <path d="M780 888 L700 900 L770 912 Z"/><path d="M762 935 L695 932 L750 950 Z"/>
          </g>`;
}
function eye(cx, cy, open, look, wide) {
  if (open === 'happy')
    return `<path d="M${cx - 40} ${cy + 10} Q${cx} ${cy - 34} ${cx + 40} ${cy + 10}" fill="none" stroke="${C.line}" stroke-width="10" stroke-linecap="round"/>`;
  if (open < 0.12)
    return `<path d="M${cx - 40} ${cy} Q${cx} ${cy + 14} ${cx + 40} ${cy}" fill="none" stroke="${C.line}" stroke-width="8" stroke-linecap="round"/>`;
  const rx = wide ? 52 : 46, ry = (wide ? 58 : 50) * open, id = `eye${cx}`;
  const px = cx + look.x, py = cy + look.y;
  return `
    <clipPath id="${id}"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/></clipPath>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#FFFDF7"/>
    <g clip-path="url(#${id})">
      <circle cx="${px}" cy="${py}" r="34" fill="${C.iris}"/>
      <circle cx="${px}" cy="${py}" r="34" fill="none" stroke="#5E9A3A" stroke-width="5"/>
      ${wide ? `<circle cx="${px}" cy="${py}" r="20" fill="#0E0806"/>` : `<ellipse cx="${px}" cy="${py}" rx="9" ry="27" fill="#0E0806"/>`}
      <circle cx="${px + 12}" cy="${py - 14}" r="9" fill="#fff"/>
      <circle cx="${px - 10}" cy="${py + 14}" r="4" fill="#fff" opacity=".8"/>
    </g>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${C.line}" stroke-width="7"/>`;
}
function brow(cx, cy, lift, flip) {
  const d = flip ? -1 : 1;
  return `<path d="M${cx - 30 * d} ${cy + 4} Q${cx - 2 * d} ${cy - 12 - lift} ${cx + 28 * d} ${cy - 2 - lift * 0.6}"
           fill="none" stroke="${C.stripe}" stroke-width="11" stroke-linecap="round"/>`;
}
function mouth(kind, open) {
  const y = 942;  // where the mouth splits under the nose
  if (kind === 'smile')
    return `<path d="M540 ${y - 18} L540 ${y}" stroke="${C.line}" stroke-width="6" stroke-linecap="round"/>
            <path d="M500 ${y + 2} Q518 ${y + 24} 540 ${y} Q562 ${y + 24} 580 ${y + 2}" fill="none" stroke="${C.line}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (kind === 'o') {
    const h = 22 + open * 12;
    return `<ellipse cx="540" cy="${y + 22}" rx="20" ry="${h}" fill="${C.mouth}" stroke="${C.line}" stroke-width="5"/>
            <ellipse cx="540" cy="${y + 22 + h * 0.5}" rx="12" ry="${h * 0.35}" fill="${C.tongue}"/>`;
  }
  const w = kind === 'grin' ? 58 : 40, h = kind === 'grin' ? 52 : 10 + open * 40;
  return `<path d="M540 ${y - 18} L540 ${y}" stroke="${C.line}" stroke-width="6" stroke-linecap="round"/>
          <path d="M${540 - w} ${y} Q540 ${y + 8} ${540 + w} ${y} Q${540 + w * 0.6} ${y + h + 14} 540 ${y + h + 16} Q${540 - w * 0.6} ${y + h + 14} ${540 - w} ${y} Z"
            fill="${C.mouth}" stroke="${C.line}" stroke-width="5" stroke-linejoin="round"/>
          <path d="M${540 - w * 0.55} ${y + 4} l8 16 l8 -14 Z M${540 + w * 0.55} ${y + 4} l-8 16 l-8 -14 Z" fill="#fff"/>
          <ellipse cx="540" cy="${y + h + 4}" rx="${w * 0.5}" ry="${Math.max(4, h * 0.3)}" fill="${C.tongue}"/>`;
}
function whiskers(t) {
  const w = Math.sin(t * 3) * 3;
  let s = `<g stroke="${C.line}" stroke-width="4" stroke-linecap="round" fill="none" opacity=".75">`;
  [[-14, 930], [0, 950], [14, 970]].forEach(([dy, y]) => {
    s += `<path d="M470 ${y - 8} Q400 ${y - 12 + dy * 0.6} ${330} ${y - 20 + dy * 1.6 + w}"/>`;
    s += `<path d="M610 ${y - 8} Q680 ${y - 12 + dy * 0.6} ${750} ${y - 20 + dy * 1.6 - w}"/>`;
  });
  return s + '</g>';
}
function face(st, t) {
  return `
    ${ears(t, st.perk)}
    ${headShape()}
    <ellipse cx="415" cy="915" rx="38" ry="20" fill="${C.blush}" opacity=".35"/>
    <ellipse cx="665" cy="915" rx="38" ry="20" fill="${C.blush}" opacity=".35"/>
    ${brow(450, 762, st.browL, false)}
    ${brow(630, 762, st.browR, true)}
    ${eye(450, 835, st.eyeOpen, st.look, st.wide)}
    ${eye(630, 835, st.eyeOpen, st.look, st.wide)}
    <!-- white muzzle -->
    <ellipse cx="508" cy="955" rx="52" ry="40" fill="${C.white}"/>
    <ellipse cx="572" cy="955" rx="52" ry="40" fill="${C.white}"/>
    <ellipse cx="540" cy="1000" rx="42" ry="30" fill="${C.white}"/>
    ${mouth(st.mouth, st.open)}
    <path d="M518 904 Q540 896 562 904 Q554 922 540 926 Q526 922 518 904 Z" fill="${C.pink}" stroke="${C.line}" stroke-width="4" stroke-linejoin="round"/>
    <ellipse cx="533" cy="905" rx="6" ry="3" fill="#fff" opacity=".7"/>
    ${whiskers(t)}`;
}

// ---- body, paws, tail ------------------------------------------------------------
function paw(x, y, rot, beans = true) {
  return `<g transform="translate(${x} ${y}) rotate(${rot})">
    <ellipse cx="0" cy="0" rx="52" ry="50" fill="${C.fur}" stroke="${C.furShade}" stroke-width="5"/>
    <circle cx="-30" cy="-38" r="17" fill="${C.fur}" stroke="${C.furShade}" stroke-width="5"/>
    <circle cx="-10" cy="-50" r="18" fill="${C.fur}" stroke="${C.furShade}" stroke-width="5"/>
    <circle cx="12" cy="-50" r="18" fill="${C.fur}" stroke="${C.furShade}" stroke-width="5"/>
    <circle cx="32" cy="-38" r="17" fill="${C.fur}" stroke="${C.furShade}" stroke-width="5"/>
    <ellipse cx="0" cy="0" rx="47" ry="45" fill="${C.fur}"/>
    ${beans ? `<g fill="${C.pink}"><ellipse cx="0" cy="8" rx="20" ry="16"/><circle cx="-28" cy="-24" r="8"/><circle cx="-10" cy="-36" r="8"/><circle cx="12" cy="-36" r="8"/><circle cx="30" cy="-24" r="8"/></g>` : ''}
  </g>`;
}
const hand = paw;
const fist = (x, y, rot) => paw(x, y, rot + 90, false);
function arm(sx, sy, ex, ey, hx, hy) {
  return `<path d="M${sx} ${sy} Q${ex} ${ey} ${hx} ${hy}" fill="none" stroke="${C.furShade}" stroke-width="76" stroke-linecap="round"/>
          <path d="M${sx} ${sy} Q${ex} ${ey} ${hx} ${hy}" fill="none" stroke="${C.fur}" stroke-width="64" stroke-linecap="round"/>`;
}
function tail(t) {
  const sw = Math.sin(t * 3) * 60;
  const d = `M720 1760 Q960 1700 ${930 + sw * 0.4} 1460 Q${910 + sw} 1320 ${960 + sw} 1240`;
  return `<path d="${d}" fill="none" stroke="${C.furShade}" stroke-width="78" stroke-linecap="round"/>
          <path d="${d}" fill="none" stroke="${C.fur}" stroke-width="66" stroke-linecap="round"/>
          <path d="${d}" fill="none" stroke="${C.stripe}" stroke-width="66" stroke-dasharray="22 70" stroke-dashoffset="-40"/>`;
}
function body() {
  // Sitting cat seen from the front: pear-shaped torso, round haunches, white bib, collar with bell.
  return `
    <ellipse cx="370" cy="1690" rx="150" ry="165" fill="${C.fur}" stroke="${C.furShade}" stroke-width="6"/>
    <ellipse cx="710" cy="1690" rx="150" ry="165" fill="${C.fur}" stroke="${C.furShade}" stroke-width="6"/>
    <ellipse cx="300" cy="1835" rx="85" ry="40" fill="${C.fur}" stroke="${C.furShade}" stroke-width="6"/>
    <ellipse cx="780" cy="1835" rx="85" ry="40" fill="${C.fur}" stroke="${C.furShade}" stroke-width="6"/>
    <g fill="${C.stripe}">
      <path d="M240 1620 Q290 1600 330 1640 Q290 1630 246 1650 Z"/><path d="M232 1700 Q290 1680 335 1720 Q290 1712 236 1730 Z"/>
      <path d="M840 1620 Q790 1600 750 1640 Q790 1630 834 1650 Z"/><path d="M848 1700 Q790 1680 745 1720 Q790 1712 844 1730 Z"/>
    </g>
    <path d="M440 1050 Q340 1230 335 1520 Q340 1780 540 1800 Q740 1780 745 1520 Q740 1230 640 1050 Z"
          fill="${C.fur}" stroke="${C.furShade}" stroke-width="6" stroke-linejoin="round"/>
    <path d="M425 1080 Q540 1150 655 1080" fill="none" stroke="#E53950" stroke-width="30" stroke-linecap="round"/>
    <g transform="translate(540 1148)">
      <circle r="34" fill="#FFC83D" stroke="#C9921A" stroke-width="5"/>
      <path d="M-30 -4 h60" stroke="#C9921A" stroke-width="5"/>
      <circle cy="12" r="7" fill="#7A5410"/>
    </g>`;
}
// Tapered limb from a (shoulder, width wa) to b (wrist, width wb). Only the sides get an outline,
// and the shoulder end is hidden under a fur blob, so the leg grows out of the body without a seam.
function limb(ax, ay, bx, by, wa, wb) {
  const len = Math.hypot(bx - ax, by - ay), nx = -(by - ay) / len, ny = (bx - ax) / len;
  const p = (x, y, w, sgn) => `${x + nx * w / 2 * sgn} ${y + ny * w / 2 * sgn}`;
  const fill = `M${p(ax, ay, wa, 1)} L${p(bx, by, wb, 1)} A${wb / 2} ${wb / 2} 0 0 0 ${p(bx, by, wb, -1)} L${p(ax, ay, wa, -1)} Z`;
  // outline starts 35% down the limb so it fades into the shoulder
  const k = 0.35, sx = ax + (bx - ax) * k, sy = ay + (by - ay) * k, sw = wa + (wb - wa) * k;
  return `<path d="${fill}" fill="${C.fur}"/>
          <path d="M${p(sx, sy, sw, 1)} L${p(bx, by, wb, 1)} M${p(sx, sy, sw, -1)} L${p(bx, by, wb, -1)}"
                stroke="${C.furShade}" stroke-width="6" stroke-linecap="round" fill="none"/>
          <ellipse cx="${ax}" cy="${ay}" rx="${wa * 0.5}" ry="${wa * 0.6}" fill="${C.fur}"/>`;
}
// White chest bib, drawn over the tops of the standing legs so they emerge from under the chest.
function bib() {
  return `<path d="M540 1090 Q420 1140 425 1360 Q445 1540 540 1600 Q635 1540 655 1360 Q660 1140 540 1090 Z" fill="${C.white}"/>`;
}
// Front leg resting on the ground.
function leg(x, lifted = false) {
  if (lifted) return '';
  return limb(x, 1300, x, 1790, 108, 80) +
         `<path d="M${x - 28} 1560 q28 12 56 0 M${x - 26} 1650 q26 10 52 0" stroke="${C.stripe}" stroke-width="10" fill="none" stroke-linecap="round" opacity=".8"/>` +
         groundPaw(x);
}
function groundPaw(x) {
  return `<path d="M${x - 58} 1812 Q${x - 60} 1772 ${x} 1770 Q${x + 60} 1772 ${x + 58} 1812 Q${x + 50} 1840 ${x} 1840 Q${x - 50} 1840 ${x - 58} 1812 Z"
            fill="${C.fur}" stroke="${C.furShade}" stroke-width="6"/>
          <path d="M${x - 20} 1840 v-22 M${x + 20} 1840 v-22" stroke="${C.furShade}" stroke-width="5" stroke-linecap="round"/>`;
}
// Raised front leg: lifted straight up from the shoulder in front of the chest, paw on top.
// x0 = shoulder, (hx, hy) = paw centre, rot = wrist angle, open = show the toe beans.
function liftedLeg(x0, hx, hy, rot, open = true) {
  const wx = hx, wy = hy + 46;
  return limb(x0, 1330, wx, wy, 108, 78) +
         `<g transform="rotate(${rot} ${wx} ${wy})">${open ? catPawFront(hx, hy) : catPawCurled(hx, hy)}</g>`;
}
function catPawFront(x, y) {
  // Paw pad facing the viewer: main pad + 4 toe beans.
  return `<g transform="translate(${x} ${y})">
    <path d="M-50 10 Q-56 -40 -30 -56 Q0 -72 30 -56 Q56 -40 50 10 Q40 46 0 48 Q-40 46 -50 10 Z" fill="${C.fur}" stroke="${C.furShade}" stroke-width="6"/>
    <g fill="${C.pink}">
      <path d="M-22 18 Q-24 -2 0 -4 Q24 -2 22 18 Q14 30 0 26 Q-14 30 -22 18 Z"/>
      <ellipse cx="-32" cy="-22" rx="9" ry="11"/><ellipse cx="-12" cy="-40" rx="9" ry="11"/>
      <ellipse cx="12" cy="-40" rx="9" ry="11"/><ellipse cx="32" cy="-22" rx="9" ry="11"/>
    </g></g>`;
}
function catPawCurled(x, y) {
  // Back of the paw, toes curled down (used when touching the chin).
  return `<g transform="translate(${x} ${y})">
    <path d="M-48 0 Q-50 -42 0 -46 Q50 -42 48 0 Q46 40 0 42 Q-46 40 -48 0 Z" fill="${C.fur}" stroke="${C.furShade}" stroke-width="6"/>
    <path d="M-16 42 v-22 M16 42 v-22" stroke="${C.furShade}" stroke-width="5" stroke-linecap="round"/></g>`;
}

// ---- scene --------------------------------------------------------------------
const smooth = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
const talk = t => Math.abs(Math.sin(t * 17) * 0.6 + Math.sin(t * 29) * 0.4);   // fake lip-sync

function bubble(text, t0, t, color = '#fff') {
  const k = smooth((t - t0) / 0.25);
  if (k <= 0) return '';
  return `<g transform="translate(540 360) scale(${0.6 + 0.4 * k})" opacity="${k}">
    <rect x="-420" y="-95" width="840" height="190" rx="60" fill="${color}" stroke="#1B1035" stroke-width="8"/>
    <path d="M-30 92 L0 150 L40 92 Z" fill="${color}" stroke="#1B1035" stroke-width="8" stroke-linejoin="round"/>
    <rect x="-34" y="80" width="78" height="20" fill="${color}"/>
    <text y="22" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="800" font-size="${Math.min(62, 1250 / text.length)}" fill="#1B1035">${text}</text>
  </g>`;
}
function confetti(t) {
  if (t < 0) return '';
  const r = rng(5), cols = ['#FFC83D', '#FF5C8A', '#4FD1C5', '#7C83FD', '#FFFFFF'];
  let s = '';
  for (let i = 0; i < 70; i++) {
    const x0 = 540 + (r() - 0.5) * 200, vx = (r() - 0.5) * 1500, vy = -900 - r() * 900;
    const x = x0 + vx * t, y = 760 + vy * t + 1300 * t * t;
    s += `<rect x="${x}" y="${y}" width="22" height="12" rx="3" fill="${cols[i % 5]}"
            transform="rotate(${(r() * 360 + t * 600 * (r() - 0.5))} ${x} ${y})"/>`;
  }
  return s;
}

// Draws Abon for one frame. pose: idle | wave | think | surprised | win.
// lt = seconds since the pose started (drives transitions), talking = mouth follows fake lip-sync.
function drawAbon(t, pose, lt, talking) {
  const blink = t > 0.4 && (t % 3.7) < 0.13;
  const st = { eyeOpen: blink ? 0 : 1, look: { x: 0, y: 2 }, wide: false, browL: 0, browR: 0, mouth: 'smile', open: 0, perk: 0 };
  let headRot = Math.sin(t * 2.2) * 2.5, bob = Math.sin(t * 4.4) * 8, stand = leg(480) + leg(600), arms = '', extra = '';

  if (pose === 'wave') {
    st.browL = st.browR = 6;
    stand = leg(480); arms = liftedLeg(600, 670, 1200, Math.sin(t * 11) * 14);
  } else if (pose === 'think') {
    const k = smooth(lt / 0.3);
    st.look = { x: 12 * k, y: -10 * k }; st.browL = 2; st.browR = 18 * k;
    headRot = -5 + Math.sin(t * 2) * 1.5;
    stand = leg(600); arms = liftedLeg(480, 470, 1150, -8, false);
    extra = `<text x="800" y="${640 - (lt % 2) * 30}" font-family="Baloo 2, DejaVu Sans, sans-serif" font-weight="800" font-size="150"
               fill="#FFC83D" stroke="#1B1035" stroke-width="8" paint-order="stroke" opacity="${smooth((lt - 0.2) / 0.3)}"
               transform="rotate(${12 + Math.sin(t * 5) * 6} 840 590)">?</text>`;
  } else if (pose === 'surprised') {
    st.wide = true; st.mouth = 'o'; st.open = smooth(lt / 0.2); st.browL = st.browR = 22; st.perk = 30;
    bob -= 20 * Math.sin(Math.min(lt / 0.7, 1) * Math.PI);
  } else if (pose === 'win') {
    st.mouth = 'grin'; st.browL = st.browR = 10; st.eyeOpen = 'happy';
    bob -= Math.abs(Math.sin(lt * 8)) * 14;
    stand = leg(480); arms = liftedLeg(600, 690, 1180, Math.sin(lt * 14) * 12);
  }
  if (talking) {
    st.mouth = 'talk'; st.open = talk(t) * (pose === 'think' ? 0.6 : 1);
  }
  return `<g transform="translate(0 ${bob})">
      ${tail(t)}${body()}${stand}${bib()}
      <g transform="rotate(${headRot} 540 1080)">${face(st, t)}</g>
      ${arms}
    </g>${extra}`;
}
