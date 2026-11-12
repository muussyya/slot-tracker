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

// 家計簿(実戦記録とは別のキーに保存。実戦記録の形式には一切手を加えない)
const KB_KEY = 'slotTracker.kakeibo.v1';
const DEFAULT_RATE = 52; // 1000円 = 52枚
const TYPE_LABEL = { expense: '支出', income: '収入' };
const DEFAULT_CATS = {
  expense: [['ex-food', '食費'], ['ex-transport', '交通費'], ['ex-fun', '娯楽費'], ['ex-daily', '日用品'], ['ex-card', 'クレジットカード支払い'], ['ex-other', 'その他']],
  income: [['in-job', 'バイト代'], ['in-family', '仕送り'], ['in-other', 'その他']],
};

/* ============ ストレージ ============ */
let records = load();
let kb = loadKakeibo();

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

/* ---- 家計簿ストレージ ---- */
// 形式: { settings: { rate }, categories: { expense: [{id,name}], income: [...] },
//        entries: [{ id, type: 'expense'|'income', date, amount, catId, memo, updatedAt }] }
function defaultKakeibo() {
  return {
    settings: { rate: DEFAULT_RATE },
    categories: {
      expense: DEFAULT_CATS.expense.map(([id, name]) => ({ id, name })),
      income: DEFAULT_CATS.income.map(([id, name]) => ({ id, name })),
    },
    entries: [],
  };
}
function normCats(arr) {
  if (!Array.isArray(arr)) return null;
  const seen = new Set();
  const out = [];
  for (const c of arr) {
    if (!c || typeof c !== 'object') continue;
    const id = String(c.id || '').trim(), name = String(c.name || '').trim();
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name });
  }
  return out.length ? out : null;
}
function normEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const type = e.type === 'income' || e.type === 'expense' ? e.type : null;
  const date = String(e.date || '').slice(0, 10);
  const amount = Math.round(Number(e.amount));
  if (!type || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(amount) || amount < 0) return null;
  return {
    id: String(e.id || uid()), type, date, amount,
    catId: String(e.catId || ''), memo: String(e.memo || ''),
    updatedAt: Number(e.updatedAt) || Date.now(),
  };
}
function normalizeKakeibo(raw) {
  const d = defaultKakeibo();
  if (!raw || typeof raw !== 'object') return d;
  const rate = Number(raw.settings && raw.settings.rate);
  const cats = raw.categories || {};
  return {
    settings: { rate: Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_RATE },
    categories: {
      expense: normCats(cats.expense) || d.categories.expense,
      income: normCats(cats.income) || d.categories.income,
    },
    entries: Array.isArray(raw.entries) ? raw.entries.map(normEntry).filter(Boolean) : [],
  };
}
function loadKakeibo() {
  const raw = localStorage.getItem(KB_KEY);
  try {
    return normalizeKakeibo(raw ? JSON.parse(raw) : null);
  } catch (e) {
    // 壊れたデータは上書きで消さないよう退避しておく
    console.error(e);
    try { localStorage.setItem(KB_KEY + '.broken.' + Date.now(), raw); } catch (_) { /* noop */ }
    return defaultKakeibo();
  }
}
function saveKakeibo() {
  try {
    localStorage.setItem(KB_KEY, JSON.stringify(kb));
  } catch (e) {
    alert('保存に失敗しました: ' + e.message);
  }
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
// 差枚 → 円(保存はせず表示時に計算)
const yenOf = diff => Math.round((diff * 1000) / kb.settings.rate);
const yen = n => signed(n) + '円';
const yenSmall = diff => { const y = yenOf(diff); return `<small class="yen ${cls(y)}">${yen(y)}</small>`; };
const monthLabel = m => `${+m.slice(0, 4)}年${+m.slice(5, 7)}月`;
function shiftMonth(m, d) {
  const dt = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1 + d, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}
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
      <div><span>差枚</span><b class="${cls(m.diff)}">${signed(m.diff)}枚</b></div>
      <div><span>円換算</span><b class="${cls(m.diff)}">${yen(yenOf(m.diff))}</b></div>
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
const TAB_TITLES = { record: '実戦記録', machine: '機種別サマリー', total: '全体サマリー', graph: '収支グラフ', kakeibo: '家計簿', data: 'データ管理' };
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
  if (currentTab === 'kakeibo') renderKakeibo();
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
  el.textContent = `${signed(d)}枚(${yen(yenOf(d))})`;
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
  toast(editing ? '更新しました' : `記録しました(${signed(diffOf(rec))}枚 / ${yen(yenOf(diffOf(rec)))})`);
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
  el.innerHTML = `<p class="hint">${list.length}件 / 差枚合計 <b class="${cls(tot)}">${signed(tot)}枚</b>(<b class="${cls(tot)}">${yen(yenOf(tot))}</b>)</p>` +
    list.slice(0, listLimit).map(r => {
      const d = diffOf(r);
      return `<div class="rec">
        <div class="main">
          <div class="t1">${esc(r.machine)} <small>${esc(r.tableNo)}番</small></div>
          <div class="t2">${r.date} ・ ${esc(r.hall)}${r.games != null ? ' ・ ' + fmt(r.games) + 'G' : ''}${r.memo ? ' ・ ' + esc(r.memo) : ''}</div>
        </div>
        <div class="d ${cls(d)}">${signed(d)}${yenSmall(d)}</div>
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
          <b class="${cls(money.diff)}">${signed(money.diff)}枚 <small>(${yen(yenOf(money.diff))})</small></b>
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
      <div class="sum-head"><span class="hint" style="margin:0">円換算(1000円=${kb.settings.rate}枚)</span><b class="${cls(money.diff)}">${yen(yenOf(money.diff))}</b></div>
      <div class="sum-head"><span class="hint" style="margin:0">今月(${thisMonth.replace('-', '/')})</span><b class="${cls(mDiff)}">${signed(mDiff)}枚 / ${yen(yenOf(mDiff))}</b></div>
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
        <tr><th>機種</th><th>実戦</th><th>差枚</th><th>円換算</th></tr>
        ${byMachine.map(x => `<tr><td>${esc(x.m)}</td><td>${x.n}</td><td class="${cls(x.diff)}">${signed(x.diff)}</td><td class="${cls(x.diff)}">${yen(yenOf(x.diff))}</td></tr>`).join('')}
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
      ${tbl.map(d => `<tr><td>${d.k}</td><td class="${cls(d.v)}">${signed(d.v)}${yenSmall(d.v)}</td><td class="${cls(d.cum)}">${signed(d.cum)}${yenSmall(d.cum)}</td></tr>`).join('')}
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

/* ============ 家計簿 ============ */
let kbView = 'input';
let kbMonth = today().slice(0, 7);
let kbType = 'expense';
let kbCat = null;
let kbTrend = 'day';
let kbListLimit = 50;
const kbForm = $('#kb-form');
const catsOf = t => kb.categories[t];
function catName(type, id) {
  const c = catsOf(type).find(x => x.id === id);
  return c ? c.name : '未分類';
}

// 期間(''=全期間 / 'YYYY-MM' / 'YYYY-MM-DD')の集計
// 手元に残る額 = スロット換金額(円) + スロット以外の収入 − 支出
function finishStats(s) {
  s.slot = yenOf(s.diff);
  s.daily = s.income - s.expense;
  s.hand = s.slot + s.daily;
  return s;
}
function periodStats(prefix) {
  const recs = records.filter(r => r.date.startsWith(prefix));
  const ents = kb.entries.filter(e => e.date.startsWith(prefix));
  return finishStats({
    recs, ents,
    diff: sum(recs, diffOf),
    income: sum(ents.filter(e => e.type === 'income'), 'amount'),
    expense: sum(ents.filter(e => e.type === 'expense'), 'amount'),
  });
}
// 日別(keyLen=10)/月別(keyLen=7)にまとめる(新しい順)
function bucketStats(keyLen, prefix = '') {
  const m = new Map();
  const get = k => {
    if (!m.has(k)) m.set(k, { k, diff: 0, income: 0, expense: 0, n: 0 });
    return m.get(k);
  };
  for (const r of records) if (r.date.startsWith(prefix)) { const b = get(r.date.slice(0, keyLen)); b.diff += diffOf(r); b.n++; }
  for (const e of kb.entries) if (e.date.startsWith(prefix)) get(e.date.slice(0, keyLen))[e.type] += e.amount;
  return [...m.values()].map(finishStats).sort((a, b) => b.k.localeCompare(a.k));
}

$('#kb-view').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  kbView = b.dataset.view;
  renderKakeibo();
  window.scrollTo(0, 0);
});

function renderKakeibo() {
  $$('#kb-view button').forEach(b => b.classList.toggle('on', b.dataset.view === kbView));
  $('#kb-input').hidden = kbView !== 'input';
  $('#kb-month').hidden = kbView !== 'month';
  $('#kb-trend').hidden = kbView !== 'trend';
  if (kbView === 'input') { renderKbCats(); renderKbList(); }
  if (kbView === 'month') renderKbMonth();
  if (kbView === 'trend') renderKbTrend();
}

function monthNavHTML() {
  const cur = today().slice(0, 7);
  return `<div class="monthnav">
    <button type="button" class="iconbtn" data-mnav="-1" aria-label="前の月">‹</button>
    <span class="mid"><b>${monthLabel(kbMonth)}</b>${kbMonth !== cur ? '<button type="button" class="btn small" data-mnav="0">今月</button>' : ''}</span>
    <button type="button" class="iconbtn" data-mnav="1" aria-label="次の月">›</button>
  </div>`;
}
$('#tab-kakeibo').addEventListener('click', e => {
  const b = e.target.closest('[data-mnav]');
  if (!b) return;
  const d = +b.dataset.mnav;
  kbMonth = d ? shiftMonth(kbMonth, d) : today().slice(0, 7);
  kbListLimit = 50;
  renderKakeibo();
});

/* ---- 入力 ---- */
function renderKbCats() {
  $$('#kb-type button').forEach(b => b.classList.toggle('on', b.dataset.type === kbType));
  const cats = catsOf(kbType);
  if (!kbForm.id.value && !cats.some(c => c.id === kbCat)) kbCat = cats[0] ? cats[0].id : null;
  $('#kb-cats').innerHTML = cats.map(c =>
    `<button type="button" class="chip${c.id === kbCat ? ' on' : ''}" data-cat="${esc(c.id)}">${esc(c.name)}</button>`).join('');
}
$('#kb-type').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || b.dataset.type === kbType) return;
  kbType = b.dataset.type;
  kbCat = null;
  if (!kbForm.id.value) kbCat = catsOf(kbType)[0]?.id || null;
  renderKbCats();
});
$('#kb-cats').addEventListener('click', e => {
  const b = e.target.closest('button[data-cat]');
  if (!b) return;
  kbCat = b.dataset.cat;
  renderKbCats();
});
$('#kb-cat-edit').addEventListener('click', () => {
  catEditType = kbType;
  showTab('data');
  $('#cat-card').scrollIntoView({ behavior: 'smooth' });
});

function resetKbForm(keep) {
  const prevDate = keep ? kbForm.date.value : null;
  kbForm.reset();
  kbForm.id.value = '';
  kbForm.date.value = prevDate || today();
  if (!keep) kbCat = null;
  $('#kb-save').textContent = '記録する';
  $('#kb-cancel').hidden = true;
  renderKbCats();
}
kbForm.addEventListener('submit', e => {
  e.preventDefault();
  const amount = Number(String(kbForm.amount.value).replace(/[,，\s]/g, ''));
  if (!Number.isInteger(amount) || amount <= 0) { alert('金額を正しく入力してください(1円以上の整数)'); return; }
  if (!kbCat || !catsOf(kbType).some(c => c.id === kbCat)) { alert('カテゴリを選択してください'); return; }
  const id = kbForm.id.value;
  const ent = normEntry({ id: id || uid(), type: kbType, date: kbForm.date.value, amount, catId: kbCat, memo: kbForm.memo.value.trim(), updatedAt: Date.now() });
  if (!ent) { alert('日付を正しく入力してください'); return; }
  if (id) {
    const i = kb.entries.findIndex(x => x.id === id);
    if (i >= 0) kb.entries[i] = ent; else kb.entries.push(ent);
  } else {
    kb.entries.push(ent);
  }
  saveKakeibo();
  toast(id ? '更新しました' : `${TYPE_LABEL[ent.type]}を記録しました(${catName(ent.type, ent.catId)} ${fmt(ent.amount)}円)`);
  kbMonth = ent.date.slice(0, 7);
  resetKbForm(true);
  render();
});
$('#kb-cancel').addEventListener('click', () => resetKbForm(false));

function editEntry(id) {
  const ent = kb.entries.find(x => x.id === id);
  if (!ent) return;
  kbForm.id.value = ent.id;
  kbForm.date.value = ent.date;
  kbForm.amount.value = ent.amount;
  kbForm.memo.value = ent.memo;
  kbType = ent.type;
  kbCat = ent.catId;
  $('#kb-save').textContent = '更新する';
  $('#kb-cancel').hidden = false;
  renderKbCats();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function deleteEntry(id) {
  const ent = kb.entries.find(x => x.id === id);
  if (!ent || !confirm(`${ent.date} ${catName(ent.type, ent.catId)} ${fmt(ent.amount)}円(${TYPE_LABEL[ent.type]})を削除しますか?`)) return;
  kb.entries = kb.entries.filter(x => x.id !== id);
  saveKakeibo();
  if (kbForm.id.value === id) resetKbForm(false);
  toast('削除しました');
  render();
}

function renderKbList() {
  const ents = kb.entries.filter(e => e.date.startsWith(kbMonth))
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt);
  const inc = sum(ents.filter(e => e.type === 'income'), 'amount');
  const exp = sum(ents.filter(e => e.type === 'expense'), 'amount');
  let html = `<h2 class="sec">収入・支出の記録</h2>` + monthNavHTML();
  if (!ents.length) {
    html += '<div class="empty">この月の記録はありません</div>';
  } else {
    html += `<p class="hint">${ents.length}件 / 収入 <b class="plus">${fmt(inc)}円</b> ・ 支出 <b class="minus">${fmt(exp)}円</b></p>` +
      ents.slice(0, kbListLimit).map(e => {
        const isInc = e.type === 'income';
        return `<div class="rec">
          <div class="main">
            <div class="t1"><span class="badge ${isInc ? 'in' : 'ex'}">${TYPE_LABEL[e.type]}</span>${esc(catName(e.type, e.catId))}</div>
            <div class="t2">${e.date}${e.memo ? ' ・ ' + esc(e.memo) : ''}</div>
          </div>
          <div class="d ${isInc ? 'plus' : 'minus'}">${isInc ? '+' : '−'}${fmt(e.amount)}</div>
          <div class="acts">
            <button class="iconbtn" data-kedit="${esc(e.id)}" aria-label="編集">✎</button>
            <button class="iconbtn" data-kdel="${esc(e.id)}" aria-label="削除">🗑</button>
          </div>
        </div>`;
      }).join('') +
      (ents.length > kbListLimit ? `<button class="btn block" data-kmore="1">もっと見る(残り${ents.length - kbListLimit}件)</button>` : '');
  }
  $('#kb-list').innerHTML = html;
}
$('#kb-list').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.kedit) editEntry(b.dataset.kedit);
  else if (b.dataset.kdel) deleteEntry(b.dataset.kdel);
  else if (b.dataset.kmore) { kbListLimit += 50; renderKbList(); }
});

/* ---- 月別・累計 ---- */
function summaryHTML(s, title) {
  return `<div class="card">
    <h3>${title}</h3>
    <div class="sumrows">
      <div class="row"><span>スロットの換金額<small>差枚 ${signed(s.diff)}枚 ・ 1000円=${kb.settings.rate}枚</small></span><b class="${cls(s.slot)}">${yen(s.slot)}</b></div>
      <div class="row"><span>スロット以外の収入</span><b>${fmt(s.income)}円</b></div>
      <div class="row"><span>支出合計</span><b>${fmt(s.expense)}円</b></div>
      <div class="row total"><span>手元に残る額</span><b class="big ${cls(s.hand)}">${yen(s.hand)}</b></div>
    </div>
    <div class="split">
      <div><span>スロット由来</span><b class="${cls(s.slot)}">${yen(s.slot)}</b></div>
      <div><span>日常由来(収入−支出)</span><b class="${cls(s.daily)}">${yen(s.daily)}</b></div>
    </div>
  </div>`;
}
function breakdown(ents, type) {
  const map = new Map();
  ents.filter(e => e.type === type).forEach(e => map.set(e.catId, (map.get(e.catId) || 0) + e.amount));
  const rows = catsOf(type).map(c => ({ name: c.name, v: map.get(c.id) || 0 }));
  const known = new Set(catsOf(type).map(c => c.id));
  let unk = 0;
  for (const [k, v] of map) if (!known.has(k)) unk += v;
  if (unk) rows.push({ name: '未分類', v: unk });
  // 金額の大きい順(同額はカテゴリ順のまま)
  return rows.map((r, i) => ({ ...r, i })).sort((a, b) => b.v - a.v || a.i - b.i);
}
function breakdownHTML(rows, total, type) {
  return rows.map(r => {
    const pct = total > 0 ? (r.v / total) * 100 : 0;
    return `<div class="bk${r.v ? '' : ' zero'}">
      <div class="bk-top"><span>${esc(r.name)}</span><b>${fmt(r.v)}円<small>${total > 0 ? pct.toFixed(1) + '%' : ''}</small></b></div>
      <div class="bar${type === 'income' ? ' inc' : ''}"><i style="width:${pct.toFixed(1)}%"></i></div>
    </div>`;
  }).join('');
}
function renderKbMonth() {
  const s = periodStats(kbMonth);
  $('#kb-month').innerHTML = monthNavHTML() +
    summaryHTML(s, `${monthLabel(kbMonth)}の収支`) +
    `<div class="card"><div class="sum-head"><h3>支出の内訳</h3><b>${fmt(s.expense)}円</b></div>${breakdownHTML(breakdown(s.ents, 'expense'), s.expense, 'expense')}</div>` +
    `<div class="card"><div class="sum-head"><h3>収入の内訳</h3><b>${fmt(s.income)}円</b></div>${breakdownHTML(breakdown(s.ents, 'income'), s.income, 'income')}</div>`;
}

function trendTable(rows, keyHead, keyFmt, foot) {
  if (!rows.length) return '<div class="empty">記録がありません</div>';
  const cell = v => `<td class="${cls(v)}">${signed(v)}</td>`;
  return `<table class="list yen4">
    <tr><th>${keyHead}</th><th>スロット</th><th>日常</th><th>手元</th></tr>
    ${rows.map(r => `<tr><td>${keyFmt(r.k)}</td>${cell(r.slot)}${cell(r.daily)}${cell(r.hand)}</tr>`).join('')}
    ${foot ? `<tr class="foot"><td>合計</td>${cell(foot.slot)}${cell(foot.daily)}${cell(foot.hand)}</tr>` : ''}
  </table>
  <p class="hint">単位: 円 / 日常 = スロット以外の収入 − 支出 / 手元 = スロット + 日常</p>`;
}
function renderKbTrend() {
  let html = summaryHTML(periodStats(''), '累計(全期間)') +
    `<div class="seg" id="kb-trend-mode">
      <button data-trend="day" class="${kbTrend === 'day' ? 'on' : ''}">日別</button>
      <button data-trend="month" class="${kbTrend === 'month' ? 'on' : ''}">月別</button>
    </div>`;
  if (kbTrend === 'day') {
    html += monthNavHTML() + trendTable(bucketStats(10, kbMonth), '日付', k => `${+k.slice(5, 7)}/${+k.slice(8)}`, periodStats(kbMonth));
  } else {
    html += trendTable(bucketStats(7), '月', k => k.replace('-', '/'), null);
  }
  $('#kb-trend').innerHTML = html;
}
$('#kb-trend').addEventListener('click', e => {
  const b = e.target.closest('[data-trend]');
  if (!b) return;
  kbTrend = b.dataset.trend;
  renderKbTrend();
});

/* ---- 設定: 換算レート・カテゴリ ---- */
let catEditType = 'expense';
function renderSettings() {
  const rateEl = $('#rate');
  if (document.activeElement !== rateEl) rateEl.value = kb.settings.rate;
  $('#rate-preview').textContent = `例: +1,000枚 → ${yen(yenOf(1000))} / −500枚 → ${yen(yenOf(-500))}`;
  $$('#cat-type button').forEach(b => b.classList.toggle('on', b.dataset.type === catEditType));
  const cats = catsOf(catEditType);
  $('#cat-list').innerHTML = cats.map((c, i) => {
    const n = kb.entries.filter(e => e.type === catEditType && e.catId === c.id).length;
    return `<div class="catrow">
      <span class="nm">${esc(c.name)}</span><span class="cnt">${n}件</span>
      <button class="iconbtn" data-cup="${esc(c.id)}" aria-label="上へ" ${i === 0 ? 'disabled style="opacity:.3"' : ''}>▲</button>
      <button class="iconbtn" data-cren="${esc(c.id)}" aria-label="名前変更">✎</button>
      <button class="iconbtn" data-cdel="${esc(c.id)}" aria-label="削除">🗑</button>
    </div>`;
  }).join('');
}
$('#rate').addEventListener('change', e => {
  const v = Number(e.target.value);
  if (!Number.isFinite(v) || v <= 0) { alert('1以上の数値を入力してください'); e.target.value = kb.settings.rate; return; }
  kb.settings.rate = v;
  saveKakeibo();
  toast(`換算レートを 1000円=${v}枚 にしました`);
  renderSettings();
});
$('#cat-type').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  catEditType = b.dataset.type;
  renderSettings();
});
$('#btn-cat-add').addEventListener('click', () => {
  const name = (prompt(`追加する${TYPE_LABEL[catEditType]}カテゴリ名`) || '').trim();
  if (!name) return;
  if (catsOf(catEditType).some(c => c.name === name)) { alert('同じ名前のカテゴリがあります'); return; }
  catsOf(catEditType).push({ id: 'c-' + uid(), name });
  saveKakeibo();
  toast(`「${name}」を追加しました`);
  renderSettings();
});
$('#cat-list').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  const cats = catsOf(catEditType);
  const id = b.dataset.cup || b.dataset.cren || b.dataset.cdel;
  const i = cats.findIndex(c => c.id === id);
  if (i < 0) return;
  const c = cats[i];
  if (b.dataset.cup) {
    if (i > 0) [cats[i - 1], cats[i]] = [cats[i], cats[i - 1]];
  } else if (b.dataset.cren) {
    const name = (prompt('新しいカテゴリ名', c.name) || '').trim();
    if (!name || name === c.name) return;
    if (cats.some(x => x.name === name)) { alert('同じ名前のカテゴリがあります'); return; }
    c.name = name; // 記録はIDで紐づくので名前変更は過去の記録にも反映される
  } else if (b.dataset.cdel) {
    if (cats.length <= 1) { alert('カテゴリは最低1つ必要です'); return; }
    const used = kb.entries.filter(x => x.type === catEditType && x.catId === c.id);
    const rest = cats.filter(x => x.id !== c.id);
    const fb = rest.find(x => x.name === 'その他') || rest[rest.length - 1];
    const msg = used.length
      ? `「${c.name}」を削除します。\nこのカテゴリの記録${used.length}件は「${fb.name}」に移動します。よろしいですか?`
      : `「${c.name}」を削除しますか?`;
    if (!confirm(msg)) return;
    used.forEach(x => { x.catId = fb.id; });
    cats.splice(i, 1);
  }
  saveKakeibo();
  renderSettings();
});

/* ============ データ管理 ============ */
function renderData() {
  renderSettings();
  const size = new Blob([(localStorage.getItem(STORAGE_KEY) || '') + (localStorage.getItem(KB_KEY) || '')]).size;
  const dates = records.map(r => r.date).sort();
  const nInc = kb.entries.filter(e => e.type === 'income').length;
  $('#data-info').innerHTML = `実戦記録: ${records.length}件<br>` +
    (dates.length ? `期間: ${dates[0]} 〜 ${dates[dates.length - 1]}<br>` : '') +
    `家計簿: 支出${kb.entries.length - nInc}件 / 収入${nInc}件<br>` +
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
  // version 2: records(従来と同じ形式)に加えて kakeibo を含める。旧版アプリでも records は読める
  const payload = { app: 'slot-tracker', version: 2, exportedAt: new Date().toISOString(), records, kakeibo: kb };
  download(`slot-backup-${stamp()}.json`, JSON.stringify(payload, null, 2), 'application/json');
});
$('#btn-export-csv').addEventListener('click', () => {
  const cols = ['date', 'hall', 'machine', 'tableNo', 'invest', 'payout', 'diff', ...OPT_FIELDS, 'memo'];
  const head = ['日付', 'ホール', '機種', '台番号', '投資', '回収', '差枚', '総回転数', '単独BB', '複合BB', '単独RB', '複合RB', 'ブドウ', '非重複チェリー', 'レアチェリー', '一枚役', 'メモ'];
  const q = v => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const rows = sortedRecords().reverse().map(r => cols.map(c => q(c === 'diff' ? diffOf(r) : r[c])).join(','));
  download(`slot-records-${stamp()}.csv`, '﻿' + [head.join(','), ...rows].join('\r\n'), 'text/csv');
});
$('#btn-export-kb-csv').addEventListener('click', () => {
  const q = v => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const rows = [...kb.entries].sort((a, b) => a.date.localeCompare(b.date) || a.updatedAt - b.updatedAt)
    .map(e => [e.date, TYPE_LABEL[e.type], catName(e.type, e.catId), e.amount, e.memo].map(q).join(','));
  download(`kakeibo-${stamp()}.csv`, '﻿' + [['日付', '種別', 'カテゴリ', '金額', 'メモ'].join(','), ...rows].join('\r\n'), 'text/csv');
});
function mergeKakeibo(cur, inc) {
  const cats = {};
  for (const t of ['expense', 'income']) {
    const m = new Map(cur.categories[t].map(c => [c.id, c]));
    inc.categories[t].forEach(c => m.set(c.id, c));
    cats[t] = [...m.values()];
  }
  const em = new Map(cur.entries.map(e => [e.id, e]));
  inc.entries.forEach(e => em.set(e.id, e));
  return { settings: cur.settings, categories: cats, entries: [...em.values()] };
}
$('#btn-import').addEventListener('click', () => $('#file-import').click());
$('#file-import').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const json = JSON.parse(await file.text());
    // 旧形式(配列 or {records})と新形式({records, kakeibo})の両方に対応
    const arr = Array.isArray(json) ? json : json && json.records;
    const kbIn = !Array.isArray(json) && json && json.kakeibo && typeof json.kakeibo === 'object' ? normalizeKakeibo(json.kakeibo) : null;
    if (!Array.isArray(arr) && !kbIn) throw new Error('形式が正しくありません');
    const incoming = Array.isArray(arr) ? arr.map(normalize).filter(Boolean) : null;
    const mode = $('input[name="impmode"]:checked').value;
    if (mode === 'replace') {
      const parts = [];
      if (incoming) parts.push(`実戦記録: 現在の${records.length}件 → ${incoming.length}件`);
      if (kbIn) parts.push(`家計簿: 現在の${kb.entries.length}件 → ${kbIn.entries.length}件(カテゴリ・換算レートも置き換え)`);
      if (!kbIn) parts.push('※このファイルに家計簿データは含まれないため、家計簿は今のまま残ります');
      if (!confirm(`次の内容で置き換えます。よろしいですか?\n\n${parts.join('\n')}`)) return;
      if (incoming) records = incoming;
      if (kbIn) kb = kbIn;
    } else {
      if (incoming) {
        const map = new Map(records.map(r => [r.id, r]));
        incoming.forEach(r => map.set(r.id, r));
        records = [...map.values()];
      }
      if (kbIn) kb = mergeKakeibo(kb, kbIn);
    }
    if (incoming) save();
    if (kbIn) saveKakeibo();
    toast(`実戦記録${incoming ? incoming.length : 0}件` + (kbIn ? ` / 家計簿${kbIn.entries.length}件` : '') + 'をインポートしました');
    resetKbForm(false);
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
  toast('実戦記録を全て削除しました');
  render();
});
$('#btn-clear-kb').addEventListener('click', () => {
  if (!kb.entries.length) return;
  if (!confirm('家計簿の収入・支出の記録を全て削除します(カテゴリと換算レートは残ります)。元に戻せません。先にエクスポートしましたか?')) return;
  if (!confirm(`本当に${kb.entries.length}件すべてを削除しますか?`)) return;
  kb.entries = [];
  saveKakeibo();
  resetKbForm(false);
  toast('家計簿の記録を全て削除しました');
  render();
});

/* ============ 起動 ============ */
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(console.error));
}
resetForm(false);
resetKbForm(false);
render();
