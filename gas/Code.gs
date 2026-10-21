/**
 * Word Review — 記録をスプレッドシートに残す Apps Script
 *
 * 使い方
 * 1. 単語のスプレッドシートで「拡張機能 → Apps Script」を開き、このファイルの中身を貼り付ける
 * 2. 下の TOKEN を好きな合言葉に変える（アプリの「記録」画面にも同じものを入れる）
 * 3. 「デプロイ → 新しいデプロイ → ウェブアプリ」
 *      次のユーザーとして実行：自分
 *      アクセスできるユーザー：全員
 * 4. 表示された URL（…/exec）をアプリの「記録」画面に貼る
 *
 * 単語のセット：単語を入れたシートを増やすと、シート名がそのままアプリの「セット」になります。
 * （「記録」シート、名前が「_」で始まるシート、非表示のシートは単語として読みません）
 *
 * コードを書き換えたあとは「デプロイ → デプロイを管理 → 編集（鉛筆）→ バージョン：新バージョン → デプロイ」で更新します。
 *
 * このファイルは GitHub に載るので、ここの TOKEN は書き換えずに置いておき、
 * 合言葉は Apps Script のエディタの中だけで設定してください。
 */
const TOKEN = 'ここを好きな合言葉に変える';
const SHEET_NAME = '記録';
const HEADER = ['日時', '日付', '単語', '結果', '件数', '端末'];
const LABEL = { known: '覚えた', unsure: '微妙', again: 'もう一度' };
const KEY_OF = { '覚えた': 'known', '微妙': 'unsure', 'もう一度': 'again' };

function sheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADER);
    sh.setFrozenRows(1);
    sh.getRange('B:B').setNumberFormat('@'); // 日付は文字のまま保存する
  }
  return sh;
}

function out_(obj, callback) {
  const json = JSON.stringify(obj);
  if (callback && /^[A-Za-z0-9_$]+$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + json + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

// 記録を受け取ってシートに追加する
function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'json' }); }
  if (body.token !== TOKEN) return out_({ ok: false, error: 'token' });
  const items = (body.items || []).filter(function (x) { return LABEL[x.result]; }).slice(0, 500);
  if (!items.length) return out_({ ok: true, n: 0 });
  const rows = items.map(function (x) {
    return [new Date(x.ts || Date.now()), String(x.date || ''), String(x.word || ''), LABEL[x.result], Number(x.n) || 1, String(x.device || '')];
  });
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet_();
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, HEADER.length).setValues(rows);
  } finally { lock.releaseLock(); }
  return out_({ ok: true, n: rows.length });
}

// 単語：「記録」以外の全シートを、シート名＝セットとして返す
// シート名が「_」で始まるシートと、非表示のシートは読みません
function words_() {
  const sets = [];
  SpreadsheetApp.getActive().getSheets().forEach(function (sh) {
    const name = sh.getName();
    if (name === SHEET_NAME || name.charAt(0) === '_' || sh.isSheetHidden() || sh.getLastRow() < 2) return;
    const values = sh.getDataRange().getDisplayValues();
    const head = values[0].map(function (x) { return String(x).trim(); });
    const find = function (re, fb) { for (let i = 0; i < head.length; i++) if (re.test(head[i])) return i; return fb; };
    const iw = find(/^(単語|英単語|word)$/i, 0), im = find(/意味|meaning/i, 2), ie = find(/例文|example/i, 1);
    const words = [];
    values.slice(1).forEach(function (r) {
      const w = String(r[iw] || '').trim(), m = String(r[im] || '').trim();
      if (w && m) words.push({ word: w, meaning: m, example: String(r[ie] || '').trim() });
    });
    if (words.length) sets.push({ name: name, words: words });
  });
  return { ok: true, sets: sets };
}

// 日ごと・単語ごとの集計を返す
function doGet(e) {
  const p = e.parameter || {};
  if (p.token !== TOKEN) return out_({ ok: false, error: 'token' }, p.callback);
  if (p.action === 'words') return out_(words_(), p.callback);
  const sh = sheet_();
  const last = sh.getLastRow();
  const days = {}, words = {};
  let total = 0;
  if (last > 1) {
    const values = sh.getRange(2, 1, last - 1, HEADER.length).getValues();
    const tz = Session.getScriptTimeZone();
    values.forEach(function (r) {
      const date = r[1] instanceof Date ? Utilities.formatDate(r[1], tz, 'yyyy-MM-dd') : String(r[1]);
      const k = KEY_OF[r[3]]; const n = Number(r[4]) || 1;
      if (!date || !k) return;
      const d = days[date] || (days[date] = { known: 0, unsure: 0, again: 0 });
      d[k] += n; total += n;
      const word = String(r[2] || '');
      if (word) {
        const s = words[word] || (words[word] = { known: 0, unsure: 0, again: 0, last: '', at: '' });
        s[k] += n;
        if (date >= s.at) { s.last = k; s.at = date; }
      }
    });
  }
  return out_({ ok: true, total: total, days: days, words: words }, p.callback);
}
