// ============================================================
// /api/penitent
// GET  ?name=xxx  查询忏悔者是否存在  (200 / 404)
// 注: 不提供 POST. 忏悔者延迟创建 — 第一次写忏悔 / 破戒时
// confess.js / break.js 用 INSERT OR IGNORE 自动建.
// 避免"注册了但没写忏悔的空账号"占空间.
// ============================================================

import { json, err, validName } from '../_utils.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const name = validName(url.searchParams.get('name') || '');
  if (!name) return err(400, 'invalid name');

  const row = await env.DB
    .prepare('SELECT name FROM penitents WHERE name = ?')
    .bind(name)
    .first();

  if (!row) return err(404, 'not found');
  return json({ name });
}
