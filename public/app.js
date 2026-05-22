// ============================================================
// 赛博上帝 / 忏悔楼 — 前端主逻辑
// 单文件, 无构建, 浏览器直接跑
// 状态机 + DOM 渲染 + 调 Cloudflare Pages Functions API
// ============================================================

const C = window.CONFIG;

// 注册 service worker — 离线壳缓存 + 资源预拉
// 失败静默 (老浏览器没 SW 也能跑)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// 生成 / 取本浏览器的 client_id (UUID), 持久存在 localStorage
// 同名情况下用这个鉴权: 删除时校验 client_id, 防止你删了别人的同名记录
function getOrCreateClientId() {
  let id = localStorage.getItem(C.STORAGE.CLIENT_ID);
  if (id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return id;
  // 优先用 crypto.randomUUID (现代浏览器), fallback Math.random
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    id = crypto.randomUUID();
  } else {
    id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
  localStorage.setItem(C.STORAGE.CLIENT_ID, id);
  return id;
}

// ----- 全局状态 -----
const state = {
  me: null,               // 当前忏悔者名字
  clientId: getOrCreateClientId(),  // 本浏览器的 UUID, 用于删除鉴权
  records: [],            // 我的所有记录(忏悔+破戒, 时间倒序, 每条有 type='confess'|'break')
  calMonth: new Date(),   // 日历当前显示月(本月的 1 号)
  calFilter: null,        // null=显示所有; 字符串=只高亮某 normalized
  breakPick: null,        // 破戒卡片当前选中要破戒的句子 { content, normalized, color }
  confirmCallback: null,  // 当前确认弹层的"确定"回调
};

// ----- DOM 短手 -----
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);


// ============================================================
// 工具函数
// ============================================================

// 归一化句子: 去所有空白 + 去末尾标点(中英文)
// 用于"同句子"判定 (例: "买衣服" / "买衣服 " / "买衣服。" 都算同一句)
function normalize(s) {
  if (!s) return '';
  const noSpace = s.trim().replace(/\s+/g, '');
  return noSpace.replace(/[\.,!?;:。，！？；：、…~\s]+$/g, '');
}

// 给一句新内容分配颜色 — 在未用色里挑色相距离已用色最远的, 视觉差异最大化
function pickColor(usedColors) {
  const used = new Set(usedColors);
  const remaining = C.COLORS.filter(c => !used.has(c));
  if (remaining.length === 0) return C.COLORS[Math.floor(Math.random() * C.COLORS.length)];
  if (used.size === 0) return remaining[Math.floor(Math.random() * remaining.length)];

  const usedHues = [...used].map(hexToHue);
  let best = remaining[0];
  let maxMinDist = -1;
  for (const c of remaining) {
    const h = hexToHue(c);
    let minDist = Infinity;
    for (const uh of usedHues) {
      const d = hueDist(h, uh);
      if (d < minDist) minDist = d;
    }
    if (minDist > maxMinDist) {
      maxMinDist = minDist;
      best = c;
    }
  }
  return best;
}

// hex 转 hue (0-360 度)
function hexToHue(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  let h;
  if (max === r) h = ((g - b) / (max - min) + 6) % 6;
  else if (max === g) h = (b - r) / (max - min) + 2;
  else h = (r - g) / (max - min) + 4;
  return h * 60;
}

// 色相环上两个 hue 的最短距离 (0-180)
function hueDist(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// 同一句子复用最早那条记录的颜色
function colorOfNormalized(normalized) {
  for (let i = state.records.length - 1; i >= 0; i--) {
    if (state.records[i].normalized === normalized) {
      return state.records[i].color;
    }
  }
  return null;
}

// 时间格式: "2025-05-21 19:32"
function fmtTime(unixSec) {
  const d = new Date(unixSec * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 按天分组用的 key: "2025-05-21"
function dateKey(unixSec) {
  const d = new Date(unixSec * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// DOM helper: 创建一个带 class 的 span 节点(内容用 textContent, 防 XSS)
function span(cls, text) {
  const el = document.createElement('span');
  el.className = cls;
  el.textContent = String(text);
  return el;
}

// DOM helper: 清空容器, 按顺序放入字符串或节点(字符串自动包成 text node)
function setNodes(el, parts) {
  el.textContent = '';
  for (const p of parts) {
    if (typeof p === 'string') el.appendChild(document.createTextNode(p));
    else if (p instanceof Node) el.appendChild(p);
  }
}

// 统一处理 API 错误显示 toast
function showApiErr(r) {
  if (r.status === 429) {
    const msg = r.data?.error;
    if (msg === 'rate_minute') return toast(C.TEXT.TOAST_RATE_MINUTE);
    if (msg === 'rate_day')    return toast(C.TEXT.TOAST_RATE_DAY);
    if (msg === 'rate_total')  return toast(C.TEXT.TOAST_RATE_TOTAL);
  }
  toast(C.TEXT.TOAST_NETWORK);
}


// ============================================================
// 轻提示 Toast
// ============================================================

let toastTimer = null;
function toast(msg, duration = 2200) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('toast-show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('toast-show'), duration);
}


// ============================================================
// 页面 / 视图切换
// ============================================================

function showPage(id) {
  $$('.page').forEach(p => p.classList.remove('page-active'));
  $('#' + id).classList.add('page-active');
}

// 主 tab: 忏悔 / 忏悔录
function showMainView(viewName) {
  $$('.view').forEach(v => v.classList.remove('view-active'));
  $('#view-' + viewName).classList.add('view-active');
  $$('.tab').forEach(t => t.classList.toggle('tab-active', t.dataset.view === viewName));
}

// 子 tab(在忏悔录里): 时间树 / 日历本 / 忏悔列表
function showSubView(subName) {
  $$('.sub-view').forEach(v => v.classList.remove('sub-view-active'));
  $('#sub-' + subName).classList.add('sub-view-active');
  $$('.sub-tab').forEach(t => t.classList.toggle('sub-tab-active', t.dataset.sub === subName));
  // 每次切到日历本: 自动重置到当前月
  if (subName === 'calendar') {
    state.calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    renderCalendar();
  }
}


// ============================================================
// API 调用
// ============================================================

async function api(path, options = {}) {
  try {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    let data = {};
    try { data = await res.json(); } catch (_) {}
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: {}, err: e };
  }
}

const apiCheckPenitent  = (name) =>
  api(C.API.PENITENT + '?name=' + encodeURIComponent(name));

const apiConfess = (name, content, normalized, color) =>
  api(C.API.CONFESS, {
    method: 'POST',
    body: JSON.stringify({ name, content, normalized, color, client_id: state.clientId }),
  });

const apiBreak = (name, content, normalized, color, butText) =>
  api(C.API.BREAK, {
    method: 'POST',
    body: JSON.stringify({ name, content, normalized, color, but_text: butText, client_id: state.clientId }),
  });

const apiDelete = (name, type, id) =>
  api(C.API.DELETE, {
    method: 'POST',
    body: JSON.stringify({ name, type, id, client_id: state.clientId }),
  });

const apiPeekExcuse = (name, normalized) =>
  api(C.API.PEEK_EXCUSE +
    '?name=' + encodeURIComponent(name) +
    '&normalized=' + encodeURIComponent(normalized));

const apiStats = (name, normalized) =>
  api(C.API.STATS +
    '?name=' + encodeURIComponent(name) +
    '&normalized=' + encodeURIComponent(normalized));

const apiRecords = (name) =>
  api(C.API.RECORDS + '?name=' + encodeURIComponent(name));


// ============================================================
// 身份页
// ============================================================

function bindIdentityPage() {
  const input     = $('#name-input');
  const btnEnter  = $('#btn-enter');
  const btnCreate = $('#btn-create');
  const msg       = $('#identity-msg');

  const setMsg = (s) => { msg.textContent = s || ''; };

  const validateName = () => {
    const v = input.value.trim();
    if (!v)                      { setMsg(C.TEXT.TOAST_EMPTY_NAME);    return null; }
    if (v.length > C.MAX_NAME)   { setMsg(C.TEXT.TOAST_TOO_LONG_NAME); return null; }
    return v;
  };

  // 进入按钮: 存在 → 直接登录; 不存在 → 直接前端登录, 不预建 penitent
  // (空账号不入库, 第一次忏悔时后端自动建)
  btnEnter.addEventListener('click', async () => {
    setMsg('');
    const name = validateName();
    if (!name) return;
    btnEnter.disabled = true;

    const r = await apiCheckPenitent(name);
    btnEnter.disabled = false;

    if (r.ok) {
      await enterMain(name);
      return;
    }

    if (r.status === 404) {
      await enterMain(name);
      toast(C.TEXT.TOAST_CREATED);
      return;
    }

    setMsg(C.TEXT.TOAST_NETWORK);
  });

  // 查重按钮: 只显示结果, 不进入
  btnCreate.addEventListener('click', async () => {
    setMsg('');
    const name = validateName();
    if (!name) return;
    btnCreate.disabled = true;
    const r = await apiCheckPenitent(name);
    btnCreate.disabled = false;

    if (r.ok) {
      toast(C.TEXT.TOAST_NAME_TAKEN);
    } else if (r.status === 404) {
      toast(C.TEXT.TOAST_NAME_AVAILABLE);
    } else {
      toast(C.TEXT.TOAST_NETWORK);
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnEnter.click();
  });
}

async function enterMain(name) {
  state.me = name;
  localStorage.setItem(C.STORAGE.ME, name);
  $('#me-name').textContent = name;
  await loadAll();
  showPage('page-confess');
  showMainView('confess');
  showSubView('tree');
}

function logout() {
  state.me = null;
  state.records = [];
  state.calFilter = null;
  state.calMonth = new Date();
  localStorage.removeItem(C.STORAGE.ME);
  $('#name-input').value = '';
  $('#identity-msg').textContent = '';
  $('#confess-input').value = '';
  $('#stats-area').classList.add('hidden');
  showPage('page-identity');
}


// ============================================================
// 主页
// ============================================================

function bindMainPage() {
  $('#btn-logout').addEventListener('click', logout);

  // 配置驱动文案 — 集中改 config 不散落
  document.querySelectorAll('.break-pick-hint').forEach(el => {
    el.textContent = C.TEXT.BREAK_PICK_HINT;
  });
  $('#break-no-history').textContent = C.TEXT.BREAK_NO_HISTORY;
  $('#break-but').placeholder = C.TEXT.BREAK_PLACEHOLDER;
  $('#btn-break').textContent = C.TEXT.BREAK_BTN;
  $('#btn-peek').textContent  = C.TEXT.BREAK_PEEK_BTN;

  // 主 tab: 忏悔 / 忏悔录
  $$('.tab').forEach(t => {
    t.addEventListener('click', () => showMainView(t.dataset.view));
  });

  // 子 tab: 时间树 / 日历本 / 忏悔列表
  $$('.sub-tab').forEach(t => {
    t.addEventListener('click', () => showSubView(t.dataset.sub));
  });

  $('#btn-confess').addEventListener('click', submitConfess);
  $('#confess-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitConfess();
  });

  // 破戒提交
  $('#btn-break').addEventListener('click', submitBreak);

  // 偷看一个理由(别人写过的狡辩)
  $('#btn-peek').addEventListener('click', peekExcuse);

  // 关闭统计 box
  $('#stats-close').addEventListener('click', () => {
    $('#stats-area').classList.add('hidden');
  });
  $('#break-stats-close').addEventListener('click', () => {
    $('#break-stats-area').classList.add('hidden');
  });

  $('#cal-prev').addEventListener('click', () => {
    state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() - 1, 1);
    renderCalendar();
  });
  $('#cal-next').addEventListener('click', () => {
    state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + 1, 1);
    renderCalendar();
  });

  $('#cal-filter-clear').addEventListener('click', () => {
    state.calFilter = null;
    renderCalendar();
  });

  $('#day-detail-close').addEventListener('click', closeDayDetail);
  $('#day-detail-backdrop').addEventListener('click', closeDayDetail);

  // 通用确认弹层
  $('#confirm-ok').addEventListener('click', () => {
    const cb = state.confirmCallback;
    closeConfirm();
    if (cb) cb();
  });
  $('#confirm-cancel').addEventListener('click', closeConfirm);
  $('#confirm-backdrop').addEventListener('click', closeConfirm);

  // 确认弹层文案(从 config 填)
  $('#confirm-title').textContent = C.TEXT.CONFIRM_DEL_TITLE;
  $('#confirm-ok').textContent = C.TEXT.CONFIRM_DEL_OK;
  $('#confirm-cancel').textContent = C.TEXT.CONFIRM_DEL_CANCEL;

  // Esc 键关闭弹层 / 确认对话
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#confirm-dialog').classList.contains('hidden')) { closeConfirm(); return; }
    if (!$('#day-detail').classList.contains('hidden'))     { closeDayDetail(); return; }
  });
}

// 通用确认弹层
function openConfirm(text, onOk) {
  $('#confirm-text').textContent = text;
  state.confirmCallback = onOk;
  $('#confirm-dialog').classList.remove('hidden');
}
function closeConfirm() {
  $('#confirm-dialog').classList.add('hidden');
  state.confirmCallback = null;
}

// 删除一条记录(确认后调用)
async function deleteRecord(record) {
  const r = await apiDelete(state.me, record.type, record.id);
  if (!r.ok) { showApiErr(r); return; }

  // 本地移除
  state.records = state.records.filter(
    rec => !(rec.id === record.id && rec.type === record.type)
  );
  // 如果删的句子刚好是破戒选中的, 可能整句没有忏悔记录了, 清掉 breakPick
  renderQuickPick();
  renderBreakCard();
  renderTree();
  renderList();
  renderCalendar();
  toast(C.TEXT.TOAST_DELETED);
}

async function loadAll() {
  const r = await apiRecords(state.me);
  if (r.ok && Array.isArray(r.data.records)) {
    // 服务端已经按时间倒序, 这里防御性再排一遍
    state.records = r.data.records.slice().sort((a, b) => b.created_at - a.created_at);
  } else {
    state.records = [];
  }

  // break 记录的 content 不存数据库, 这里从同 normalized 的 confession 拼回
  // 找不到对应 confession 时(被删了 / 不同名字), fallback 用 normalized
  const contentByNorm = new Map();
  for (const rec of state.records) {
    if (rec.type === 'confess' && !contentByNorm.has(rec.normalized)) {
      contentByNorm.set(rec.normalized, rec.content);
    }
  }
  for (const rec of state.records) {
    if (rec.type === 'break' && !rec.content) {
      rec.content = contentByNorm.get(rec.normalized) || rec.normalized;
    }
  }

  state.breakPick = null;
  $('#stats-area').classList.add('hidden');
  $('#break-stats-area').classList.add('hidden');
  $('#break-but').value = '';
  renderQuickPick();
  renderBreakCard();
  renderTree();
  renderList();
  renderCalendar();
}


// ============================================================
// 视图: 忏悔输入(包含统计 + 历史快选)
// ============================================================

function renderQuickPick() {
  const wrap  = $('#quick-pick-list');
  const empty = $('#quick-pick-empty');
  wrap.innerHTML = '';

  // 只统计自己写过的"忏悔"(跳过破戒)
  const map = new Map();
  for (const r of state.records) {
    if (r.type === 'break') continue;
    if (!map.has(r.normalized)) {
      map.set(r.normalized, { content: r.content, normalized: r.normalized, color: r.color, count: 0 });
    }
    map.get(r.normalized).count++;
  }

  if (map.size === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  const items = [...map.values()].sort((a, b) => b.count - a.count).slice(0, 16);

  for (const it of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'quick-pick-item';

    const dot = document.createElement('span');
    dot.className = 'quick-pick-dot';
    dot.style.background = it.color;

    const text = document.createElement('span');
    text.className = 'quick-pick-text';
    text.textContent = it.content;

    const cnt = document.createElement('span');
    cnt.className = 'quick-pick-count';
    cnt.textContent = it.count + ' 次';

    btn.append(dot, text, cnt);
    btn.addEventListener('click', () => {
      const input = $('#confess-input');
      input.value = it.content;
      input.focus();
    });
    wrap.appendChild(btn);
  }
}

async function submitConfess() {
  const input = $('#confess-input');
  const raw   = input.value;

  if (!raw.trim())                    { toast(C.TEXT.TOAST_EMPTY_CONTENT);     return; }
  if (raw.length > C.MAX_CONTENT)     { toast(C.TEXT.TOAST_TOO_LONG_CONTENT);  return; }

  const content    = raw.trim();
  const normalized = normalize(content);
  if (!normalized) { toast(C.TEXT.TOAST_EMPTY_CONTENT); return; }

  // 颜色: 同句复用; 新句从池里挑一个未用色
  let color = colorOfNormalized(normalized);
  if (!color) {
    const usedColors = [...new Set(state.records.map(r => r.color))];
    color = pickColor(usedColors);
  }

  $('#btn-confess').disabled = true;
  const r = await apiConfess(state.me, content, normalized, color);
  $('#btn-confess').disabled = false;

  if (!r.ok) { showApiErr(r); return; }

  // 本地追加
  const now = Math.floor(Date.now() / 1000);
  state.records.unshift({
    id: r.data.id,
    type: 'confess',
    content, normalized, color,
    but_text: null,
    client_id: state.clientId,
    created_at: now,
  });

  // 拉统计 + 显示
  const s = await apiStats(state.me, normalized);
  if (s.ok) showStats(content, s.data);

  input.value = '';
  renderQuickPick();
  renderBreakCard();
  renderTree();
  renderList();
  renderCalendar();
  toast(C.TEXT.TOAST_CONFESS_OK);
}


// ============================================================
// 破戒: 选 chip + 写"因为..." + 提交
// ============================================================

function renderBreakCard() {
  const noHist    = $('#break-no-history');
  const pickArea  = $('#break-pick-area');
  const inputArea = $('#break-input-area');
  const pickList  = $('#break-pick-list');

  // 收集所有"我忏悔过的"不同句子(去重)
  const map = new Map();
  for (const r of state.records) {
    if (r.type === 'break') continue;
    if (!map.has(r.normalized)) {
      map.set(r.normalized, { content: r.content, normalized: r.normalized, color: r.color });
    }
  }

  if (map.size === 0) {
    noHist.classList.remove('hidden');
    pickArea.classList.add('hidden');
    inputArea.classList.add('hidden');
    state.breakPick = null;
    return;
  }
  noHist.classList.add('hidden');
  pickArea.classList.remove('hidden');

  // 校验当前 breakPick 是否还有效(可能用户删了忏悔, 这里没删功能, 但防御一下)
  if (state.breakPick && !map.has(state.breakPick.normalized)) {
    state.breakPick = null;
  }

  pickList.innerHTML = '';
  for (const it of map.values()) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'break-pick-item';
    if (state.breakPick && state.breakPick.normalized === it.normalized) {
      btn.classList.add('break-pick-item-active');
    }

    const dot = document.createElement('span');
    dot.className = 'break-pick-dot';
    dot.style.background = it.color;

    const text = document.createElement('span');
    text.className = 'break-pick-text';
    text.textContent = it.content;

    btn.append(dot, text);
    btn.addEventListener('click', () => {
      state.breakPick = it;
      renderBreakCard();
      $('#break-but').focus();
    });
    pickList.appendChild(btn);
  }

  if (state.breakPick) {
    inputArea.classList.remove('hidden');
    $('#break-content').textContent = state.breakPick.content;
  } else {
    inputArea.classList.add('hidden');
  }
}

async function submitBreak() {
  if (!state.breakPick) { toast(C.TEXT.TOAST_PICK_BREAK); return; }

  const butRaw = $('#break-but').value;
  if (butRaw.length > C.MAX_BUT) { toast(C.TEXT.TOAST_TOO_LONG_BUT); return; }
  const butText = butRaw.trim();

  const { content, normalized, color } = state.breakPick;

  $('#btn-break').disabled = true;
  const r = await apiBreak(state.me, content, normalized, color, butText);
  $('#btn-break').disabled = false;

  if (!r.ok) { showApiErr(r); return; }

  // 本地追加
  const now = Math.floor(Date.now() / 1000);
  state.records.unshift({
    id: r.data.id,
    type: 'break',
    content, normalized, color,
    but_text: butText || null,
    client_id: state.clientId,
    created_at: now,
  });

  // 拉统计 + 显示
  const s = await apiStats(state.me, normalized);
  if (s.ok) showBreakStats(content, s.data);

  // 清状态
  state.breakPick = null;
  $('#break-but').value = '';

  renderBreakCard();
  renderTree();
  renderList();
  renderCalendar();
  toast(C.TEXT.TOAST_BREAK_OK);
}

function showBreakStats(content, data) {
  $('#break-stat-today-same').textContent = data.today_same_break ?? 0;
  $('#break-stat-me-times').textContent   = data.me_break_times   ?? 0;
  $('#break-stat-all-times').textContent  = data.all_break_times  ?? 0;
  $$('.break-stat-content').forEach(el => { el.textContent = content; });
  $('#break-stats-area').classList.remove('hidden');
}

// 偷看别人的狡辩 — 把别人写过的随机一条理由填进 textarea
async function peekExcuse() {
  if (!state.breakPick) { toast(C.TEXT.TOAST_PICK_BREAK); return; }
  const { normalized } = state.breakPick;

  const btn = $('#btn-peek');
  btn.disabled = true;
  const r = await apiPeekExcuse(state.me, normalized);
  btn.disabled = false;

  if (!r.ok) { toast(C.TEXT.TOAST_NETWORK); return; }

  if (r.data.but_text) {
    $('#break-but').value = r.data.but_text;
    $('#break-but').focus();
  } else {
    toast(C.TEXT.BREAK_PEEK_EMPTY);
  }
}

function showStats(content, data) {
  $('#stat-today-same').textContent = data.today_same_normalized ?? 0;
  $('#stat-me-times').textContent   = data.me_times ?? 0;
  $('#stat-all-times').textContent  = data.all_times ?? 0;
  $$('.stat-content').forEach(el => { el.textContent = content; });
  $('#stats-area').classList.remove('hidden');
}


// ============================================================
// 视图: 时间树(倒序列表)
// ============================================================

function renderTree() {
  const wrap  = $('#tree-list');
  const empty = $('#tree-empty');
  wrap.innerHTML = '';

  if (state.records.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  for (const r of state.records) {
    const isBreak = r.type === 'break';
    const isMine  = r.client_id && r.client_id === state.clientId;

    const item = document.createElement('div');
    item.className = 'tree-item' + (isBreak ? ' tree-item-break' : '');
    item.style.setProperty('--tree-color', r.color);

    const time = document.createElement('div');
    time.className = 'tree-time';
    const timeText = document.createElement('span');
    timeText.textContent = fmtTime(r.created_at);
    const tag = document.createElement('span');
    tag.className = 'tree-type-tag';
    tag.textContent = isBreak ? '破戒' : '忏悔';
    time.append(timeText, tag);

    const content = document.createElement('div');
    content.className = 'tree-content';

    if (!isBreak) {
      content.appendChild(document.createTextNode(C.PREFIX));
      const fill = document.createElement('span');
      fill.className = 'tree-content-fill';
      fill.textContent = r.content;
      content.appendChild(fill);
      content.appendChild(document.createTextNode(C.SUFFIX));
    } else {
      content.appendChild(document.createTextNode(C.BREAK_PREFIX));
      const fill = document.createElement('span');
      fill.className = 'tree-content-fill';
      fill.textContent = r.content;
      content.appendChild(fill);
      content.appendChild(document.createTextNode(C.BREAK_SUFFIX));
      if (r.but_text) {
        const but = document.createElement('span');
        but.className = 'tree-but';
        but.textContent = C.BREAK_CONNECT + '  ' + r.but_text;
        content.appendChild(but);
      }
    }

    item.append(time, content);

    // 只有自己写的(client_id 匹配)才能删除
    if (isMine) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'tree-del';
      del.textContent = '删除';
      del.setAttribute('aria-label', '删除这条记录');
      del.addEventListener('click', () => {
        const fullText = isBreak
          ? (C.BREAK_PREFIX + r.content + C.BREAK_SUFFIX)
          : (C.PREFIX + r.content + C.SUFFIX);
        const typeName = isBreak ? '破戒' : '忏悔';
        openConfirm(`确定删除这条${typeName}: 「${fullText}」吗?`, () => deleteRecord(r));
      });
      item.appendChild(del);
    }

    wrap.appendChild(item);
  }
}


// ============================================================
// 视图: 忏悔列表(去重 + 次数 + 点击跳日历筛选)
// ============================================================

function renderList() {
  const wrap  = $('#list-items');
  const empty = $('#list-empty');
  wrap.innerHTML = '';

  // 按 normalized 分组, 统计两种类型次数
  const map = new Map();
  for (const r of state.records) {
    if (!map.has(r.normalized)) {
      map.set(r.normalized, {
        content: r.content, normalized: r.normalized, color: r.color,
        confess_count: 0, break_count: 0,
      });
    }
    const entry = map.get(r.normalized);
    if (r.type === 'break') entry.break_count++;
    else entry.confess_count++;
  }

  if (map.size === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  const items = [...map.values()].sort(
    (a, b) => (b.confess_count + b.break_count) - (a.confess_count + a.break_count)
  );

  for (const it of items) {
    const el = document.createElement('div');
    el.className = 'list-item';
    el.style.setProperty('--item-color', it.color);

    const content = document.createElement('div');
    content.className = 'list-item-content';
    content.textContent = C.PREFIX + it.content + C.SUFFIX;

    const counts = document.createElement('div');
    counts.className = 'list-item-counts';

    const cConfess = document.createElement('span');
    cConfess.className = 'list-item-count';
    setNodes(cConfess, [span('list-item-mark', '○'), ' 忏悔 ' + it.confess_count + ' 次']);

    const cBreak = document.createElement('span');
    cBreak.className = 'list-item-count';
    setNodes(cBreak, [span('list-item-mark', '×'), ' 破戒 ' + it.break_count + ' 次']);

    counts.append(cConfess, cBreak);

    el.append(content, counts);
    el.addEventListener('click', () => openSentenceDetail(it.normalized));
    wrap.appendChild(el);
  }
}


// ============================================================
// 视图: 日历本
// ============================================================

function renderCalendar() {
  const year  = state.calMonth.getFullYear();
  const month = state.calMonth.getMonth();

  $('#cal-month').textContent = `${year} 年 ${month + 1} 月`;

  // 月份统计 — 这个月你忏悔 x 次, 破戒 x 次
  let monthConfess = 0, monthBreak = 0;
  for (const r of state.records) {
    const d = new Date(r.created_at * 1000);
    if (d.getFullYear() === year && d.getMonth() === month) {
      if (r.type === 'break') monthBreak++;
      else monthConfess++;
    }
  }
  setNodes($('#cal-month-stats'), [
    '这个月你忏悔 ', span('stat-num', monthConfess), ' 次, 破戒 ', span('stat-num', monthBreak), ' 次',
  ]);

  // 筛选条
  const filterBar = $('#cal-filter');
  if (state.calFilter) {
    filterBar.classList.remove('hidden');
    const sample = state.records.find(r => r.normalized === state.calFilter);
    $('#cal-filter-content').textContent = sample ? sample.content : state.calFilter;
  } else {
    filterBar.classList.add('hidden');
  }

  // 本月第一天 / 总天数
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // 周一开头: getDay() 周日=0; 转为 周一=0
  const firstWeekday = (first.getDay() + 6) % 7;
  const prevMonthLast = new Date(year, month, 0).getDate();

  // 按天分组
  const byDay = new Map();
  for (const r of state.records) {
    const k = dateKey(r.created_at);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(r);
  }

  const todayKey = dateKey(Math.floor(Date.now() / 1000));

  const grid = $('#cal-grid');
  grid.innerHTML = '';

  const buildCell = (y, m, d, otherMonth) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cal-cell';
    if (otherMonth) {
      cell.classList.add('cal-cell-other');
      cell.disabled = true;
    }

    const pad = (n) => String(n).padStart(2, '0');
    const key = `${y}-${pad(m + 1)}-${pad(d)}`;
    if (key === todayKey) cell.classList.add('cal-cell-today');

    const dayRecs = byDay.get(key) || [];

    if (state.calFilter) {
      const hasMatch = dayRecs.some(r => r.normalized === state.calFilter);
      if (!hasMatch) cell.classList.add('cal-cell-dim');
    }

    const num = document.createElement('div');
    num.className = 'cal-day-num';
    num.textContent = d;
    cell.appendChild(num);

    if (dayRecs.length > 0) {
      const dots = document.createElement('div');
      dots.className = 'cal-dots';

      // 显示当天所有记录(不去重), 按时间正序排(早 → 晚)
      const sortedRecs = dayRecs.slice().sort((a, b) => a.created_at - b.created_at);

      for (const r of sortedRecs) {
        const dim = state.calFilter && r.normalized !== state.calFilter;
        const dot = document.createElement('span');
        if (r.type === 'break') {
          dot.className = 'cal-dot-break';
          dot.style.color = r.color;
          dot.textContent = '×';
        } else {
          dot.className = 'cal-dot';
          dot.style.background = r.color;
        }
        if (dim) dot.style.opacity = '0.15';
        dots.appendChild(dot);
      }
      cell.appendChild(dots);
    }

    if (!otherMonth) {
      cell.setAttribute('aria-label', `${y} 年 ${m + 1} 月 ${d} 日, ${dayRecs.length} 条记录`);
      cell.addEventListener('click', () => openDayDetail(key, y, m, d));
    }
    return cell;
  };

  // 上月补齐
  for (let i = firstWeekday; i > 0; i--) {
    const d = prevMonthLast - i + 1;
    const prev = new Date(year, month - 1, d);
    grid.appendChild(buildCell(prev.getFullYear(), prev.getMonth(), d, true));
  }
  // 本月
  for (let d = 1; d <= daysInMonth; d++) {
    grid.appendChild(buildCell(year, month, d, false));
  }
  // 下月补齐
  const filled = firstWeekday + daysInMonth;
  const rest = (7 - (filled % 7)) % 7;
  for (let d = 1; d <= rest; d++) {
    const next = new Date(year, month + 1, d);
    grid.appendChild(buildCell(next.getFullYear(), next.getMonth(), d, true));
  }
}

function openDayDetail(key, y, m, d) {
  const records = state.records
    .filter(r => dateKey(r.created_at) === key)
    .sort((a, b) => b.created_at - a.created_at);
  if (records.length === 0) return;
  openDetail(`${y} 年 ${m + 1} 月 ${d} 日`, records);
}

function openSentenceDetail(normalized) {
  const records = state.records
    .filter(r => r.normalized === normalized)
    .sort((a, b) => b.created_at - a.created_at);
  if (records.length === 0) return;
  const sample = records[0];
  openDetail('「' + C.PREFIX + sample.content + C.SUFFIX + '」', records);
}

// 通用详情弹层: 既可显示某天, 也可显示某句的所有记录
function openDetail(title, records) {
  $('#day-detail-date').textContent = title;

  const confessCount = records.filter(r => r.type !== 'break').length;
  const breakCount   = records.filter(r => r.type === 'break').length;

  const list = $('#day-detail-list');
  list.innerHTML = '';

  // 子标题: 两类计数
  const sum = document.createElement('p');
  sum.className = 'day-detail-sum';
  sum.textContent = `○ 忏悔 ${confessCount}  ·  × 破戒 ${breakCount}`;
  list.appendChild(sum);

  const pad = (n) => String(n).padStart(2, '0');

  for (const r of records) {
    const isBreak = r.type === 'break';

    const item = document.createElement('div');
    item.className = 'day-detail-item';
    item.style.setProperty('--detail-color', r.color);

    const mark = document.createElement('div');
    mark.className = 'day-detail-mark';
    mark.textContent = isBreak ? '×' : '○';

    const body = document.createElement('div');
    body.className = 'day-detail-body';

    const time = document.createElement('div');
    time.className = 'day-detail-time';
    const dt = new Date(r.created_at * 1000);
    // 同句详情显示完整日期; 当天详情只显示时分
    if (title.startsWith('「')) {
      time.textContent = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}  ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    } else {
      time.textContent = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    }
    body.appendChild(time);

    const content = document.createElement('div');
    content.className = 'day-detail-content';
    content.textContent = isBreak
      ? (C.BREAK_PREFIX + r.content + C.BREAK_SUFFIX)
      : (C.PREFIX + r.content + C.SUFFIX);
    body.appendChild(content);

    if (isBreak && r.but_text) {
      const but = document.createElement('div');
      but.className = 'day-detail-but';
      but.textContent = C.BREAK_CONNECT + '  ' + r.but_text;
      body.appendChild(but);
    }

    item.append(mark, body);
    list.appendChild(item);
  }

  $('#day-detail').classList.remove('hidden');
}

function closeDayDetail() {
  $('#day-detail').classList.add('hidden');
}


// ============================================================
// 启动
// ============================================================

function init() {
  bindIdentityPage();
  bindMainPage();

  const saved = localStorage.getItem(C.STORAGE.ME);
  if (saved) {
    state.me = saved;
    $('#me-name').textContent = saved;
    showPage('page-confess');
    showMainView('confess');
    showSubView('tree');
    loadAll();
  } else {
    showPage('page-identity');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
