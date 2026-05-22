// ============================================================
// /api/break
// POST {name, content, normalized, color, but_text?}  写一条破戒
// 返回 { id }
// ============================================================

import { json, err, validName, validContent, validNormalized, validColor, validBut, validClientId, checkWriteLimit } from '../_utils.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return err(400, 'invalid body'); }

  const name       = validName(body.name);
  const content    = validContent(body.content);
  const normalized = validNormalized(body.normalized);
  const color      = validColor(body.color);
  const butText    = validBut(body.but_text);
  const clientId   = validClientId(body.client_id);

  if (!name)              return err(400, 'invalid name');
  if (!content)           return err(400, 'invalid content');
  if (!normalized)        return err(400, 'invalid normalized');
  if (!color)             return err(400, 'invalid color');
  if (butText === null)   return err(400, 'invalid but_text');
  if (!clientId)          return err(400, 'invalid client_id');

  // 限额检查 — 防机器人刷量 + 防个人占爆数据库
  const limit = await checkWriteLimit(env, name);
  if (limit) return err(429, limit);

  // 保险: 同样延迟创建 penitent
  await env.DB
    .prepare('INSERT OR IGNORE INTO penitents (name) VALUES (?)')
    .bind(name)
    .run();

  // 注: 不存 content 列(冗余), 前端会从同 normalized 的 confession 拼回原文
  // content 仍接受作为参数(API 兼容性), 但不入库
  void content;

  const res = await env.DB
    .prepare('INSERT INTO breakings (penitent_name, normalized, but_text, color, client_id) VALUES (?, ?, ?, ?, ?)')
    .bind(name, normalized, butText, color, clientId)
    .run();

  const id = res?.meta?.last_row_id ?? null;
  return json({ id });
}
