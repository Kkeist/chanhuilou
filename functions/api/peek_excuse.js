// ============================================================
// /api/peek_excuse
// GET ?name=xxx&normalized=xxx
// 拉同句的随机一条狡辩(包括自己 + 所有人), but_text 非空
// 返回 { but_text: '...' } 或 { but_text: null }
// 注: name 参数保留(未来可能需要), 当前未参与过滤
// ============================================================

import { json, err, validName, validNormalized } from '../_utils.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const name       = validName(url.searchParams.get('name') || '');
  const normalized = validNormalized(url.searchParams.get('normalized') || '');
  if (!name || !normalized) return err(400, 'invalid params');

  // 同 normalized + but_text 非空, 随机取一条(包括自己写过的)
  const row = await env.DB
    .prepare(
      "SELECT but_text FROM breakings " +
      "WHERE normalized = ? " +
      "AND but_text IS NOT NULL AND but_text != '' " +
      "ORDER BY RANDOM() LIMIT 1"
    )
    .bind(normalized)
    .first();

  return json({ but_text: row?.but_text || null });
}
