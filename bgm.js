// ===== BGM =====
// 1) コードで演奏する曲（GENERATED）… 著作権の心配なし、ファイル不要
// 2) フリー音源（music/tracks.js に登録した曲）
// 3) 自分のファイル（その場で選んだ曲。保存はされません）
(function () {
  const BGM_KEY = 'word-review-bgm';
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // ---------- instruments ----------
  function env(ctx, g, t, a, peak, d, sustain, r) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * sustain), t + a + d);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d + r);
    return t + a + d + r;
  }
  function epiano(ctx, out, t, midi, len, vol) {
    const f = mtof(midi), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1800;
    [['triangle', 1, 1], ['sine', 2, 0.25]].forEach(([type, mul, lv]) => {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = type; o.frequency.value = f * mul; o.detune.value = (Math.random() - 0.5) * 8; og.gain.value = lv;
      o.connect(og).connect(lp); o.start(t); o.stop(t + len + 1.2);
    });
    lp.connect(g).connect(out);
    env(ctx, g, t, 0.015, vol, len, 0.35, 1.0);
  }
  function bell(ctx, out, t, midi, vol) {
    const f = mtof(midi), g = ctx.createGain();
    [[1, 1], [2.01, 0.35], [3.98, 0.12]].forEach(([mul, lv]) => {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f * mul; og.gain.value = lv;
      o.connect(og).connect(g); o.start(t); o.stop(t + 2.2);
    });
    g.connect(out);
    env(ctx, g, t, 0.004, vol, 0.25, 0.25, 1.6);
  }
  function square(ctx, out, t, midi, len, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'square'; o.frequency.value = mtof(midi); lp.type = 'lowpass'; lp.frequency.value = 2600;
    o.connect(lp).connect(g).connect(out);
    env(ctx, g, t, 0.005, vol, len * 0.6, 0.6, 0.06); o.start(t); o.stop(t + len + 0.2);
  }
  function bass(ctx, out, t, midi, len, vol, type) {
    const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = type || 'sine'; o.frequency.value = mtof(midi); lp.type = 'lowpass'; lp.frequency.value = 600;
    o.connect(lp).connect(g).connect(out);
    env(ctx, g, t, 0.01, vol, len * 0.8, 0.7, 0.12); o.start(t); o.stop(t + len + 0.3);
  }
  let noiseBuf = null;
  function noise(ctx) {
    if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }
  function hat(ctx, out, t, vol) {
    const s = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise(ctx); hp.type = 'highpass'; hp.frequency.value = 7000;
    s.connect(hp).connect(g).connect(out);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); s.start(t); s.stop(t + 0.06);
  }
  function snare(ctx, out, t, vol) {
    const s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise(ctx); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8;
    s.connect(bp).connect(g).connect(out);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18); s.start(t); s.stop(t + 0.2);
  }
  function kick(ctx, out, t, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    o.connect(g).connect(out);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); o.start(t); o.stop(t + 0.32);
  }

  // ---------- songs (16 steps = 1 bar) ----------
  // chords: [bass root, ...voicing] in MIDI
  const SONGS = {
    lofi: {
      title: 'ローファイ', note: 'ゆったり集中', bpm: 76, swing: 0.12,
      chords: [[41, 64, 67, 69, 72], [40, 62, 64, 67, 71], [38, 60, 62, 65, 69], [36, 59, 62, 64, 67]],
      // melody: [step, midi offset index in pentatonic]
      play(ctx, out, step, t, bar, sd) {
        const ch = this.chords[bar % 4];
        if (step === 0 || step === 10) ch.slice(1).forEach((m) => epiano(ctx, out, t, m, step === 0 ? sd * 8 : sd * 5, 0.05));
        if (step === 0) bass(ctx, out, t, ch[0], sd * 6, 0.22);
        if (step === 7) bass(ctx, out, t, ch[0] + 7, sd * 2, 0.14);
        if (step === 0 || step === 8 || (step === 11 && bar % 2)) kick(ctx, out, t, 0.32);
        if (step === 4 || step === 12) snare(ctx, out, t, 0.07);
        if (step % 2 === 0) hat(ctx, out, t, step % 4 === 2 ? 0.035 : 0.02);
        const mel = [[2, 76], [6, 74], [9, 72], [14, 69]];
        const hit = mel.find((x) => x[0] === step);
        if (hit && (bar % 4 === 1 || bar % 4 === 3)) epiano(ctx, out, t, hit[1] + (bar % 8 > 3 ? 2 : 0), sd * 2, 0.045);
      }
    },
    musicbox: {
      title: 'オルゴール', note: 'やさしく', bpm: 92, swing: 0,
      chords: [[48, 60, 64, 67, 72], [45, 57, 60, 64, 69], [41, 53, 57, 60, 65], [43, 55, 59, 62, 67]],
      play(ctx, out, step, t, bar, sd) {
        const ch = this.chords[bar % 4];
        const arp = [1, 2, 3, 4, 3, 2, 3, 4];
        if (step % 2 === 0) bell(ctx, out, t, ch[arp[step / 2]] + 12, 0.07);
        if (step === 0) bass(ctx, out, t, ch[0], sd * 14, 0.12, 'triangle');
        if (step === 6 && bar % 2) bell(ctx, out, t, ch[4] + 19, 0.04);
      }
    },
    chip: {
      title: 'ピコピコ', note: 'テンポよく', bpm: 118, swing: 0,
      chords: [[48], [43], [45], [41]],
      lead: [
        [0, 72, 2], [2, 76, 2], [4, 79, 4], [10, 76, 2], [12, 79, 2], [14, 81, 2],
        [0, 79, 4], [4, 74, 2], [6, 71, 2], [8, 74, 6], [14, 79, 2],
        [0, 76, 2], [2, 72, 2], [4, 69, 4], [10, 72, 2], [12, 76, 4],
        [0, 77, 2], [2, 76, 2], [4, 74, 2], [6, 72, 2], [8, 74, 8]
      ],
      play(ctx, out, step, t, bar, sd) {
        const root = this.chords[bar % 4][0];
        if (step % 2 === 0) bass(ctx, out, t, root + (step % 4 === 2 ? 12 : 0), sd * 1.6, 0.1, 'triangle');
        if (step % 4 === 2) hat(ctx, out, t, 0.03);
        if (step === 0 || step === 8) kick(ctx, out, t, 0.18);
        // 4小節分のメロディ（bar ごとに区切りを探す）
        const starts = [0, 6, 11, 16];
        const lines = [this.lead.slice(0, 6), this.lead.slice(6, 11), this.lead.slice(11, 16), this.lead.slice(16)];
        const line = lines[bar % 4];
        if (bar % 8 < 4 || bar % 2 === 0) {
          const n = line.find((x) => x[0] === step);
          if (n) square(ctx, out, t, n[1], sd * n[2] * 0.9, 0.045);
        }
      }
    }
  };

  // ---------- engine ----------
  function createEngine(ctx, dest) {
    const out = ctx.createGain(); out.gain.value = 1;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    out.connect(comp).connect(dest);
    let song = null, step = 0, bar = 0, nextT = 0;
    function sd() { return 60 / song.bpm / 4; }
    function scheduleUntil(until) {
      while (song && nextT < until) {
        const swing = step % 2 ? song.swing * sd() : 0;
        song.play(ctx, out, step, nextT + swing, bar, sd());
        nextT += sd(); step++; if (step === 16) { step = 0; bar++; }
      }
    }
    return {
      out,
      start(name, at) { song = SONGS[name]; step = 0; bar = 0; nextT = (at || ctx.currentTime) + 0.05; },
      stop() { song = null; },
      scheduleUntil,
      fadeTo(v, t) { out.gain.cancelScheduledValues(ctx.currentTime); out.gain.setTargetAtTime(v, ctx.currentTime, t || 0.3); }
    };
  }

  // ---------- player ----------
  const fileTracks = (window.MUSIC_TRACKS || []).filter((x) => x && x.file);
  let state = { on: false, track: 'gen:lofi', volume: 0.4 };
  try { Object.assign(state, JSON.parse(localStorage.getItem(BGM_KEY)) || {}); } catch (e) {}
  const saveState = () => { try { localStorage.setItem(BGM_KEY, JSON.stringify({ on: state.on, track: state.track.startsWith('local:') ? 'gen:lofi' : state.track, volume: state.volume })); } catch (e) {} };

  let ctx = null, master = null, engine = null, timer = null, audio = null, localUrl = null, localName = '';
  function ensureCtx() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = state.volume; master.connect(ctx.destination);
    engine = createEngine(ctx, master);
  }
  function stopAll() {
    if (engine) engine.stop();
    clearInterval(timer); timer = null;
    if (audio) { audio.pause(); }
  }
  function play() {
    stopAll();
    const [kind, id] = [state.track.slice(0, state.track.indexOf(':')), state.track.slice(state.track.indexOf(':') + 1)];
    if (kind === 'gen') {
      ensureCtx(); ctx.resume();
      engine.out.gain.value = 1;
      engine.start(SONGS[id] ? id : 'lofi');
      timer = setInterval(() => engine.scheduleUntil(ctx.currentTime + 0.25), 50);
      engine.scheduleUntil(ctx.currentTime + 0.25);
    } else {
      const src = kind === 'file' ? (fileTracks[+id] || {}).file : localUrl;
      if (!src) { state.track = 'gen:lofi'; return play(); }
      if (!audio) { audio = new Audio(); audio.loop = true; }
      if (audio.dataset.src !== src) { audio.src = src; audio.dataset.src = src; }
      audio.volume = state.volume;
      audio.play().catch(() => {});
    }
  }
  function render() {
    const btn = document.getElementById('bgmPlay');
    btn.textContent = state.on ? '停止' : '再生';
    btn.className = 'sb-btn ' + (state.on ? 'sb-btn-secondary' : 'sb-btn-primary');
    document.getElementById('bgmToggle').classList.toggle('playing', state.on);
    document.querySelectorAll('[data-track]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.track === state.track ? 'true' : 'false'));
    document.getElementById('bgmVol').value = Math.round(state.volume * 100);
    const t = state.track.startsWith('file:') ? fileTracks[+state.track.slice(5)] : null;
    const cr = document.getElementById('bgmCredit');
    cr.textContent = t ? '♪ ' + t.title + (t.credit ? '　' + t.credit : '') + (t.license ? '（' + t.license + '）' : '') : state.track.startsWith('local:') ? '♪ ' + localName + '（このページを閉じるまで）' : '';
    cr.hidden = !cr.textContent;
  }
  function setOn(on) { state.on = on; saveState(); if (on) play(); else stopAll(); render(); }

  // ---------- UI ----------
  function chip(id, label, sub) {
    const b = document.createElement('button');
    b.className = 'chip'; b.dataset.track = id; b.type = 'button';
    b.innerHTML = '<b></b><span></span>'; b.querySelector('b').textContent = label; b.querySelector('span').textContent = sub || '';
    return b;
  }
  function build() {
    const gen = document.getElementById('bgmGen'), files = document.getElementById('bgmFiles');
    Object.entries(SONGS).forEach(([k, s]) => gen.appendChild(chip('gen:' + k, s.title, s.note)));
    if (fileTracks.length) fileTracks.forEach((t, i) => files.appendChild(chip('file:' + i, t.title, t.credit || '')));
    else document.getElementById('bgmFilesEmpty').hidden = false;
    document.getElementById('bgmPanel').addEventListener('click', (e) => {
      const b = e.target.closest('[data-track]'); if (!b) return;
      state.track = b.dataset.track; saveState();
      if (state.on) play(); else setOn(true);
      render();
    });
    document.getElementById('bgmPlay').addEventListener('click', () => setOn(!state.on));
    document.getElementById('bgmVol').addEventListener('input', (e) => {
      state.volume = e.target.value / 100; saveState();
      if (master) master.gain.setTargetAtTime(state.volume, ctx.currentTime, 0.05);
      if (audio) audio.volume = state.volume;
    });
    document.getElementById('bgmLocal').addEventListener('change', (e) => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      if (localUrl) URL.revokeObjectURL(localUrl);
      localUrl = URL.createObjectURL(f); localName = f.name;
      let c = document.querySelector('[data-track="local:1"]');
      if (!c) { c = chip('local:1', '', ''); files.appendChild(c); document.getElementById('bgmFilesEmpty').hidden = true; }
      c.querySelector('b').textContent = f.name.replace(/\.[^.]+$/, ''); c.querySelector('span').textContent = '自分のファイル';
      state.track = 'local:1'; setOn(true);
    });
    document.getElementById('bgmToggle').addEventListener('click', () => {
      const p = document.getElementById('bgmPanel'), open = p.hidden;
      p.hidden = !open; document.getElementById('bgmToggle').setAttribute('aria-expanded', String(open));
      if (open) { const bp = document.getElementById('bgPanel'); if (bp) { bp.hidden = true; document.getElementById('bgToggle').setAttribute('aria-expanded', 'false'); } }
    });
    const bgT = document.getElementById('bgToggle');
    if (bgT) bgT.addEventListener('click', () => { document.getElementById('bgmPanel').hidden = true; document.getElementById('bgmToggle').setAttribute('aria-expanded', 'false'); });
    // ブラウザは操作前の自動再生を止めるので、前回オンなら最初のクリックで再開する
    if (state.on) {
      const resume = () => { document.removeEventListener('pointerdown', resume, true); document.removeEventListener('keydown', resume, true); if (state.on) play(); };
      document.addEventListener('pointerdown', resume, true); document.addEventListener('keydown', resume, true);
    }
    // ほかのタブにいる間は止める
    document.addEventListener('visibilitychange', () => {
      if (!state.on) return;
      if (document.hidden) stopAll(); else play();
    });
    render();
  }
  window.WordReviewBGM = { SONGS, createEngine };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
