// ============================================================
// /api/stats
// GET ?name=xxx&normalized=xxx
// 返回 {
//   today_same_normalized,    今天有多少不同忏悔者忏悔过这句
//   me_times,                 我忏悔过这句多少次
//   all_times,                全站这句被忏悔多少次
//   today_same_break,         今天有多少不同忏悔者破戒过这句
//   me_break_times,           我破戒这句多少次
//   all_break_times           全站这句被破戒多少次
// }
// ============================================================

import { json, err, validName, validNormalized, todayStartSec } from '../_utils.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const name       = validName(url.searchParams.get('name') || '');
  const normalized = validNormalized(url.searchParams.get('normalized') || '');
  if (!name || !normalized) return err(400, 'invalid params');

  const todayStart = todayStartSec();

  const [todaySameRow, meTimesRow, allTimesRow, todayBreakRow, meBreakRow, allBreakRow] = await Promise.all([
    env.DB.prepare(
      'SELECT COUNT(DISTINCT penitent_name) AS n FROM confessions WHERE normalized = ? AND created_at >= ?'
    ).bind(normalized, todayStart).first(),

    env.DB.prepare(
      'SELECT COUNT(*) AS n FROM confessions WHERE normalized = ? AND penitent_name = ?'
    ).bind(normalized, name).first(),

    env.DB.prepare(
      'SELECT COUNT(*) AS n FROM confessions WHERE normalized = ?'
    ).bind(normalized).first(),

    env.DB.prepare(
      'SELECT COUNT(DISTINCT penitent_name) AS n FROM breakings WHERE normalized = ? AND created_at >= ?'
    ).bind(normalized, todayStart).first(),

    env.DB.prepare(
      'SELECT COUNT(*) AS n FROM breakings WHERE normalized = ? AND penitent_name = ?'
    ).bind(normalized, name).first(),

    env.DB.prepare(
      'SELECT COUNT(*) AS n FROM breakings WHERE normalized = ?'
    ).bind(normalized).first(),
  ]);

  return json({
    today_same_normalized: todaySameRow?.n  || 0,
    me_times:              meTimesRow?.n    || 0,
    all_times:             allTimesRow?.n   || 0,
    today_same_break:      todayBreakRow?.n || 0,
    me_break_times:        meBreakRow?.n    || 0,
    all_break_times:       allBreakRow?.n   || 0,
  });
}
