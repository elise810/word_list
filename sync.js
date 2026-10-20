// ===== 記録をスプレッドシートに送る（スマホとPCで共有） =====
// Google Apps Script（gas/Code.gs）を「ウェブアプリ」として公開し、その URL と合言葉を「記録」画面で設定します。
// URL と合言葉はこのブラウザにだけ保存され、GitHub には載りません。
(function () {
  const SYNC_KEY = 'word-review-sync';      // { url, token, device, uploaded }
  const QUEUE_KEY = 'word-review-queue';    // 送れていない記録
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  let cfg = read(SYNC_KEY, {});
  let queue = read(QUEUE_KEY, []);
  let server = null;   // 最後に読み込んだシートの集計
  const on = () => !!(cfg.url && /^https:\/\/script\.google(usercontent)?\.com\//.test(cfg.url));

  function guessDevice() {
    const ua = navigator.userAgent;
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Android/.test(ua)) return 'Android';
    if (/Mac/.test(ua)) return 'Mac';
    if (/Windows/.test(ua)) return 'Windows';
    return 'ブラウザ';
  }

  // ---------- send ----------
  let flushing = false;
  async function flush() {
    if (!on() || flushing || !queue.length) return;
    flushing = true;
    const batch = queue.slice(0, 200);
    try {
      // Apps Script は CORS に対応していないので、結果を読まない no-cors で送る
      await fetch(cfg.url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token: cfg.token || '', items: batch }) });
      queue = queue.slice(batch.length); write(QUEUE_KEY, queue);
    } catch (e) { /* オフラインなど：次の機会にまとめて送る */ }
    flushing = false;
    renderSync();
    if (queue.length) setTimeout(flush, 3000);
  }

  // app.js の record() に「シートにも送る」を足す
  const baseRecord = record;
  record = function (result, w) {
    baseRecord(result, w);
    if (!on()) return;
    queue.push({ ts: new Date().toISOString(), date: today(), word: w.word, result, n: 1, device: cfg.device || guessDevice() });
    write(QUEUE_KEY, queue);
    flush();
  };

  // ---------- receive (JSONP) ----------
  function jsonp(params) {
    return new Promise((resolve, reject) => {
      const cb = '__wrSync' + Date.now();
      const s = document.createElement('script');
      const done = (fn, v) => { clearTimeout(t); delete window[cb]; s.remove(); fn(v); };
      const t = setTimeout(() => done(reject, new Error('timeout')), 20000);
      window[cb] = (data) => done(resolve, data);
      s.onerror = () => done(reject, new Error('network'));
      const q = Object.entries(Object.assign({ callback: cb, token: cfg.token || '', _: Date.now() }, params)).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
      s.src = cfg.url + (cfg.url.includes('?') ? '&' : '?') + q;
      document.head.appendChild(s);
    });
  }
  async function pull() {
    if (!on()) { renderSync(); return; }
    setStatus('シートから記録を読み込み中…');
    try {
      const data = await jsonp({ action: 'stats' });
      if (!data || !data.ok) throw new Error(data && data.error === 'token' ? 'token' : 'error');
      server = data;
      // 連携前の記録を、上書きする前に1回だけ控えておく（「これまでの記録を送る」用）
      if (!cfg.snapshot) { cfg.snapshot = JSON.parse(JSON.stringify(db.days || {})); write(SYNC_KEY, cfg); }
      // シートの集計 ＋ まだ送れていない分 を、このブラウザの表示に使う
      const days = JSON.parse(JSON.stringify(data.days || {}));
      queue.forEach((x) => { const d = days[x.date] || (days[x.date] = { known: 0, unsure: 0, again: 0 }); d[x.result] = (d[x.result] || 0) + (x.n || 1); });
      db.days = days;
      Object.entries(data.words || {}).forEach(([word, s]) => { db.stats[word] = s; });
      save();
      cfg.at = new Date().toISOString(); cfg.error = ''; write(SYNC_KEY, cfg);
      if (!$('v-stats').hidden) renderStats();
      if (!$('v-words').hidden) renderList();
      renderCard();
    } catch (e) {
      cfg.error = e.message === 'token' ? '合言葉が違います' : '接続できませんでした'; write(SYNC_KEY, cfg);
    }
    renderSync();
  }

  // ---------- UI ----------
  function setStatus(t) { $('syncStatus').textContent = t; }
  function renderSync() {
    $('syncUrl').value = cfg.url || '';
    $('syncToken').value = cfg.token || '';
    $('syncDevice').value = cfg.device || guessDevice();
    $('syncPull').hidden = !on();
    const localTotal = Object.values(cfg.snapshot || db.days || {}).reduce((a, r) => a + sum(r), 0);
    $('syncUpload').hidden = !(on() && server && !cfg.uploaded && localTotal > 0);
    $('syncUpload').textContent = 'このブラウザのこれまでの記録（' + localTotal + '語）をシートに送る';
    if (!cfg.url) { setStatus('未設定（記録はこのブラウザだけに保存されています）'); return; }
    if (!on()) { setStatus('Apps Script のウェブアプリの URL（https://script.google.com/…/exec）を貼ってください'); return; }
    if (cfg.error) { setStatus(cfg.error + '。URL と合言葉、ウェブアプリのアクセス権が「全員」になっているか確認してください。'); return; }
    const at = cfg.at ? new Date(cfg.at) : null;
    const t = at ? (at.getMonth() + 1) + '/' + at.getDate() + ' ' + pad(at.getHours()) + ':' + pad(at.getMinutes()) : '';
    setStatus('シートと連携中' + (server ? '（シートの合計 ' + (server.total || 0) + '語）' : '') + (queue.length ? '・送信待ち ' + queue.length + '件' : '') + (t ? '　' + t : ''));
  }
  $('syncForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const url = $('syncUrl').value.trim();
    cfg = Object.assign({}, cfg, { url, token: $('syncToken').value.trim(), device: $('syncDevice').value.trim() || guessDevice(), error: '' });
    write(SYNC_KEY, cfg);
    renderSync();
    if (on()) pull().then(flush);
  });
  $('syncPull').addEventListener('click', () => flush().then(pull));
  // 連携前の記録（このブラウザの日ごとの合計）を1回だけ送る
  $('syncUpload').addEventListener('click', async () => {
    const local = cfg.snapshot || {};
    const dev = cfg.device || guessDevice();
    Object.entries(local).forEach(([date, r]) => ['known', 'unsure', 'again'].forEach((k) => {
      if (r[k] > 0) queue.push({ ts: new Date(date + 'T12:00:00').toISOString(), date, word: '', result: k, n: r[k], device: dev + '（まとめ）' });
    }));
    write(QUEUE_KEY, queue);
    cfg.uploaded = true; write(SYNC_KEY, cfg);
    setStatus('送信中…');
    await flush();
    setTimeout(pull, 2500);
  });
  document.querySelector('.tab[data-view="stats"]').addEventListener('click', () => { if (on()) flush().then(pull); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && on()) flush().then(pull); });
  window.addEventListener('online', flush);

  renderSync();
  if (on()) flush().then(pull);
})();
