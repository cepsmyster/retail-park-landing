// Retail Park: page shell logic. No WebGL here.
//   initPage() -> { progress(), sections }
//   progress(): 0 hero … 6 night, each integer when that section is centred
//   (hero: 0 at the top of the page), then 6 → 7 down to the end of the document.

import { SITE } from '../site.config.js';
import { FACTS } from './facts.js';

const VIEW_NAMES = ['hero', 'screen', 'site', 'court', 'trucks', 'track', 'night'];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function initPage() {
  const q = new URLSearchParams(location.search);
  const frozen = q.has('s') || q.has('view') || q.has('t');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const smooth = !frozen && !reduce;

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  const doc = document.documentElement;
  const sections = VIEW_NAMES.map((n) => document.getElementById('v-' + n));
  const frames = sections.map((s) => s.querySelector('.frame'));

  fillConfig();
  fillFacts();

  // ---------------------------------------------------------------- measure

  let vh = window.innerHeight;
  let max = 0;
  let anchors = [0, 1, 2, 3, 4, 5, 6, 7];

  const pageTop = (el) => el.getBoundingClientRect().top + window.scrollY;

  function measure() {
    vh = window.innerHeight;
    max = Math.max(0, doc.scrollHeight - vh);
    const a = sections.map((s, i) => (i === 0 ? 0 : pageTop(s) + s.offsetHeight / 2 - vh / 2));
    a.push(Math.max(max, a[a.length - 1] + 1));
    for (let i = 1; i < a.length; i++) if (a[i] <= a[i - 1]) a[i] = a[i - 1] + 1;
    anchors = a;
  }

  function progress() {
    const y = window.scrollY;
    if (y <= anchors[0]) return 0;
    for (let k = 0; k < 7; k++) {
      if (y < anchors[k + 1]) return k + (y - anchors[k]) / (anchors[k + 1] - anchors[k]);
    }
    return 7;
  }

  // ---------------------------------------------------------------- URL params

  function applyParams() {
    if (q.has('s')) {
      const s = clamp(parseFloat(q.get('s')) || 0, 0, 1);
      window.scrollTo(0, s * max);
    } else if (q.has('view')) {
      const y = viewY(q.get('view'));
      if (y != null) window.scrollTo(0, y);
    }
    syncScroll();
  }

  function viewY(name) {
    const i = VIEW_NAMES.indexOf(name);
    if (i >= 0) return anchors[i];
    if (name === 'end' || name === 'footer') return max;
    if (name === 'stills') {
      const el = document.getElementById('stills');
      return clamp(pageTop(el) + el.offsetHeight / 2 - vh / 2, 0, max);
    }
    return null;
  }

  // ---------------------------------------------------------------- smooth wheel scrolling

  let target = window.scrollY;
  let cur = window.scrollY;
  let animating = false;
  let lastSet = -1;
  let lastT = performance.now();

  function syncScroll() { target = cur = window.scrollY; animating = false; }

  if (smooth) {
    window.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) return;                         // pinch zoom
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;        // sideways: the stills strip
      e.preventDefault();
      let d = e.deltaY;
      if (e.deltaMode === 1) d *= 40; else if (e.deltaMode === 2) d *= vh;
      if (!animating) cur = target = window.scrollY;
      target = clamp(target + d, 0, max);
      animating = true;
    }, { passive: false });
  }

  window.addEventListener('scroll', () => {
    // a scroll that did not come from the eased wheel (keys, touch, scrollbar): follow it
    if (!animating || Math.abs(window.scrollY - lastSet) > 3) syncScroll();
  }, { passive: true });

  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href').slice(1);
    e.preventDefault();
    if (a.getAttribute('aria-disabled') === 'true') return;
    let y = null;
    if (id === 'end') y = max;
    else if (id.startsWith('v-')) y = viewY(id.slice(2));
    else { const el = document.getElementById(id); if (el) y = clamp(pageTop(el), 0, max); }
    if (y == null) return;
    if (smooth) { if (!animating) cur = window.scrollY; target = y; animating = true; }
    else { window.scrollTo(0, y); syncScroll(); }
  });

  // ---------------------------------------------------------------- copy fades with its section

  const shown = frames.map(() => -1);
  function fade() {
    const y = window.scrollY;
    for (let i = 0; i < frames.length; i++) {
      const d = Math.abs(y - anchors[i]) / vh;
      const o = Math.round((1 - smoothstep(0.32, 0.72, d)) * 1000) / 1000;
      if (o === shown[i]) continue;
      shown[i] = o;
      frames[i].style.opacity = o;
      frames[i].style.visibility = o === 0 ? 'hidden' : 'visible';
    }
  }

  function tick(now) {
    const dt = Math.min(100, now - lastT); lastT = now;
    if (animating) {
      const k = 1 - Math.pow(1 - 0.12, dt * 0.06);       // 0.12 per frame at 60 Hz, any frame rate
      cur += (target - cur) * k;
      if (Math.abs(target - cur) < 0.4) { cur = target; animating = false; }
      lastSet = cur;
      window.scrollTo(0, cur);
    }
    fade();
    requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------- stills strip

  const stills = document.getElementById('stills');
  const strip = stills && stills.querySelector('.strip');
  if (stills && strip) {
    // nothing that happens on the stills reaches the sun control
    ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'touchstart', 'touchmove', 'touchend', 'mousedown', 'mousemove', 'mouseup']
      .forEach((t) => stills.addEventListener(t, (e) => e.stopPropagation(), { passive: true }));

    let drag = null;
    strip.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' || e.button !== 0) return;     // touch scrolls natively
      drag = { id: e.pointerId, x: e.clientX, left: strip.scrollLeft, moved: false };
      strip.setPointerCapture(e.pointerId);
      strip.classList.add('dragging');
    });
    strip.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 2) drag.moved = true;
      strip.scrollLeft = drag.left - dx;
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      strip.classList.remove('dragging');
      try { strip.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }
    };
    strip.addEventListener('pointerup', end);
    strip.addEventListener('pointercancel', end);
    strip.addEventListener('dragstart', (e) => e.preventDefault());
  }

  // ---------------------------------------------------------------- start

  measure();
  applyParams();
  fade();

  let resizeRaf = 0;
  const remeasure = () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      measure();
      if (frozen) applyParams(); else { target = clamp(target, 0, max); }
      fade();
    });
  };
  window.addEventListener('resize', remeasure);
  window.addEventListener('load', remeasure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
  if ('ResizeObserver' in window) new ResizeObserver(remeasure).observe(document.body);

  requestAnimationFrame(tick);

  return { progress, sections };
}

// -------------------------------------------------------------------- content from the config and the counted facts

function fillConfig() {
  const addr = String(SITE.enquiryAddress || '').trim();
  const enq = document.getElementById('enquire');
  if (enq) {
    if (addr) {
      enq.href = 'mailto:' + addr;
      enq.removeAttribute('aria-disabled');
    } else {
      enq.href = '#end';
      enq.setAttribute('aria-disabled', 'true');
    }
  }
  document.querySelectorAll('[data-site]').forEach((el) => {
    const v = String(SITE[el.dataset.site] || '').trim();
    const row = el.closest('[data-site-row]') || el;
    if (v) { el.textContent = v; row.hidden = false; }
    else row.remove();                                   // an empty constant prints nothing
  });
}

function fillFacts() {
  document.querySelectorAll('[data-fact]').forEach((el) => {
    const v = FACTS[el.dataset.fact];
    if (v === null || v === undefined || v === '') {
      (el.closest('tr') || el).remove();
    } else {
      el.textContent = String(v);
    }
  });
  document.querySelectorAll('table.facts').forEach((t) => {
    if (!t.querySelector('tr[data-counted]')) {
      const c = t.querySelector('caption');
      if (c) c.remove();
    }
  });
}
