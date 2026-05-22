// ============================================================
// /api/delete
// POST {name, type, id, client_id}  删除自己写的一条忏悔或破戒
// type: 'confess' | 'break'
// 关键: WHERE 同时匹配 id, penitent_name 和 client_id
// 防止同名用户互删: 即使你和我同名"小狗", 你的 client_id 不一样, 删不了我的
// ============================================================

import { json, err, validName, validClientId } from '../_utils.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return err(400, 'invalid body'); }

  const name     = validName(body.name);
  const type     = body.type;
  const id       = parseInt(body.id, 10);
  const clientId = validClientId(body.client_id);

  if (!name) return err(400, 'invalid name');
  if (type !== 'confess' && type !== 'break') return err(400, 'invalid type');
  if (!Number.isInteger(id) || id <= 0)       return err(400, 'invalid id');
  if (!clientId) return err(400, 'invalid client_id');

  // type 已被校验只能是 confess|break, 映射到固定表名(防 SQL 注入)
  const table = type === 'break' ? 'breakings' : 'confessions';

  // 必须同时匹配 id, penitent_name, client_id — 三重校验
  // 防止同名用户互删 + 防止伪造别人 client_id 撞库(UUID 空间足够大)
  const result = await env.DB
    .prepare(`DELETE FROM ${table} WHERE id = ? AND penitent_name = ? AND client_id = ?`)
    .bind(id, name, clientId)
    .run();

  // changes = 0 说明没匹配的记录(id 不存在 / name 不对 / client_id 不对)
  if (!result.meta || result.meta.changes === 0) {
    return err(404, 'not found');
  }

  return json({ ok: true });
}
