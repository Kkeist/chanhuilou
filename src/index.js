// ============================================================
// Workers 入口 — 路由 /api/* 到 functions/api/ 下的 Pages-Functions-style handler
// 其他路径 fallback 到 static assets binding (Cloudflare Workers Assets, 会自动处理
// _headers / 404.html / index.html 之类的 SPA 行为)
//
// 用 Pages Functions 的 onRequestGet / onRequestPost 命名约定, 在这里手动 dispatch.
// 这样原有 functions/api/*.js 不需要改, src/index.js 只做一层薄路由。
// ============================================================

import * as penitent   from '../functions/api/penitent.js';
import * as confess    from '../functions/api/confess.js';
import * as breakApi   from '../functions/api/break.js';
import * as deleteApi  from '../functions/api/delete.js';
import * as records    from '../functions/api/records.js';
import * as stats      from '../functions/api/stats.js';
import * as peekExcuse from '../functions/api/peek_excuse.js';

const API = {
  '/api/penitent':    penitent,
  '/api/confess':     confess,
  '/api/break':       breakApi,
  '/api/delete':      deleteApi,
  '/api/records':     records,
  '/api/stats':       stats,
  '/api/peek_excuse': peekExcuse,
};

// HTTP method 转 Pages Functions 命名: GET → onRequestGet, POST → onRequestPost
function methodToFn(method) {
  return 'onRequest' + method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
}

function jsonErr(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // /api/* 路由
    const handler = API[url.pathname];
    if (handler) {
      const fn = handler[methodToFn(request.method)];
      if (!fn) return jsonErr(405, 'method not allowed');
      return fn({ request, env, ctx });
    }

    // 其他走 static assets — Workers Assets 自动处理 _headers / 404 / index
    return env.ASSETS.fetch(request);
  },
};
