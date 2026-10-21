// ===== Word Review =====
// 単語は Google スプレッドシートから読み込みます（単語リスト画面の「スプレッドシート連携」で URL を設定）。
// 読み込めないときは、前回読み込んだ単語 → words.js の順に使います。

const KEY = 'word-review-v1';
const SHEET_KEY = 'word-review-sheet';
const SIZE = 20, STEP = 30;
const $ = (id) => document.getElementById(id);

// ---------- words source ----------
function number(list) { return list.map((w, n) => ({ word: w.word, meaning: w.meaning, example: w.example || '', sets: w.sets || [], no: n + 1 })); }
function readSheetCfg() { try { return JSON.parse(localStorage.getItem(SHEET_KEY)) || {}; } catch (e) { return {}; } }
function writeSheetCfg(c) { try { localStorage.setItem(SHEET_KEY, JSON.stringify(c)); } catch (e) {} }
// 使う Google スプレッドシート（変えたいときはここか、単語リスト画面の「スプレッドシート連携」で）
const DEFAULT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1-G9aZEsaxFk-ewI-XtezhnbHLmSpY_GoC7xkpYJ85b8/edit?gid=0#gid=0';
let sheet = readSheetCfg();                       // { url, words, at }
if (!sheet.url) sheet.url = DEFAULT_SHEET_URL;
let WORDS = number(sheet.words && sheet.words.length ? sheet.words : (window.BUILTIN_WORDS || []));
let source = sheet.words && sheet.words.length ? 'cache' : 'builtin';

// 共有リンク（…/edit#gid=…）でも「ウェブに公開」の CSV リンクでも受け付ける
function toCsvUrl(url) {
  url = (url || '').trim();
  const m = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m && !/\/d\/e\//.test(url)) {
    const gid = (url.match(/[#&?]gid=(\d+)/) || [])[1];
    return 'https://docs.google.com/spreadsheets/d/' + m[1] + '/gviz/tq?tqx=out:csv' + (gid ? '&gid=' + gid : '');
  }
  if (/\/pub\b/.test(url) && !/output=csv/.test(url)) return url + (url.includes('?') ? '&' : '?') + 'output=csv';
  return url;
}
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let k = 0; k < text.length; k++) {
    const ch = text[k];
    if (q) {
      if (ch === '"') { if (text[k + 1] === '"') { cell += '"'; k++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[k + 1] === '\n') k++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function rowsToWords(rows) {
  if (!rows.length) return [];
  const h = rows[0].map((x) => x.trim());
  const find = (re, fallback) => { const i = h.findIndex((x) => re.test(x)); return i >= 0 ? i : fallback; };
  const iw = find(/^(単語|英単語|word)$/i, 0), im = find(/意味|meaning/i, 2), ie = find(/例文|example/i, 1);
  const seen = new Set(), out = [];
  rows.slice(1).forEach((r) => {
    const w = (r[iw] || '').trim(), m = (r[im] || '').trim(), e = (r[ie] || '').trim();
    if (!w || !m || seen.has(w.toLowerCase())) return;
    seen.add(w.toLowerCase()); out.push({ word: w, meaning: m, example: e });
  });
  return out;
}
// Google のシートは <script> で読み込む（ローカルのファイルから開いても CORS に引っかからない）
function sheetIds(url) {
  const m = (url || '').match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
  if (!m || /\/d\/e\//.test(url)) return null;
  return { id: m[1], gid: (url.match(/[#&?]gid=(\d+)/) || [])[1] || '0' };
}
function loadSheetByScript(ids) {
  return new Promise((resolve, reject) => {
    const cb = '__wrSheet' + Date.now();
    const s = document.createElement('script');
    const done = (fn, v) => { clearTimeout(timer); delete window[cb]; s.remove(); fn(v); };
    const timer = setTimeout(() => done(reject, new Error('timeout')), 15000);
    window[cb] = (resp) => {
      if (!resp || resp.status === 'error' || !resp.table) return done(reject, new Error((resp && resp.errors && resp.errors[0] && resp.errors[0].reason) || 'error'));
      const cols = resp.table.cols.map((c) => (c.label || '').trim());
      const body = resp.table.rows.map((r) => (r.c || []).map((c) => (c && c.v != null ? String(c.f != null && typeof c.v !== 'string' ? c.f : c.v) : '')));
      done(resolve, [cols].concat(body));
    };
    s.onerror = () => done(reject, new Error('network'));
    s.src = 'https://docs.google.com/spreadsheets/d/' + ids.id + '/gviz/tq?tqx=out:json;responseHandler:' + cb + '&headers=1&gid=' + ids.gid + '&_=' + Date.now();
    document.head.appendChild(s);
  });
}
async function loadSheetRows(url) {
  const ids = sheetIds(url);
  if (ids) return loadSheetByScript(ids);
  const u = toCsvUrl(url);
  const res = await fetch(u + (u.includes('?') ? '&' : '?') + '_=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const text = await res.text();
  if (/^\s*</.test(text)) throw new Error('not csv');
  return parseCsv(text);
}
// Apps Script 連携中は、単語もそちら（全シート）から読む（sync.js）
window.WR_GAS_ACTIVE = (() => { try { const c = JSON.parse(localStorage.getItem('word-review-sync')) || {}; return /^https:\/\/script\.google(usercontent)?\.com\//.test(c.url || ''); } catch (e) { return false; } })();
async function syncSheet() {
  if (window.WR_GAS_ACTIVE) { setSheetStatus('Apps Script 経由で読み込み中…'); return; }
  if (!sheet.url) { renderSheetStatus(); return; }
  setSheetStatus('読み込み中…');
  try {
    const words = rowsToWords(await loadSheetRows(sheet.url));
    if (window.WR_GAS_ACTIVE) return; // Apps Script 連携中はそちらの単語（全シート）を使う
    if (!words.length) throw new Error('empty');
    sheet.words = words; sheet.at = new Date().toISOString(); sheet.error = ''; writeSheetCfg(sheet);
    const before = WORDS.length;
    applyWords(words, 'sheet');
    renderSheetStatus(before);
  } catch (err) {
    console.warn('sheet load failed', err);
    sheet.error = String(err.message || err); writeSheetCfg(sheet);
    renderSheetStatus();
  }
}
function setSheetStatus(text) { $('sheetStatus').textContent = text; }
function renderSheetStatus(before) {
  $('sheetUrl').value = sheet.url || '';
  $('sheetReload').hidden = !sheet.url;
  if (!sheet.url) { setSheetStatus('未設定（いまは同梱の' + WORDS.length + '語を使っています）'); return; }
  if (sheet.error) { setSheetStatus('読み込めませんでした（' + sheet.error + '）。共有設定が「リンクを知っている全員（閲覧者）」になっているか確認してください。いまは' + (source === 'builtin' ? '同梱の' : '前回読み込んだ') + WORDS.length + '語を使っています。'); return; }
  const at = sheet.at ? new Date(sheet.at) : null;
  const t = at ? (at.getMonth() + 1) + '/' + at.getDate() + ' ' + String(at.getHours()).padStart(2, '0') + ':' + String(at.getMinutes()).padStart(2, '0') : '';
  const diff = typeof before === 'number' && WORDS.length !== before ? '（' + (WORDS.length - before > 0 ? '+' : '') + (WORDS.length - before) + '語）' : '';
  setSheetStatus('シートから' + WORDS.length + '語を読み込みました' + diff + '　' + t);
}


// ---------- storage ----------
function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.days) return d; } catch (e) {}
  return { days: {}, added: [], stats: {} };
}
let db = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => dayKey(new Date());
function record(result, w) {
  const k = today();
  const d = db.days[k] || (db.days[k] = { known: 0, unsure: 0, again: 0 });
  d[result]++;
  const s = db.stats[w.word] || (db.stats[w.word] = { known: 0, unsure: 0, again: 0, last: '' });
  s[result]++; s.last = result; s.at = k;
  save();
}
function allWords() { return db.added.concat(WORDS); }

// ---------- sets（シート＝セット） ----------
const SETS_KEY = 'word-review-sets';
let selSets = (() => { try { return JSON.parse(localStorage.getItem(SETS_KEY)) || []; } catch (e) { return []; } })();
function setNames() { const s = []; WORDS.forEach((w) => (w.sets || []).forEach((n) => { if (!s.includes(n)) s.push(n); })); return s; }
function activeSets() { const names = setNames(); return selSets.filter((n) => names.includes(n)); }
function setPool() { const a = activeSets(); return a.length ? WORDS.filter((w) => (w.sets || []).some((n) => a.includes(n))) : allWords(); }
// ---------- 状態（最後の結果）で絞り込む ----------
const STATUS_KEY = 'word-review-status';
const STATUS = [['new', 'まだ'], ['again', 'もう一度'], ['unsure', '微妙'], ['known', '覚えた']];
let selStatus = (() => { try { return JSON.parse(localStorage.getItem(STATUS_KEY)) || []; } catch (e) { return []; } })();
function statusOf(w) { const s = db.stats[w.word]; return (s && s.last) || 'new'; }
function pool() { const base = setPool(); return selStatus.length ? base.filter((w) => selStatus.includes(statusOf(w))) : base; }
function renderStatusChips() {
  const box = $('statusChips'), base = setPool();
  box.innerHTML = '';
  const lab = document.createElement('span'); lab.className = 'small muted chips-label'; lab.textContent = '出す単語'; box.appendChild(lab);
  box.appendChild(setChip('すべて', base.length, !selStatus.length, () => { selStatus = []; saveStatus(); }));
  STATUS.forEach(([k, label]) => {
    const n = base.filter((w) => statusOf(w) === k).length;
    const c = setChip(label, n, selStatus.includes(k), () => {
      selStatus = selStatus.includes(k) ? selStatus.filter((x) => x !== k) : selStatus.concat([k]); saveStatus();
    });
    c.classList.add('st-' + k); box.appendChild(c);
  });
}
function saveStatus() { try { localStorage.setItem(STATUS_KEY, JSON.stringify(selStatus)); } catch (e) {} renderStatusChips(); newDeck(); }
function newDeck() { startDeck(shuffle(pool()).slice(0, SIZE)); }
function countIn(name) { return WORDS.filter((w) => (w.sets || []).includes(name)).length; }
function setChip(label, count, pressed, onClick) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'chip';
  b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  b.innerHTML = '<b></b><span></span>'; b.querySelector('b').textContent = label; b.querySelector('span').textContent = count + '語';
  b.addEventListener('click', onClick); return b;
}
function renderSetChips() {
  const box = $('setChips'), names = setNames(), act = activeSets();
  box.hidden = names.length < 2; box.innerHTML = '';
  if (box.hidden) return;
  const lab = document.createElement('span'); lab.className = 'small muted chips-label'; lab.textContent = 'セット'; box.appendChild(lab);
  box.appendChild(setChip('全部', allWords().length, !act.length, () => { selSets = []; saveSets(); }));
  names.forEach((n) => box.appendChild(setChip(n, countIn(n), act.includes(n), () => {
    selSets = act.includes(n) ? act.filter((x) => x !== n) : act.concat([n]); saveSets();
  })));
}
function saveSets() { try { localStorage.setItem(SETS_KEY, JSON.stringify(selSets)); } catch (e) {} renderSetChips(); renderStatusChips(); newDeck(); }
// 単語を差し替える（スプレッドシート／Apps Script から読み込んだとき）
function applyWords(list, src) {
  WORDS = number(list); source = src;
  renderSetChips();
  if (i === 0 && !busy) newDeck(); else renderCard();
  if (!$('v-words').hidden) renderList();
}

// ---------- views ----------
const views = ['cards', 'words', 'stats'];
function show(v) {
  if (!views.includes(v)) v = 'cards';
  views.forEach((x) => { $('v-' + x).hidden = x !== v; });
  document.querySelectorAll('.tab[data-view]').forEach((t) => { if (t.dataset.view === v) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
  if (v === 'words') renderList();
  if (v === 'stats') renderStats();
  if (location.hash !== '#' + v) history.replaceState(null, '', '#' + v);
}
document.querySelectorAll('.tab[data-view]').forEach((t) => t.addEventListener('click', () => show(t.dataset.view)));
window.addEventListener('hashchange', () => show(location.hash.slice(1)));

// ---------- flashcards ----------
let deck = [], i = 0, counts = { known: 0, unsure: 0, again: 0 }, missed = [], busy = false;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
function shuffle(a) { a = a.slice(); for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; }
function startDeck(d) { deck = d; i = 0; counts = { known: 0, unsure: 0, again: 0 }; missed = []; renderStatusChips(); renderCard(); }
function renderCard() {
  const total = deck.length, empty = total === 0, finished = !empty && i >= total;
  $('emptyCard').hidden = !empty;
  if (empty) { $('stage').hidden = true; $('doneCard').hidden = true; $('pos').textContent = '0 / 0'; $('bar').firstElementChild.style.width = '0'; return; }
  $('pos').textContent = Math.min(i + 1, total) + ' / ' + total;
  $('bar').firstElementChild.style.width = Math.round(i / total * 100) + '%';
  $('bar').setAttribute('aria-valuenow', i); $('bar').setAttribute('aria-valuemax', total);
  $('stage').hidden = finished; $('doneCard').hidden = !finished;
  $('cKnown').textContent = '覚えた ' + counts.known;
  $('cUnsure').textContent = '微妙 ' + counts.unsure;
  $('cAgain').textContent = 'もう一度 ' + counts.again;
  const t = db.days[today()]; const n = t ? t.known + t.unsure + t.again : 0;
  $('todayLine').textContent = '今日の合計 ' + n + '語';
  if (finished) {
    renderStatusChips();
    $('doneSum').textContent = '覚えた ' + counts.known + '語・微妙 ' + counts.unsure + '語・もう一度 ' + counts.again + '語';
    $('retry').disabled = missed.length === 0;
    return;
  }
  const w = deck[i];
  $('no').textContent = w.no ? 'No. ' + w.no : '追加した単語';
  const act = activeSets(), st = STATUS.filter(([k]) => selStatus.includes(k)).map(([, l]) => l);
  const label = act.concat(st);
  $('pool').textContent = label.length ? label.join('・') + '（' + pool().length + '語）から' : '全' + allWords().length + '語から';
  $('word').textContent = w.word;
  $('ex').textContent = w.example || '';
  $('meaning').textContent = w.meaning;
  setFlipped(false);
}
function setFlipped(f) { $('answer').hidden = !f; $('front').hidden = f; $('back').hidden = !f; $('stage').toggleAttribute('data-flipped', f); }
$('flip').addEventListener('click', () => setFlipped(true));
const dirs = { known: 'fly-right', unsure: 'fly-down', again: 'fly-left' };
function confetti() {
  const box = $('confetti'); box.innerHTML = '';
  const colors = ['#e43200', '#87cc5a', '#5bafc1', '#b4e5cc', '#ff6b3d', '#1a1a1a'];
  for (let n = 0; n < 36; n++) {
    const s = document.createElement('span');
    if (n % 3 === 0) s.className = 'dot';
    const a = (-160 + Math.random() * 140) * Math.PI / 180, d = 180 + Math.random() * 220;
    s.style.setProperty('--dx', Math.round(Math.cos(a) * d) + 'px');
    s.style.setProperty('--dy', Math.round(Math.sin(a) * d) + 'px');
    s.style.setProperty('--r', Math.round(Math.random() * 540 - 270) + 'deg');
    s.style.background = colors[n % colors.length];
    s.style.animationDelay = Math.round(Math.random() * 90) + 'ms';
    box.appendChild(s);
  }
  clearTimeout(confetti.t); confetti.t = setTimeout(() => { box.innerHTML = ''; }, 1300);
}
function answer(r) {
  if (busy || i >= deck.length) return;
  const w = deck[i];
  record(r, w); counts[r]++; if (r !== 'known') missed.push(w);
  const next = () => {
    i++; const cw = $('cardWrap'); cw.className = 'card-wrap enter'; renderCard();
    requestAnimationFrame(() => requestAnimationFrame(() => { cw.className = 'card-wrap'; busy = false; }));
  };
  if (reduce) { i++; renderCard(); return; }
  busy = true;
  if (r === 'known') confetti();
  $('cardWrap').className = 'card-wrap ' + dirs[r];
  setTimeout(next, 520);
}
$('back').addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (b) answer(b.dataset.r); });

// ---------- swipe (答えを見たあと：左＝もう一度、下＝微妙、右＝覚えた) ----------
(function () {
  const wrap = $('cardWrap'), hint = $('swipeHint');
  const LABEL = { again: 'もう一度', unsure: '微妙', known: '覚えた' };
  const TH = 90;
  let sx = 0, sy = 0, dx = 0, dy = 0, id = null;
  const dirOf = (x, y) => (y > Math.abs(x) && y > 0 ? 'unsure' : x < 0 ? 'again' : 'known');
  function showHint(x, y) {
    const d = dirOf(x, y), dist = d === 'unsure' ? y : Math.abs(x);
    hint.className = 'swipe-hint ' + d; hint.textContent = LABEL[d];
    hint.style.opacity = Math.min(1, Math.max(0, (dist - 20) / (TH - 20)));
  }
  function reset() { hint.style.opacity = 0; wrap.classList.remove('dragging'); }
  wrap.addEventListener('pointerdown', (e) => {
    if (!$('stage').hasAttribute('data-flipped') || busy || e.target.closest('button')) return;
    id = e.pointerId; sx = e.clientX; sy = e.clientY; dx = dy = 0;
    wrap.setPointerCapture(id); wrap.classList.add('dragging'); wrap.style.transition = 'none';
  });
  wrap.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    dx = e.clientX - sx; dy = e.clientY - sy;
    const y = Math.max(dy, -30); // 上方向にはほとんど動かさない
    wrap.style.transform = 'translate(' + dx + 'px,' + y + 'px) rotate(' + (dx / 22) + 'deg)';
    showHint(dx, dy);
  });
  function end(e) {
    if (e.pointerId !== id) return;
    id = null; reset();
    const d = dirOf(dx, dy), dist = d === 'unsure' ? dy : Math.abs(dx);
    wrap.style.transition = ''; // ここから先は CSS のアニメーションに任せる
    if (dist >= TH && !busy) { wrap.style.transform = ''; answer(d); }
    else { wrap.style.transform = ''; }
  }
  wrap.addEventListener('pointerup', end);
  wrap.addEventListener('pointercancel', end);
})();
$('retry').addEventListener('click', () => { if (missed.length) startDeck(missed.slice()); });
$('restart').addEventListener('click', () => newDeck());

// ---------- word list ----------
let limit = STEP, listSet = '';
function wordRow(w) {
  const li = document.createElement('div'); li.className = 'sb-list-item';
  const s = db.stats[w.word];
  li.innerHTML = '<div class="wi"><div style="display:flex;flex-direction:column;gap:2px;min-width:0"><div class="row" style="align-items:baseline"><span class="wi-w"></span><span></span></div><span class="wi-ex"></span></div><span class="badge"></span></div>';
  li.querySelector('.wi-w').textContent = w.word;
  li.querySelector('.wi-w').nextElementSibling.textContent = w.meaning;
  li.querySelector('.wi-ex').textContent = (w.example || '例文なし') + ((w.sets || []).length && setNames().length > 1 ? '　・' + w.sets.join('・') : '');
  const b = li.querySelector('.badge');
  if (s && s.last) {
    b.className = 'sb-badge' + (s.last === 'again' ? ' sb-badge-accent' : s.last === 'unsure' ? ' sb-badge-unsure' : '');
    b.textContent = { known: '覚えた', unsure: '微妙', again: 'もう一度' }[s.last];
    b.title = '最後の結果（' + s.at + '）';
  } else if (!w.no) { b.className = 'sb-badge'; b.textContent = '追加'; }
  return li;
}
function renderList() {
  const words = allWords();
  const q = $('q').value.trim().toLowerCase();
  const names = setNames();
  if (listSet && !names.includes(listSet)) listSet = '';
  const box = $('listSets'); box.hidden = names.length < 2; box.innerHTML = '';
  if (!box.hidden) {
    box.appendChild(setChip('全部', words.length, !listSet, () => { listSet = ''; limit = STEP; renderList(); }));
    names.forEach((n) => box.appendChild(setChip(n, countIn(n), listSet === n, () => { listSet = n; limit = STEP; renderList(); })));
  }
  const inSet = listSet ? words.filter((w) => (w.sets || []).includes(listSet)) : words;
  const m = q ? inSet.filter((w) => w.word.toLowerCase().includes(q) || w.meaning.includes(q)) : inSet;
  $('list-title').textContent = '登録した単語 ' + words.length + '語';
  $('hits').hidden = !q && !listSet; $('hits').textContent = (listSet ? listSet + '：' : '') + m.length + (q ? '件見つかりました' : '語');
  const list = $('list'); list.innerHTML = '';
  m.slice(0, limit).forEach((w) => list.appendChild(wordRow(w)));
  if (!m.length) { const p = document.createElement('p'); p.className = 'muted'; p.style.padding = '24px 12px'; p.style.margin = '0'; p.textContent = '一致する単語はありません。'; list.appendChild(p); }
  const rest = m.length - Math.min(limit, m.length);
  $('moreRow').hidden = rest <= 0;
  $('more').textContent = 'さらに' + Math.min(STEP, rest) + '語を表示（残り' + rest + '語）';
}
$('q').addEventListener('input', () => { limit = STEP; renderList(); });
$('more').addEventListener('click', () => { limit += STEP; renderList(); });
const fW = $('fW'), fM = $('fM'), fE = $('fE');
[fW, fM].forEach((el) => el.addEventListener('input', () => { $('addBtn').disabled = !fW.value.trim() || !fM.value.trim(); }));
$('addForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!fW.value.trim() || !fM.value.trim()) return;
  db.added.unshift({ word: fW.value.trim(), meaning: fM.value.trim(), example: fE.value.trim() });
  save(); fW.value = fM.value = fE.value = ''; $('addBtn').disabled = true; $('q').value = ''; limit = STEP; renderList(); fW.focus();
});

// ---------- stats ----------
function lastDays(n) { const out = []; const d = new Date(); d.setHours(12); for (let k = n - 1; k >= 0; k--) { const x = new Date(d); x.setDate(d.getDate() - k); out.push(x); } return out; }
const sum = (r) => r ? r.known + r.unsure + r.again : 0;
function renderStats() {
  const days = lastDays(30);
  const rows = days.map((d) => { const k = dayKey(d); const r = db.days[k] || { known: 0, unsure: 0, again: 0 }; return { k, d, r, t: sum(r) }; });
  $('tToday').textContent = sum(db.days[today()]);
  $('tWeek').textContent = rows.slice(-7).reduce((a, x) => a + x.t, 0);
  $('tAll').textContent = Object.values(db.days).reduce((a, r) => a + sum(r), 0);
  let streak = 0; const d = new Date(); d.setHours(12);
  if (!sum(db.days[dayKey(d)])) d.setDate(d.getDate() - 1);
  while (sum(db.days[dayKey(d)]) > 0) { streak++; d.setDate(d.getDate() - 1); }
  $('tStreak').textContent = streak;

  // chart
  const W = 820, H = 240, L = 36, B = 28, T = 12, R = 4;
  const max = Math.max(10, ...rows.map((x) => x.t));
  const nice = Math.ceil(max / 5) * 5;
  const pw = (W - L - R) / rows.length, bw = Math.max(6, pw - 8);
  const y = (v) => T + (H - T - B) * (1 - v / nice);
  let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="直近30日の日ごとの復習数（積み上げ棒グラフ）"><g class="grid">';
  for (let g = 0; g <= 5; g++) { const v = nice / 5 * g; svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>'; }
  svg += '</g><g class="axis">';
  for (let g = 0; g <= 5; g++) { const v = nice / 5 * g; svg += '<text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + '</text>'; }
  rows.forEach((x, n) => { if (n % 5 === 4 || n === rows.length - 1) svg += '<text x="' + (L + pw * n + pw / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + (x.d.getMonth() + 1) + '/' + x.d.getDate() + '</text>'; });
  svg += '</g><g>';
  const segs = [['known', '#87cc5a'], ['unsure', '#5bafc1'], ['again', '#e43200']];
  rows.forEach((x, n) => {
    const cx = L + pw * n + (pw - bw) / 2; let acc = 0;
    const live = segs.filter(([k]) => x.r[k] > 0);
    live.forEach(([k, c], si) => {
      const v = x.r[k]; const y0 = y(acc), y1 = y(acc + v); acc += v;
      const top = si === live.length - 1;
      const h = Math.max(0, y0 - y1 - (top ? 0 : 2));
      const yy = y1 + (top ? 0 : 2);
      if (top) { const rr = Math.min(4, h, bw / 2); svg += '<path fill="' + c + '" d="M' + cx + ',' + (yy + h) + 'V' + (yy + rr) + 'Q' + cx + ',' + yy + ' ' + (cx + rr) + ',' + yy + 'H' + (cx + bw - rr) + 'Q' + (cx + bw) + ',' + yy + ' ' + (cx + bw) + ',' + (yy + rr) + 'V' + (yy + h) + 'Z"/>'; }
      else svg += '<rect fill="' + c + '" x="' + cx + '" y="' + yy + '" width="' + bw + '" height="' + h + '"/>';
    });
  });
  svg += '</g><g>';
  rows.forEach((x, n) => { svg += '<rect class="hit" data-i="' + n + '" x="' + (L + pw * n) + '" y="' + T + '" width="' + pw + '" height="' + (H - T - B) + '"/>'; });
  svg += '</g></svg><div class="tip" hidden></div>';
  const ch = $('chart'); ch.innerHTML = svg;
  const tip = ch.querySelector('.tip');
  ch.querySelectorAll('.hit').forEach((h) => {
    h.addEventListener('mouseenter', () => {
      const x = rows[+h.dataset.i]; const bb = h.getBoundingClientRect(), cb = ch.getBoundingClientRect();
      tip.innerHTML = '<b>' + (x.d.getMonth() + 1) + '月' + x.d.getDate() + '日　' + x.t + '語</b><br>覚えた ' + x.r.known + '・微妙 ' + x.r.unsure + '・もう一度 ' + x.r.again;
      tip.style.left = Math.min(Math.max(bb.left - cb.left + bb.width / 2, 110), cb.width - 110) + 'px';
      tip.style.top = (y(x.t) / H * cb.height) + 'px'; tip.hidden = false;
    });
    h.addEventListener('mouseleave', () => { tip.hidden = true; });
  });
  // table
  const tb = $('tbl'); tb.innerHTML = '';
  rows.slice().reverse().filter((x) => x.t > 0).forEach((x) => {
    const tr = document.createElement('tr');
    [x.k, x.r.known, x.r.unsure, x.r.again, x.t].forEach((v) => { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); });
    tb.appendChild(tr);
  });
  if (!tb.children.length) tb.innerHTML = '<tr><td colspan="5" class="muted">まだ記録がありません。</td></tr>';
}
function download(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('csv').addEventListener('click', () => {
  const lines = ['date,known,unsure,again,total'];
  Object.keys(db.days).sort().forEach((k) => { const r = db.days[k]; lines.push([k, r.known, r.unsure, r.again, sum(r)].join(',')); });
  download('word-review-history-' + today() + '.csv', '﻿' + lines.join('\n'), 'text/csv');
});
$('backup').addEventListener('click', () => download('word-review-backup-' + today() + '.json', JSON.stringify(db, null, 1), 'application/json'));
$('restore').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!d || typeof d.days !== 'object') throw new Error();
    db = { days: d.days || {}, added: d.added || [], stats: d.stats || {} }; save(); renderStats(); renderCard();
    alert('バックアップを読み込みました。');
  } catch (err) { alert('このファイルは読み込めませんでした。'); }
  e.target.value = '';
});

// ---------- start ----------
$('sheetForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const url = $('sheetUrl').value.trim();
  if (url && !/^https:\/\/docs\.google\.com\/spreadsheets\//.test(url)) { setSheetStatus('Google スプレッドシートの URL を貼ってください。'); return; }
  sheet = { url }; writeSheetCfg(sheet);
  if (!url) { applyWords(window.BUILTIN_WORDS || [], 'builtin'); renderSheetStatus(); return; }
  syncSheet();
});
$('sheetReload').addEventListener('click', () => syncSheet());

renderSetChips();
newDeck();
show(location.hash.slice(1) || 'cards');
renderSheetStatus();
syncSheet();
// タブに戻ってきたときも最新を読み込む（5分おき）
let lastSync = Date.now();
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastSync > 300000) { lastSync = Date.now(); syncSheet(); } });

// ---------- background ----------
const BG_KEY = 'word-review-bg', BG_IMG_KEY = 'word-review-bg-image';
const BGS = ['shapes', 'dots', 'grid', 'watercolor', 'plain', 'stripe', 'gingham', 'polka', 'confetti', 'wave', 'note', 'checker', 'sparkle', 'abc', 'sky', 'gradient', 'custom'];
function getStore(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function setStore(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
function applyBg(name) {
  const img = getStore(BG_IMG_KEY);
  if (name === 'custom' && !img) name = 'shapes';
  if (!BGS.includes(name)) name = 'shapes';
  BGS.forEach((b) => document.body.classList.remove('bgx-' + b));
  document.body.classList.add('bgx-' + name);
  document.body.style.backgroundImage = name === 'custom' ? 'url("' + img + '")' : '';
  $('swCustom').hidden = !img;
  if (img) $('swCustomImg').style.backgroundImage = 'url("' + img + '")';
  document.querySelectorAll('.sw[data-bg]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.bg === name ? 'true' : 'false'));
  setStore(BG_KEY, name);
}
$('bgToggle').addEventListener('click', () => {
  const open = $('bgPanel').hidden;
  $('bgPanel').hidden = !open; $('bgToggle').setAttribute('aria-expanded', String(open));
});
$('swatches').addEventListener('click', (e) => { const b = e.target.closest('.sw[data-bg]'); if (b) applyBg(b.dataset.bg); });
// 自分の画像：大きすぎる画像は 1920px に縮めてから保存する
$('bgFile').addEventListener('change', (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const url = URL.createObjectURL(f), im = new Image();
  im.onload = () => {
    const scale = Math.min(1, 1920 / Math.max(im.width, im.height));
    const c = document.createElement('canvas'); c.width = Math.round(im.width * scale); c.height = Math.round(im.height * scale);
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
    let data = c.toDataURL('image/jpeg', 0.82);
    if (!setStore(BG_IMG_KEY, data)) { data = c.toDataURL('image/jpeg', 0.6); if (!setStore(BG_IMG_KEY, data)) { alert('画像が大きすぎて保存できませんでした。小さめの画像で試してください。'); return; } }
    applyBg('custom');
  };
  im.onerror = () => { URL.revokeObjectURL(url); alert('この画像は読み込めませんでした。'); };
  im.src = url;
});
applyBg(getStore(BG_KEY) || 'shapes');

// ---------- keyboard (PC)：Enter / Space / ↑ で裏返す、← ↓ → で答える ----------
document.addEventListener('keydown', (e) => {
  if ($('v-cards').hidden || e.altKey || e.ctrlKey || e.metaKey) return;
  const t = e.target;
  if (t.closest && t.closest('input, textarea, select, [contenteditable]')) return;
  if (t.closest && t.closest('button, a, label') && (e.key === 'Enter' || e.key === ' ')) return; // ボタン上の Enter はボタン自身に任せる
  if (!$('bgPanel').hidden || !$('bgmPanel').hidden) { if (e.key === 'Escape') { $('bgPanel').hidden = true; $('bgmPanel').hidden = true; } return; }
  if ($('stage').hidden) { if (e.key === 'Enter') { e.preventDefault(); $('restart').click(); } return; }
  const flipped = $('stage').hasAttribute('data-flipped');
  if (!flipped && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowUp')) { e.preventDefault(); setFlipped(true); return; }
  const map = { ArrowLeft: 'again', ArrowDown: 'unsure', ArrowRight: 'known' };
  if (flipped && map[e.key]) { e.preventDefault(); if (!e.repeat) answer(map[e.key]); }
});
