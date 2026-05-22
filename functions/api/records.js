// ============================================================
// /api/records
// GET ?name=xxx  该忏悔者的所有记录(忏悔 + 破戒, 时间倒序混排)
// 返回 { records: [{ id, type, content, normalized, color, but_text, client_id, created_at }, ...] }
// 注: 返回 client_id 用于前端判断是不是自己写的(决定显示删除按钮)
// ============================================================

import { json, err, validName } from '../_utils.js';

// 对齐 _utils.js LIMITS.TOTAL — 单忏悔者最多写 10000 条
const LIMIT = 10000;

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const name = validName(url.searchParams.get('name') || '');
  if (!name) return err(400, 'invalid name');

  // UNION ALL 合并两表; break 表不存 content(去冗余), 返回 NULL 让前端从同 normalized 的 confess 拼回
  const { results } = await env.DB
    .prepare(
      "SELECT id, 'confess' AS type, content, normalized, color, NULL AS but_text, client_id, created_at " +
      "FROM confessions WHERE penitent_name = ? " +
      "UNION ALL " +
      "SELECT id, 'break' AS type, NULL AS content, normalized, color, but_text, client_id, created_at " +
      "FROM breakings WHERE penitent_name = ? " +
      "ORDER BY created_at DESC LIMIT ?"
    )
    .bind(name, name, LIMIT)
    .all();

  return json({ records: results || [] });
}
