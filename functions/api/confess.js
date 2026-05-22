// ============================================================
// /api/confess
// POST {name, content, normalized, color}  写一条忏悔
// 返回 { id }
// ============================================================

import { json, err, validName, validContent, validNormalized, validColor, validClientId, checkWriteLimit } from '../_utils.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return err(400, 'invalid body'); }

  const name       = validName(body.name);
  const content    = validContent(body.content);
  const normalized = validNormalized(body.normalized);
  const color      = validColor(body.color);
  const clientId   = validClientId(body.client_id);

  if (!name)       return err(400, 'invalid name');
  if (!content)    return err(400, 'invalid content');
  if (!normalized) return err(400, 'invalid normalized');
  if (!color)      return err(400, 'invalid color');
  if (!clientId)   return err(400, 'invalid client_id');

  // 限额检查 — 防机器人刷量 + 防个人占爆数据库
  const limit = await checkWriteLimit(env, name);
  if (limit) return err(429, limit);

  // 延迟创建: 第一次忏悔时自动建 penitent (避免"注册但没写"的空账号占空间)
  // INSERT OR IGNORE 撞 PRIMARY KEY 重名约束时静默跳过, 不报错
  await env.DB
    .prepare('INSERT OR IGNORE INTO penitents (name) VALUES (?)')
    .bind(name)
    .run();

  const res = await env.DB
    .prepare('INSERT INTO confessions (penitent_name, content, normalized, color, client_id) VALUES (?, ?, ?, ?, ?)')
    .bind(name, content, normalized, color, clientId)
    .run();

  const id = res?.meta?.last_row_id ?? null;
  return json({ id });
}
