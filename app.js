'use strict';

/* ============ 定数 ============ */
const STORAGE_KEY = 'slotTracker.records.v1';
const NUM_FIELDS = ['invest', 'payout', 'games', 'bbSolo', 'bbCombo', 'rbSolo', 'rbCombo', 'grape', 'cherry', 'rareCherry', 'oneCoin'];
const OPT_FIELDS = ['games', 'bbSolo', 'bbCombo', 'rbSolo', 'rbCombo', 'grape', 'cherry', 'rareCherry', 'oneCoin'];

// 確率項目の定義: parts のすべてが入力されている実戦だけを集計対象にする
const PROB_DEFS = [
  { group: 'ボーナス', label: '単独BB', parts: ['bbSolo'] },
  { group: 'ボーナス', label: '複合BB', parts: ['bbCombo'] },
  { group: 'ボーナス', label: 'BB合算', parts: ['bbSolo', 'bbCombo'] },
  { group: 'ボーナス', label: '単独RB', parts: ['rbSolo'] },
  { group: 'ボーナス', label: '複合RB', parts: ['rbCombo'] },
  { group: 'ボーナス', label: 'RB合算', parts: ['rbSolo', 'rbCombo'] },
  { group: 'ボーナス', label: 'ボーナス合算', parts: ['bbSolo', 'bbCombo', 'rbSolo', 'rbCombo'] },
  { group: '小役', label: 'ブドウ', parts: ['grape'] },
  { group: '小役', label: 'チェリー', parts: ['cherry'] },
  { group: '小役', label: 'レアチェリー', parts: ['rareCherry'] },
  { group: '小役', label: '一枚役', parts: ['oneCoin'] },
];

/* ============ ストレージ ============ */
let records = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map(normalize).filter(Boolean) : [];
  } catch (e) {
    console.error(e);
    return [];
  }
}
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (e) {
    alert('保存に失敗しました: ' + e.message);
  }
}
function normalize(r) {
  if (!r || typeof r !== 'object' || !r.date || !r.machine) return null;
  const out = {
    id: String(r.id || uid()),
    date: String(r.date).slice(0, 10),
    hall: String(r.hall || ''),
    machine: String(r.machine).trim(),
    tableNo: String(r.tableNo ?? ''),
    memo: String(r.memo || ''),
    updatedAt: r.updatedAt || Date.now(),
  };
  for (const f of NUM_FIELDS) out[f] = toNum(r[f]);
  if (out.invest == null) out.invest = 0;
  if (out.payout == null) out.payout = 0;
  return out;
}
function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ============ ユーティリティ ============ */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => (n == null ? '—' : Math.round(n).toLocaleString('ja-JP'));
const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(Math.round(n)).toLocaleString('ja-JP');
const cls = n => (n > 0 ? 'plus' : n < 0 ? 'minus' : '');
const diffOf = r => (r.payout || 0) - (r.invest || 0);
const sum = (arr, f) => arr.reduce((a, r) => a + (typeof f === 'function' ? f(r) : r[f] || 0), 0);
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 1800);
}
function sortedRecords() {
  return [...records].sort((a, b) => (b.date.localeCompare(a.date)) || (b.updatedAt - a.updatedAt));
}
function machines() {
  return [...new Set(records.map(r => r.machine))].sort((a, b) => a.localeCompare(b, 'ja'));
}

/* ============ 統計 ============ */
// 確率は必ず「回転数の合計 ÷ 回数の合計」で算出する
function calcProbs(recs) {
  return PROB_DEFS.map(def => {
    const target = recs.filter(r => r.games != null && r.games > 0 && def.parts.every(p => r[p] != null));
    if (!target.length) return null;
    const games = sum(target, 'games');
    const count = sum(target, r => def.parts.reduce((a, p) => a + r[p], 0));
    return { ...def, games, count, n: target.length, prob: count > 0 ? games / count : null };
  }).filter(Boolean);
}
function calcMoney(recs) {
  const invest = sum(recs, 'invest');
  const payout = sum(recs, 'payout');
  const days = new Set(recs.map(r => r.date)).size;
  const wins = recs.filter(r => diffOf(r) > 0).length;
  const gamesRecs = recs.filter(r => r.games != null);
  return {
    count: recs.length, days, invest, payout, diff: payout - invest, wins,
    games: sum(gamesRecs, 'games'),
    winRate: recs.length ? (wins / recs.length) * 100 : 0,
  };
}

function moneyHTML(m) {
  return `
    <div class="kv">
      <div><span>実戦数</span><b>${m.count}回</b></div>
      <div><span>稼働日数</span><b>${m.days}日</b></div>
      <div><span>投資</span><b>${fmt(m.invest)}枚</b></div>
      <div><span>回収</span><b>${fmt(m.payout)}枚</b></div>
      <div><span>総回転数</span><b>${m.games ? fmt(m.games) + 'G' : '—'}</b></div>
      <div><span>勝率</span><b>${m.winRate.toFixed(1)}%</b></div>
    </div>`;
}
function probsHTML(probs) {
  if (!probs.length) return '<p class="hint">確率を算出できるデータがありません(総回転数と各回数を入力すると表示されます)。</p>';
  let html = '';
  for (const group of ['ボーナス', '小役']) {
    const rows = probs.filter(p => p.group === group);
    if (!rows.length) continue;
    html += `<div class="subttl">${group}</div><table class="probs">
      <tr><th></th><th>回数</th><th>対象G数</th><th>確率</th></tr>
      ${rows.map(p => `<tr>
        <td>${p.label}</td>
        <td>${fmt(p.count)}</td>
        <td>${fmt(p.games)}</td>
        <td class="p">${p.prob ? '1/' + p.prob.toFixed(1) : '—'}</td>
      </tr>`).join('')}
    </table>`;
  }
  return html;
}

/* ============ タブ ============ */
const TAB_TITLES = { record: '実戦記録', machine: '機種別サマリー', total: '全体サマリー', graph: '収支グラフ', data: 'データ管理' };
let currentTab = 'record';
function showTab(name) {
  currentTab = name;
  $$('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  $$('.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + name));
  $('#title').textContent = TAB_TITLES[name];
  render();
  window.scrollTo(0, 0);
}
$$('.tabbar button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

function render() {
  refreshDatalists();
  if (currentTab === 'record') renderList();
  if (currentTab === 'machine') renderMachine();
  if (currentTab === 'total') renderTotal();
  if (currentTab === 'graph') renderGraph();
  if (currentTab === 'data') renderData();
}

/* ============ 入力フォーム ============ */
const form = $('#form');
function resetForm(keep) {
  const prev = keep ? { date: form.date.value, hall: form.hall.value } : null;
  form.reset();
  form.id.value = '';
  form.date.value = prev?.date || today();
  if (prev) form.hall.value = prev.hall;
  else {
    const last = sortedRecords()[0];
    if (last) form.hall.value = last.hall;
  }
  $('#btn-save').textContent = '記録する';
  $('#btn-cancel').hidden = true;
  updateFormDiff();
}
function updateFormDiff() {
  const inv = toNum(form.invest.value), pay = toNum(form.payout.value);
  const el = $('#form-diff');
  if (inv == null && pay == null) { el.textContent = '—'; el.className = ''; return; }
  const d = (pay || 0) - (inv || 0);
  el.textContent = signed(d) + '枚';
  el.className = cls(d);
}
form.invest.addEventListener('input', updateFormDiff);
form.payout.addEventListener('input', updateFormDiff);

form.addEventListener('submit', e => {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(form));
  for (const k of NUM_FIELDS) {
    if (fd[k] !== '' && (toNum(fd[k]) == null || toNum(fd[k]) < 0)) {
      alert('数値の入力が正しくありません'); return;
    }
  }
  const editing = !!fd.id;
  const rec = normalize({ ...fd, id: fd.id || uid(), updatedAt: Date.now() });
  if (!rec) return;
  if (editing) {
    const i = records.findIndex(r => r.id === rec.id);
    if (i >= 0) records[i] = rec; else records.push(rec);
  } else {
    records.push(rec);
  }
  save();
  toast(editing ? '更新しました' : `記録しました(${signed(diffOf(rec))}枚)`);
  const detailOpen = $('#detail').open;
  resetForm(true);
  $('#detail').open = detailOpen;
  render();
});
$('#btn-cancel').addEventListener('click', () => resetForm(false));

function editRecord(id) {
  const r = records.find(x => x.id === id);
  if (!r) return;
  form.id.value = r.id;
  for (const k of ['date', 'hall', 'machine', 'tableNo', 'memo']) form[k].value = r[k] || '';
  for (const k of NUM_FIELDS) form[k].value = r[k] ?? '';
  $('#detail').open = OPT_FIELDS.slice(1).some(k => r[k] != null);
  $('#btn-save').textContent = '更新する';
  $('#btn-cancel').hidden = false;
  updateFormDiff();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function deleteRecord(id) {
  const r = records.find(x => x.id === id);
  if (!r || !confirm(`${r.date} ${r.machine}(${r.tableNo}番台)の記録を削除しますか?`)) return;
  records = records.filter(x => x.id !== id);
  save();
  if (form.id.value === id) resetForm(false);
  toast('削除しました');
  render();
}

function refreshDatalists() {
  const halls = [...new Set(sortedRecords().map(r => r.hall).filter(Boolean))];
  $('#dl-hall').innerHTML = halls.map(h => `<option value="${esc(h)}">`).join('');
  $('#dl-machine').innerHTML = machines().map(m => `<option value="${esc(m)}">`).join('');
}

/* ============ 記録一覧 ============ */
let listLimit = 30;
function fillSelect(sel, options, allLabel) {
  const cur = sel.value;
  sel.innerHTML = `<option value="">${allLabel}</option>` + options.map(o => `<option value="${esc(o.v)}">${esc(o.t)}</option>`).join('');
  if (options.some(o => o.v === cur)) sel.value = cur;
}
function renderList() {
  const months = [...new Set(records.map(r => r.date.slice(0, 7)))].sort().reverse();
  fillSelect($('#list-month'), months.map(m => ({ v: m, t: m.replace('-', '年') + '月' })), '全期間');
  fillSelect($('#list-machine'), machines().map(m => ({ v: m, t: m })), '全機種');
  const fm = $('#list-month').value, fma = $('#list-machine').value;
  const list = sortedRecords().filter(r => (!fm || r.date.startsWith(fm)) && (!fma || r.machine === fma));
  const el = $('#list');
  if (!list.length) { el.innerHTML = '<div class="empty">記録がありません</div>'; return; }
  const tot = sum(list, diffOf);
  el.innerHTML = `<p class="hint">${list.length}件 / 差枚合計 <b class="${cls(tot)}">${signed(tot)}枚</b></p>` +
    list.slice(0, listLimit).map(r => {
      const d = diffOf(r);
      return `<div class="rec">
        <div class="main">
          <div class="t1">${esc(r.machine)} <small>${esc(r.tableNo)}番</small></div>
          <div class="t2">${r.date} ・ ${esc(r.hall)}${r.games != null ? ' ・ ' + fmt(r.games) + 'G' : ''}${r.memo ? ' ・ ' + esc(r.memo) : ''}</div>
        </div>
        <div class="d ${cls(d)}">${signed(d)}</div>
        <div class="acts">
          <button class="iconbtn" data-edit="${r.id}" aria-label="編集">✎</button>
          <button class="iconbtn" data-del="${r.id}" aria-label="削除">🗑</button>
        </div>
      </div>`;
    }).join('') +
    (list.length > listLimit ? `<button class="btn block" id="btn-more">もっと見る(残り${list.length - listLimit}件)</button>` : '');
}
$('#list').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.edit) editRecord(b.dataset.edit);
  else if (b.dataset.del) deleteRecord(b.dataset.del);
  else if (b.id === 'btn-more') { listLimit += 30; renderList(); }
});
$('#list-month').addEventListener('change', () => { listLimit = 30; renderList(); });
$('#list-machine').addEventListener('change', () => { listLimit = 30; renderList(); });

/* ============ 機種別サマリー ============ */
function renderMachine() {
  const el = $('#machine-summary');
  const ms = machines();
  if (!ms.length) { el.innerHTML = '<div class="empty">記録がありません</div>'; return; }
  const items = ms.map(m => {
    const recs = records.filter(r => r.machine === m);
    return { m, recs, money: calcMoney(recs), last: recs.reduce((a, r) => (r.date > a ? r.date : a), '') };
  }).sort((a, b) => b.last.localeCompare(a.last));
  el.innerHTML = items.map(({ m, recs, money }) => `
    <details class="card" ${items.length <= 3 ? 'open' : ''}>
      <summary>
        <span class="sum-head" style="display:inline-flex;width:calc(100% - 20px)">
          <span>${esc(m)}</span>
          <b class="${cls(money.diff)}">${signed(money.diff)}枚</b>
        </span>
      </summary>
      ${moneyHTML(money)}
      ${probsHTML(calcProbs(recs))}
    </details>`).join('');
}

/* ============ 全体サマリー ============ */
function renderTotal() {
  const el = $('#total-summary');
  if (!records.length) { el.innerHTML = '<div class="empty">記録がありません</div>'; return; }
  const money = calcMoney(records);
  const thisMonth = today().slice(0, 7);
  const mRecs = records.filter(r => r.date.startsWith(thisMonth));
  const mDiff = sum(mRecs, diffOf);
  const byMachine = machines().map(m => {
    const rs = records.filter(r => r.machine === m);
    return { m, n: rs.length, diff: sum(rs, diffOf) };
  }).sort((a, b) => b.diff - a.diff);

  el.innerHTML = `
    <div class="card">
      <div class="sum-head"><h3>累計収支</h3><span class="big ${cls(money.diff)}">${signed(money.diff)}枚</span></div>
      <div class="sum-head"><span class="hint" style="margin:0">今月(${thisMonth.replace('-', '/')})</span><b class="${cls(mDiff)}">${signed(mDiff)}枚</b></div>
      ${moneyHTML(money)}
    </div>
    <div class="card">
      <h3>全機種合算の確率</h3>
      <p class="hint">各項目が入力された実戦のみを対象に「回転数合計 ÷ 回数合計」で算出</p>
      ${probsHTML(calcProbs(records))}
    </div>
    <div class="card">
      <h3>機種別収支</h3>
      <table class="list">
        <tr><th>機種</th><th>実戦</th><th>差枚</th></tr>
        ${byMachine.map(x => `<tr><td>${esc(x.m)}</td><td>${x.n}</td><td class="${cls(x.diff)}">${signed(x.diff)}</td></tr>`).join('')}
      </table>
    </div>`;
}

/* ============ グラフ ============ */
let graphMode = 'day';
$$('#graph-mode button').forEach(b => b.addEventListener('click', () => {
  graphMode = b.dataset.mode;
  $$('#graph-mode button').forEach(x => x.classList.toggle('on', x === b));
  renderGraph();
}));
$('#graph-machine').addEventListener('change', renderGraph);
window.addEventListener('resize', () => { if (currentTab === 'graph') renderGraph(); });

function renderGraph() {
  fillSelect($('#graph-machine'), machines().map(m => ({ v: m, t: m })), '全機種');
  const fm = $('#graph-machine').value;
  const recs = records.filter(r => !fm || r.machine === fm);
  const keyLen = graphMode === 'month' ? 7 : 10;
  const map = new Map();
  for (const r of recs) {
    const k = r.date.slice(0, keyLen);
    map.set(k, (map.get(k) || 0) + diffOf(r));
  }
  const keys = [...map.keys()].sort();
  let acc = 0;
  const data = keys.map(k => { acc += map.get(k); return { k, v: map.get(k), cum: acc }; });

  const shown = graphMode === 'day' ? data.slice(-60) : data; // 日別は直近60日
  drawChart($('#chart'), shown, graphMode);

  const tbl = [...data].reverse();
  $('#graph-table').innerHTML = data.length ? `
    <h2 class="sec">${graphMode === 'month' ? '月別' : '日別'}一覧</h2>
    <table class="list">
      <tr><th>${graphMode === 'month' ? '月' : '日付'}</th><th>差枚</th><th>累計</th></tr>
      ${tbl.map(d => `<tr><td>${d.k}</td><td class="${cls(d.v)}">${signed(d.v)}</td><td class="${cls(d.cum)}">${signed(d.cum)}</td></tr>`).join('')}
    </table>` : '';
}

function drawChart(canvas, data, mode) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const css = getComputedStyle(document.documentElement);
  const col = n => css.getPropertyValue(n).trim();
  ctx.font = '11px sans-serif';

  if (!data.length) {
    ctx.fillStyle = col('--sub'); ctx.textAlign = 'center';
    ctx.fillText('データがありません', W / 2, H / 2);
    return;
  }
  const vals = data.map(d => (mode === 'cum' ? d.cum : d.v));
  let max = Math.max(0, ...vals), min = Math.min(0, ...vals);
  if (max === min) { max += 100; min -= 100; }
  const step = niceStep((max - min) / 4);
  max = Math.ceil(max / step) * step; min = Math.floor(min / step) * step;

  const padL = 48, padR = 10, padT = 10, padB = 24;
  const cw = W - padL - padR, ch = H - padT - padB;
  const y = v => padT + ((max - v) / (max - min)) * ch;

  // グリッド
  ctx.strokeStyle = col('--line'); ctx.fillStyle = col('--sub'); ctx.lineWidth = 1;
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let v = min; v <= max + 1e-9; v += step) {
    ctx.beginPath(); ctx.moveTo(padL, y(v)); ctx.lineTo(W - padR, y(v)); ctx.stroke();
    ctx.fillText(shortNum(v), padL - 6, y(v));
  }
  ctx.strokeStyle = col('--sub');
  ctx.beginPath(); ctx.moveTo(padL, y(0)); ctx.lineTo(W - padR, y(0)); ctx.stroke();

  const n = data.length;
  const slot = cw / n;
  const xc = i => padL + slot * (i + 0.5);

  if (mode === 'cum') {
    ctx.strokeStyle = col('--accent'); ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath();
    vals.forEach((v, i) => (i ? ctx.lineTo(xc(i), y(v)) : ctx.moveTo(xc(i), y(v))));
    if (n === 1) { ctx.moveTo(padL, y(0)); ctx.lineTo(xc(0), y(vals[0])); }
    ctx.stroke();
    ctx.fillStyle = col('--accent');
    if (n <= 40) vals.forEach((v, i) => { ctx.beginPath(); ctx.arc(xc(i), y(v), 2.5, 0, Math.PI * 2); ctx.fill(); });
  } else {
    const bw = Math.max(2, Math.min(28, slot * 0.7));
    vals.forEach((v, i) => {
      ctx.fillStyle = v >= 0 ? col('--plus') : col('--minus');
      const top = Math.min(y(v), y(0)), h = Math.max(1, Math.abs(y(v) - y(0)));
      ctx.fillRect(xc(i) - bw / 2, top, bw, h);
    });
  }

  // X軸ラベル
  ctx.fillStyle = col('--sub'); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const maxLabels = Math.max(1, Math.floor(cw / 46));
  const every = Math.ceil(n / maxLabels);
  data.forEach((d, i) => {
    if (i % every !== 0 && i !== n - 1) return;
    if (i !== n - 1 && n - 1 - i < every && i !== 0) return;
    const label = mode === 'month' ? d.k.slice(2).replace('-', '/') : d.k.slice(5).replace('-', '/');
    ctx.fillText(label, xc(i), H - padB + 6);
  });
}
function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}
function shortNum(v) {
  const a = Math.abs(v);
  if (a >= 10000) return (v / 1000).toFixed(0) + 'k';
  if (a >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(Math.round(v));
}

/* ============ データ管理 ============ */
function renderData() {
  const size = new Blob([localStorage.getItem(STORAGE_KEY) || '']).size;
  const dates = records.map(r => r.date).sort();
  $('#data-info').innerHTML = `記録件数: ${records.length}件<br>` +
    (dates.length ? `期間: ${dates[0]} 〜 ${dates[dates.length - 1]}<br>` : '') +
    `使用容量: 約${(size / 1024).toFixed(1)}KB`;
}
function download(name, text, type) {
  const blob = new Blob([text], { type });
  const file = new File([blob], name, { type });
  // iOSではShare Sheet経由の方が「ファイルに保存」しやすい
  if (navigator.canShare && navigator.canShare({ files: [file] }) && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
    navigator.share({ files: [file], title: name }).catch(() => {});
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const stamp = () => today().replace(/-/g, '');
$('#btn-export').addEventListener('click', () => {
  const payload = { app: 'slot-tracker', version: 1, exportedAt: new Date().toISOString(), records };
  download(`slot-backup-${stamp()}.json`, JSON.stringify(payload, null, 2), 'application/json');
});
$('#btn-export-csv').addEventListener('click', () => {
  const cols = ['date', 'hall', 'machine', 'tableNo', 'invest', 'payout', 'diff', ...OPT_FIELDS, 'memo'];
  const head = ['日付', 'ホール', '機種', '台番号', '投資', '回収', '差枚', '総回転数', '単独BB', '複合BB', '単独RB', '複合RB', 'ブドウ', '非重複チェリー', 'レアチェリー', '一枚役', 'メモ'];
  const q = v => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const rows = sortedRecords().reverse().map(r => cols.map(c => q(c === 'diff' ? diffOf(r) : r[c])).join(','));
  download(`slot-records-${stamp()}.csv`, '﻿' + [head.join(','), ...rows].join('\r\n'), 'text/csv');
});
$('#btn-import').addEventListener('click', () => $('#file-import').click());
$('#file-import').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const json = JSON.parse(await file.text());
    const arr = Array.isArray(json) ? json : json.records;
    if (!Array.isArray(arr)) throw new Error('形式が正しくありません');
    const incoming = arr.map(normalize).filter(Boolean);
    const mode = $('input[name="impmode"]:checked').value;
    if (mode === 'replace') {
      if (!confirm(`現在の${records.length}件を削除し、${incoming.length}件で置き換えます。よろしいですか?`)) return;
      records = incoming;
    } else {
      const map = new Map(records.map(r => [r.id, r]));
      incoming.forEach(r => map.set(r.id, r));
      records = [...map.values()];
    }
    save();
    toast(`${incoming.length}件をインポートしました`);
    render();
  } catch (err) {
    alert('インポートに失敗しました: ' + err.message);
  }
});
$('#btn-clear').addEventListener('click', () => {
  if (!records.length) return;
  if (!confirm('全データを削除します。元に戻せません。先にエクスポートしましたか?')) return;
  if (!confirm(`本当に${records.length}件すべてを削除しますか?`)) return;
  records = [];
  save();
  resetForm(false);
  toast('全データを削除しました');
  render();
});

/* ============ 起動 ============ */
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(console.error));
}
resetForm(false);
render();
