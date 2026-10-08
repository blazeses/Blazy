'use strict';
/* ================= CONFIG ================= */
const CFG = {
  C: 10, R: 22, H: 2,            // 10 cols, 22 rows (2 hidden on top)
  das: 140, arr: 32,            // ms: delay before auto-repeat, repeat interval
  softMul: 20, lock: 500, lockResets: 15, clearMs: 320,
  colors: { // [light, dark] muted jewel tones
    I: ['#8fd9e8', '#3a9fb8'], O: ['#f2d27a', '#c9983a'], T: ['#c4a6f0', '#7d57b8'],
    S: ['#9fe0ad', '#4aa56a'], Z: ['#f39a9f', '#bb4a56'], J: ['#8fa9f2', '#4a5fbb'], L: ['#f4b48a', '#c26f3a']
  }
};
const T = 'IOTSZJL';
const MAT = {
  I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], O: [[1,1],[1,1]],
  T: [[0,1,0],[1,1,1],[0,0,0]], S: [[0,1,1],[1,1,0],[0,0,0]], Z: [[1,1,0],[0,1,1],[0,0,0]],
  J: [[1,0,0],[1,1,1],[0,0,0]], L: [[0,0,1],[1,1,1],[0,0,0]]
};
// Precompute the 4 rotations of every piece as [x,y] cell lists
const ROT = {};
for (const k of T) {
  let m = MAT[k]; ROT[k] = [];
  for (let r = 0; r < 4; r++) {
    const cs = []; m.forEach((row, y) => row.forEach((v, x) => v && cs.push([x, y]))); ROT[k].push(cs);
    const n = m.length, q = m.map(a => a.slice());
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) q[x][n - 1 - y] = m[y][x];
    m = q;
  }
}
// SRS wall kicks (y-up as in the guideline; flipped when applied)
const _a = [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]], _b = [[0,0],[1,0],[1,-1],[0,2],[1,2]],
      _c = [[0,0],[1,0],[1,1],[0,-2],[1,-2]], _d = [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]];
const KJ = { '01': _a, '10': _b, '12': _b, '21': _a, '23': _c, '32': _d, '30': _d, '03': _c };
const _e = [[0,0],[-2,0],[1,0],[-2,-1],[1,2]], _f = [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
      _g = [[0,0],[-1,0],[2,0],[-1,2],[2,-1]], _h = [[0,0],[1,0],[-2,0],[1,-2],[-2,1]];
const KI = { '01': _e, '10': _f, '12': _g, '21': _h, '23': _f, '32': _e, '30': _h, '03': _g };

/* ================= PIECE / BOARD ================= */
class Piece {
  constructor(t) { this.t = t; this.r = 0; this.x = t === 'O' ? 4 : 3; this.y = 1; this.vx = this.x; this.vy = this.y; }
  get cells() { return ROT[this.t][this.r]; }
}
class Board {
  constructor() { this.g = new Uint8Array(CFG.C * CFG.R); }
  reset() { this.g.fill(0); }
  hit(t, r, x, y) {
    const cs = ROT[t][r];
    for (let i = 0; i < 4; i++) {
      const cx = x + cs[i][0], cy = y + cs[i][1];
      if (cx < 0 || cx >= CFG.C || cy >= CFG.R) return true;
      if (cy >= 0 && this.g[cy * CFG.C + cx]) return true;
    }
    return false;
  }
  lock(p) { for (const c of p.cells) this.g[(p.y + c[1]) * CFG.C + p.x + c[0]] = T.indexOf(p.t) + 1; }
  fullRows() {
    const out = [];
    for (let r = 0; r < CFG.R; r++) { let f = true; for (let x = 0; x < CFG.C; x++) if (!this.g[r * CFG.C + x]) { f = false; break; } if (f) out.push(r); }
    return out;
  }
  remove(rows) { for (const r of rows) { this.g.copyWithin(CFG.C, 0, r * CFG.C); this.g.fill(0, 0, CFG.C); } }
}

/* ================= AUDIO (Web Audio, no files) ================= */
class Sfx {
  constructor() { this.ctx = null; this.on = true; this.music = false; this.step = 0; this.timer = 0; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
    this.ctx = new A(); this.master = this.ctx.createGain(); this.master.gain.value = .6; this.master.connect(this.ctx.destination);
    if (this.music && this.playing) this.startMusic();
  }
  osc(f, d, type = 'sine', v = .08, slide = 0, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(f * slide, t + d);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + d + .03);
  }
  play(n) {
    if (!this.on) return;
    switch (n) {
      case 'move': this.osc(300, .04, 'triangle', .04); break;
      case 'rot': this.osc(520, .07, 'triangle', .06, 1.3); break;
      case 'hold': this.osc(400, .1, 'sine', .06, .7); break;
      case 'lock': this.osc(150, .09, 'sine', .12, .6); break;
      case 'drop': this.osc(120, .15, 'sine', .16, .4); break;
      case 'line': [523, 659, 784].forEach((f, i) => this.osc(f, .18, 'triangle', .08, 1, i * .06)); break;
      case 'tetris': [523, 659, 784, 1047, 1319].forEach((f, i) => this.osc(f, .3, 'triangle', .09, 1, i * .07)); break;
      case 'over': [392, 330, 262, 196].forEach((f, i) => this.osc(f, .4, 'sine', .1, .98, i * .18)); break;
    }
  }
  startMusic() {
    this.playing = true; if (!this.music || !this.ctx || this.timer) return;
    const ch = [[220, 262, 330], [175, 220, 262], [262, 330, 392], [196, 247, 294]];
    this.timer = setInterval(() => {
      const bar = (this.step >> 3) & 3, n = ch[bar][this.step % 3];
      this.osc(n * (this.step % 8 === 0 ? .5 : 1), .35, 'triangle', .035); this.step++;
    }, 220);
  }
  stopMusic() { this.playing = false; clearInterval(this.timer); this.timer = 0; }
}

/* ================= RENDERER ================= */
class Renderer {
  constructor(game) {
    this.g = game; this.cv = document.getElementById('board'); this.ctx = this.cv.getContext('2d');
    this.holdCv = document.getElementById('hold'); this.nextCv = document.getElementById('next');
    this.cell = 20; this.dpr = 1; this.bg = document.createElement('canvas');
    addEventListener('resize', () => this.resize()); addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    this.resize();
  }
  sprites(px) { // pre-rendered glossy block per piece type
    const o = {};
    for (const k of T) {
      const c = document.createElement('canvas'); c.width = c.height = px; const x = c.getContext('2d'), [l, d] = CFG.colors[k];
      const i = Math.max(1, px * .04), rr = px * .22, gr = x.createLinearGradient(0, 0, px, px);
      gr.addColorStop(0, l); gr.addColorStop(1, d);
      x.fillStyle = gr; x.beginPath(); x.roundRect(i, i, px - 2 * i, px - 2 * i, rr); x.fill();
      const hl = x.createLinearGradient(0, 0, 0, px); hl.addColorStop(0, 'rgba(255,255,255,.45)'); hl.addColorStop(.5, 'rgba(255,255,255,0)'); hl.addColorStop(1, 'rgba(0,0,0,.18)');
      x.fillStyle = hl; x.beginPath(); x.roundRect(i, i, px - 2 * i, px - 2 * i, rr); x.fill();
      o[k] = c;
    }
    return o;
  }
  resize() {
    const st = document.getElementById('stage'), dpr = this.dpr = Math.min(devicePixelRatio || 1, 3);
    const s = this.cell = Math.max(10, Math.floor(Math.min(st.clientWidth / CFG.C, st.clientHeight / 20)));
    const W = s * CFG.C, H = s * 20; this.cv.style.width = W + 'px'; this.cv.style.height = H + 'px';
    this.cv.width = W * dpr; this.cv.height = H * dpr; this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.sp = this.sprites(Math.round(s * dpr)); this.spm = this.sprites(Math.round(12 * dpr));
    for (const c of [this.holdCv, this.nextCv]) { c.width = 64 * dpr; c.height = 84 * dpr; c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0); }
    // static background (panel + grid) rendered once
    const b = this.bg; b.width = W * dpr; b.height = H * dpr; const x = b.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.fillStyle = 'rgba(8,10,26,.55)'; x.beginPath(); x.roundRect(0, 0, W, H, s * .3); x.fill();
    x.strokeStyle = 'rgba(255,255,255,.1)'; x.lineWidth = 1; x.stroke();
    x.fillStyle = 'rgba(255,255,255,.07)';
    for (let i = 1; i < CFG.C; i++) for (let j = 1; j < 20; j++) { x.beginPath(); x.arc(i * s, j * s, 1.1, 0, 7); x.fill(); }
    this.g.hudDirty = true;
  }
  draw(g, dt) {
    const c = this.ctx, s = this.cell, W = s * CFG.C, H = s * 20, p = g.cur;
    c.clearRect(0, 0, W, H); c.drawImage(this.bg, 0, 0, W, H);
    c.save(); if (g.shake > 0) c.translate(0, Math.sin(g.shake * 38) * g.shake * s * .3);
    const b = g.board.g;
    for (let r = CFG.H; r < CFG.R; r++) for (let x = 0; x < CFG.C; x++) { const v = b[r * CFG.C + x]; if (v) c.drawImage(this.sp[T[v - 1]], x * s, (r - CFG.H) * s, s, s); }
    if (g.clearing) { // flash then dissolve from the centre
      const k = Math.min(1, g.clearT / CFG.clearMs);
      c.fillStyle = `rgba(255,255,255,${.95 * (1 - k)})`;
      for (const r of g.clearing) c.fillRect(W / 2 * k, (r - CFG.H) * s, W * (1 - k), s);
    }
    if (p && !g.clearing) {
      const gy = g.ghostY(); c.globalAlpha = .22;
      for (const q of p.cells) c.drawImage(this.sp[p.t], (p.x + q[0]) * s, (gy + q[1] - CFG.H) * s, s, s);
      // smooth interpolation toward the logical cell position
      const kx = 1 - Math.exp(-dt * 38); p.vx += (p.x - p.vx) * kx;
      const ty = p.y + (g.grounded ? 0 : Math.min(g.fall, .99)); p.vy = ty >= p.vy ? ty : p.vy + (ty - p.vy) * (1 - Math.exp(-dt * 40));
      c.globalAlpha = Math.min(1, .3 + g.spawnT * 8); c.shadowColor = CFG.colors[p.t][0]; c.shadowBlur = s * .8;
      for (const q of p.cells) c.drawImage(this.sp[p.t], (p.vx + q[0]) * s, (p.vy + q[1] - CFG.H) * s, s, s);
      c.shadowBlur = 0; c.globalAlpha = 1;
    }
    const P = g.P; // particles (cell units)
    for (let i = 0; i < P.n; i++) if (P.l[i] > 0) {
      c.globalAlpha = P.l[i]; c.fillStyle = CFG.colors[T[P.c[i]]][0]; const z = s * .16; c.fillRect(P.x[i] * s - z / 2, (P.y[i] - CFG.H) * s - z / 2, z, z);
    }
    c.restore(); c.globalAlpha = 1;
    if (g.hudDirty) { this.mini(this.holdCv, g.hold ? [g.hold] : []); this.mini(this.nextCv, g.q.slice(0, 3)); g.hudDirty = false; }
  }
  mini(cv, list) {
    const c = cv.getContext('2d'); c.clearRect(0, 0, 64, 84); const m = 12;
    list.forEach((t, i) => {
      const cs = ROT[t][0]; let x0 = 9, x1 = 0, y0 = 9, y1 = 0;
      for (const q of cs) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
      const ox = 32 - (x1 - x0 + 1) * m / 2, oy = (list.length > 1 ? 14 + i * 28 : 42) - (y1 - y0 + 1) * m / 2;
      c.globalAlpha = (cv === this.holdCv && !this.g.canHold) ? .35 : 1;
      for (const q of cs) c.drawImage(this.spm[t], ox + (q[0] - x0) * m, oy + (q[1] - y0) * m, m, m);
    }); c.globalAlpha = 1;
  }
}

/* ================= INPUT ================= */
class Input {
  constructor(g) {
    this.g = g; this.dir = 0; this.das = 0; this.arr = 0; this.soft = false; this.t = null;
    const o = { passive: false }, d = document;
    d.addEventListener('touchstart', e => this.ts(e), o); d.addEventListener('touchmove', e => this.tm(e), o);
    d.addEventListener('touchend', e => this.te(e), o); d.addEventListener('touchcancel', e => this.te(e), o);
    d.addEventListener('gesturestart', e => e.preventDefault()); d.addEventListener('contextmenu', e => e.preventDefault());
    document.getElementById('holdBox').addEventListener('pointerdown', () => g.state === 'play' && g.doHold());
    document.getElementById('pauseBtn').addEventListener('click', () => g.state === 'play' && g.pause());
    // on-screen buttons
    document.querySelectorAll('#pad button').forEach(b => {
      const a = b.dataset.a;
      b.addEventListener('pointerdown', e => { e.preventDefault(); if (g.state !== 'play') return;
        if (a === 'left') this.setDir(-1); else if (a === 'right') this.setDir(1); else if (a === 'down') this.soft = true;
        else if (a === 'cw') g.rotate(1); else if (a === 'ccw') g.rotate(-1); else if (a === 'drop') g.hardDrop(); else g.doHold(); });
      const up = () => { if (a === 'left' && this.dir < 0 || a === 'right' && this.dir > 0) this.setDir(0); if (a === 'down') this.soft = false; };
      b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
    });
    // keyboard (desktop testing)
    addEventListener('keydown', e => { if (e.repeat || g.state !== 'play') { if (e.key === 'p' && g.state === 'pause') g.resume(); return; }
      switch (e.key) { case 'ArrowLeft': this.setDir(-1); break; case 'ArrowRight': this.setDir(1); break; case 'ArrowDown': this.soft = true; break;
        case 'ArrowUp': case 'x': g.rotate(1); break; case 'z': g.rotate(-1); break; case ' ': g.hardDrop(); break;
        case 'c': case 'Shift': g.doHold(); break; case 'p': case 'Escape': g.pause(); break; } });
    addEventListener('keyup', e => { if (e.key === 'ArrowLeft' && this.dir < 0 || e.key === 'ArrowRight' && this.dir > 0) this.setDir(0); if (e.key === 'ArrowDown') this.soft = false; });
  }
  setDir(d, silent) { if (d === this.dir) return; this.dir = d; this.das = 0; this.arr = 0; if (d && !silent) this.g.move(d); }
  update(dt) { // DAS / ARR auto-repeat
    if (!this.dir) return; this.das += dt * 1000; if (this.das < CFG.das) return;
    this.arr += dt * 1000; while (this.arr >= CFG.arr) { this.arr -= CFG.arr; if (!this.g.move(this.dir)) break; }
  }
  ts(e) {
    if (this.g.state !== 'play' || e.target.closest('#pad,#pauseBtn,#holdBox')) return; e.preventDefault();
    const t = e.changedTouches[0]; this.t = { id: t.identifier, x0: t.clientX, y0: t.clientY, ax: t.clientX, t0: performance.now(), moved: false };
  }
  tm(e) {
    if (!this.t) return; e.preventDefault(); const T0 = this.t;
    for (const t of e.changedTouches) if (t.identifier === T0.id) {
      const s = this.g.r.cell, st = Math.trunc((t.clientX - T0.ax) / s);
      for (let i = 0; i < Math.abs(st); i++) if (!this.g.move(Math.sign(st))) break; // finger-proportional movement
      if (st) { T0.ax += st * s; this.das = 0; this.arr = 0; }
      const off = t.clientX - T0.ax; this.setDir(Math.abs(off) > s * .6 ? Math.sign(off) : 0, true);
      const dx = t.clientX - T0.x0, dy = t.clientY - T0.y0;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) T0.moved = true;
      this.soft = dy > s * .9 && dy > Math.abs(dx);
    }
  }
  te(e) {
    if (!this.t) return; const T0 = this.t;
    for (const t of e.changedTouches) if (t.identifier === T0.id) {
      const dt = performance.now() - T0.t0, dx = t.clientX - T0.x0, dy = t.clientY - T0.y0, s = this.g.r.cell;
      this.soft = false; this.setDir(0, true); this.t = null;
      if (!T0.moved && dt < 260) this.g.rotate(1);                                      // tap = rotate
      else if (dy > s * 3 && dy / dt > .8 && Math.abs(dx) < dy) this.g.hardDrop();       // fast swipe down
      else if (dy < -s * 2.5 && Math.abs(dx) < -dy) this.g.doHold();                     // swipe up = hold
    }
  }
}

/* ================= GAME ================= */
class Game {
  constructor() {
    this.board = new Board(); this.sfx = new Sfx(); this.state = 'menu'; this.prev = 'menu';
    this.P = { n: 90, x: new Float32Array(90), y: new Float32Array(90), vx: new Float32Array(90), vy: new Float32Array(90), l: new Float32Array(90), c: new Uint8Array(90) };
    this.q = []; this.cur = null; this.hold = null; this.clearing = null; this.shake = 0; this.dispScore = 0; this.hudDirty = true;
    this.cfg = Object.assign({ sound: true, music: false, vibe: true, pad: false }, JSON.parse(localStorage.getItem('tetris.cfg') || '{}'));
    this.best = +localStorage.getItem('tetris.best') || 0;
    this.els = { score: score, level: level, best: best }; this.cache = {};
    this.r = new Renderer(this); this.in = new Input(this); this.bindUI(); this.applyCfg();
    this.last = performance.now(); this.loop = this.loop.bind(this); requestAnimationFrame(this.loop);
    document.addEventListener('visibilitychange', () => document.hidden && this.state === 'play' && this.pause());
    addEventListener('pointerdown', () => this.sfx.init());
  }
  bindUI() {
    document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.go; this.sfx.init();
      if (a === 'play') this.newGame(); else if (a === 'resume') this.resume(); else if (a === 'menu') { this.state = 'menu'; this.sfx.stopMusic(); this.show('menu'); }
      else if (a === 'settings') { this.prev = document.querySelector('.screen.on').id; this.show('settings'); } else if (a === 'back') this.show(this.prev);
    }));
    document.querySelectorAll('[data-s]').forEach(i => { i.checked = this.cfg[i.dataset.s];
      i.addEventListener('change', () => { this.cfg[i.dataset.s] = i.checked; localStorage.setItem('tetris.cfg', JSON.stringify(this.cfg)); this.applyCfg(); }); });
  }
  applyCfg() {
    this.sfx.on = this.cfg.sound; this.sfx.music = this.cfg.music; document.getElementById('pad').hidden = !this.cfg.pad;
    requestAnimationFrame(() => this.r.resize());
    if (this.cfg.music && this.state === 'play') this.sfx.startMusic(); else if (!this.cfg.music) this.sfx.stopMusic();
  }
  show(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id)); }
  buzz(ms) { if (this.cfg.vibe && navigator.vibrate) navigator.vibrate(ms); }
  newGame() {
    this.board.reset(); this.q.length = 0; this.hold = null; this.score = 0; this.lines = 0; this.level = 1; this.combo = -1; this.b2b = false;
    this.clearing = null; this.P.l.fill(0); this.state = 'play'; this.show(''); this.spawn(); this.last = performance.now(); this.hudDirty = true;
    if (this.cfg.music) this.sfx.startMusic();
  }
  pause() { this.state = 'pause'; this.in.setDir(0, true); this.in.soft = false; this.sfx.stopMusic(); this.show('pause'); }
  resume() { this.state = 'play'; this.show(''); this.last = performance.now(); if (this.cfg.music) this.sfx.startMusic(); }
  next() {
    if (this.q.length < 7) { const b = T.split(''); for (let i = 6; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [b[i], b[j]] = [b[j], b[i]]; } this.q.push(...b); } // 7-bag
    this.hudDirty = true; return this.q.shift();
  }
  place(t) { this.cur = new Piece(t); this.lockT = 0; this.resets = 0; this.fall = 0; this.spawnT = 0; this.grounded = false;
    if (this.board.hit(t, 0, this.cur.x, this.cur.y)) this.over(); }
  spawn() { this.canHold = true; this.place(this.next()); }
  doHold() {
    if (!this.canHold || !this.cur || this.clearing) return; const t = this.cur.t;
    const n = this.hold || this.next(); this.hold = t; this.place(n); this.canHold = false; this.hudDirty = true; this.sfx.play('hold'); this.buzz(8);
  }
  afterMove() { const p = this.cur;
    if (this.board.hit(p.t, p.r, p.x, p.y + 1)) { if (this.resets < CFG.lockResets) { this.lockT = 0; this.resets++; } } else this.lockT = 0; }
  move(dx) { const p = this.cur; if (!p || this.clearing || this.board.hit(p.t, p.r, p.x + dx, p.y)) return false;
    p.x += dx; this.afterMove(); this.sfx.play('move'); return true; }
  rotate(d) {
    const p = this.cur; if (!p || this.clearing || p.t === 'O') return false; const to = (p.r + d + 4) % 4;
    for (const k of (p.t === 'I' ? KI : KJ)['' + p.r + to]) {
      const x = p.x + k[0], y = p.y - k[1];
      if (!this.board.hit(p.t, to, x, y)) { p.r = to; p.x = x; p.y = y; this.afterMove(); this.sfx.play('rot'); this.buzz(8); return true; }
    } return false;
  }
  ghostY() { const p = this.cur; let y = p.y; while (!this.board.hit(p.t, p.r, p.x, y + 1)) y++; return y; }
  hardDrop() {
    const p = this.cur; if (!p || this.clearing) return; const y = this.ghostY(); this.score += 2 * (y - p.y); p.y = p.vy = y;
    this.shake = 1; this.sfx.play('drop'); this.lockPiece();
  }
  lockPiece() {
    const p = this.cur; this.board.lock(p); this.cur = null; this.buzz(15); this.sfx.play('lock');
    const rows = this.board.fullRows(), n = rows.length;
    if (n) {
      this.combo++; let pts = [0, 100, 300, 500, 800][n] * this.level;
      if (n === 4) { if (this.b2b) pts *= 1.5; this.b2b = true; } else this.b2b = false;
      this.score += pts + 50 * this.combo * this.level; this.lines += n; this.level = 1 + (this.lines / 10 | 0);
      this.sfx.play(n === 4 ? 'tetris' : 'line'); this.buzz(n === 4 ? [30, 30, 60] : 25);
      for (const r of rows) for (let k = 0; k < 8; k++) this.burst(r, T.indexOf(T[this.board.g[r * CFG.C + (Math.random() * 10 | 0)] - 1] || 'I'));
      this.clearing = rows; this.clearT = 0; if (n === 4) this.shake = 1;
    } else { this.combo = -1; this.spawn(); }
  }
  burst(row, c) { const P = this.P; for (let i = 0; i < P.n; i++) if (P.l[i] <= 0) {
    P.x[i] = Math.random() * CFG.C; P.y[i] = row + .5; P.vx[i] = (Math.random() - .5) * 8; P.vy[i] = -2 - Math.random() * 6; P.l[i] = 1; P.c[i] = c; return; } }
  over() {
    this.state = 'over'; this.cur = null; this.sfx.stopMusic(); this.sfx.play('over'); this.buzz([60, 40, 120]);
    const nb = this.score > this.best; if (nb) { this.best = this.score; localStorage.setItem('tetris.best', this.best); }
    finalScore.textContent = this.score; finalNote.textContent = nb ? 'Новый рекорд!' : 'Рекорд: ' + this.best; this.show('over');
  }
  update(dt) {
    if (this.clearing) { this.clearT += dt * 1000;
      if (this.clearT >= CFG.clearMs) { this.board.remove(this.clearing); this.clearing = null; this.spawn(); } return; }
    const p = this.cur; if (!p) return; this.in.update(dt); this.spawnT += dt;
    this.grounded = this.board.hit(p.t, p.r, p.x, p.y + 1);
    if (this.grounded) { this.fall = 0; this.lockT += dt * 1000; if (this.lockT >= CFG.lock) { this.lockPiece(); return; } }
    else {
      let iv = Math.max(.01, Math.pow(.8 - (this.level - 1) * .007, this.level - 1)); if (this.in.soft) iv = Math.max(.02, iv / CFG.softMul);
      this.fall += dt / iv;
      while (this.fall >= 1) { this.fall -= 1; if (this.board.hit(p.t, p.r, p.x, p.y + 1)) { this.fall = 0; break; } p.y++; if (this.in.soft) this.score++; }
    }
  }
  loop(ts) {
    requestAnimationFrame(this.loop); const dt = Math.min((ts - this.last) / 1000, .05); this.last = ts;
    if (this.state === 'play') this.update(dt);
    const P = this.P; for (let i = 0; i < P.n; i++) if (P.l[i] > 0) { P.l[i] -= dt * 1.6; P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.vy[i] += 24 * dt; }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 4);
    this.r.draw(this, dt); this.hud(dt);
  }
  hud(dt) { // eased score counter; DOM touched only when text changes
    const s = this.score | 0; this.dispScore += (s - this.dispScore) * Math.min(1, dt * 9); if (Math.abs(s - this.dispScore) < 1) this.dispScore = s;
    const v = { score: Math.round(this.dispScore), level: this.level || 1, best: Math.max(this.best, s) };
    for (const k in v) if (this.cache[k] !== v[k]) { this.cache[k] = v[k]; this.els[k].textContent = v[k]; }
  }
}
new Game();
