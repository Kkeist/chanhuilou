// ============================================================
// 集中可改配置 — 句式/字数/颜色/文案统一在这里维护
// 改这里不要改其他文件
// ============================================================

window.CONFIG = Object.freeze({

  // 忏悔句式 — 前缀和后缀
  PREFIX: '我再也不',
  SUFFIX: '了',

  // 破戒句式 — "我 X 了, 因为 Y"
  BREAK_PREFIX: '我',
  BREAK_SUFFIX: '了',
  BREAK_CONNECT: '因为',

  // 长度限制
  MAX_NAME: 30,
  MAX_CONTENT: 50,
  MAX_BUT: 100,

  // 颜色池 — 同一句忏悔永远用同一色; 不同句优先挑还没用过的
  // 12 色相均匀分布(每 30°), 中等饱和 + 中等亮度, 视觉差异明显且不刺眼
  COLORS: [
    '#d18877',  // 砖红
    '#d5a96f',  // 焦糖
    '#c9b964',  // 芥末黄
    '#9bc472',  // 草绿
    '#6dc095',  // 翠绿
    '#5fc1bf',  // 青
    '#6aa2cf',  // 海蓝
    '#8e8cd0',  // 雾紫
    '#bf83cb',  // 紫罗兰
    '#cf80a4',  // 粉红
    '#bd6868',  // 朱红
    '#8aa67a',  // 橄榄
  ],

  // API 端点(同源, Cloudflare Pages Functions)
  API: {
    PENITENT:    '/api/penitent',
    CONFESS:     '/api/confess',
    BREAK:       '/api/break',
    STATS:       '/api/stats',
    RECORDS:     '/api/records',
    PEEK_EXCUSE: '/api/peek_excuse',
    DELETE:      '/api/delete',
  },

  // 本地存储 key
  STORAGE: {
    ME:        'chanhuilou.me',
    CLIENT_ID: 'chanhuilou.client_id',
  },

  // 文案 — 修改文字不要散落到 app.js
  TEXT: {
    TOAST_NAME_TAKEN:     '已经有一个叫这个名字的忏悔者!',
    TOAST_NAME_AVAILABLE: '这个名字还没人用~',
    TOAST_CONFESS_OK:     '忏悔已记下。',
    TOAST_BREAK_OK:       '破戒已记下。',
    TOAST_CREATED:        '欢迎你~新的忏悔者',
    TOAST_EMPTY_NAME:    '请输入名字。',
    TOAST_EMPTY_CONTENT: '还没写内容。',
    TOAST_PICK_BREAK:    '从过往忏悔里选一个吧。',
    TOAST_TOO_LONG_NAME: '名字最多 30 字。',
    TOAST_TOO_LONG_CONTENT: '内容最多 50 字。',
    TOAST_TOO_LONG_BUT:     '狡辩最多 100 字。',
    TOAST_NETWORK:       '网络好像有点慢, 稍等再试。',
    TOAST_RATE_MINUTE:   '操作太快了, 一分钟内最多 30 条~',
    TOAST_RATE_DAY:      '今天写得有点多了, 明天再来吧~',
    TOAST_RATE_TOTAL:    '已经写满 10000 条了, 去时间树删一些旧的记录腾点空间吧~',
    TOAST_DELETED:       '已删除',
    CONFIRM_DEL_TITLE:   '确认删除',
    CONFIRM_DEL_OK:      '删除',
    CONFIRM_DEL_CANCEL:  '取消',

    // 破戒卡片
    BREAK_TITLE:       '今日破戒',
    BREAK_PLACEHOLDER: '狡辩一下吧',
    BREAK_BTN:         '破戒',
    BREAK_NO_HISTORY:  '还没忏悔过, 没法破戒。先写一条忏悔吧。',
    BREAK_PICK_HINT:   '所以你破了哪一个？',
    BREAK_PEEK_BTN:    '偷看一个理由',
    BREAK_PEEK_EMPTY:  '还没有人写过这个的理由, 自己想想吧~',
  },
});
