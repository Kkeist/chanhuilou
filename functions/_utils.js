// ============================================================
// 共享工具 — 校验 / JSON 响应 / 时间
// 文件名以下划线开头, Cloudflare Pages 不会映射为路由
// ============================================================

export const MAX_NAME = 30;
export const MAX_CONTENT = 50;
export const MAX_NORMALIZED = 50;
export const MAX_BUT = 100;
export const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
export const CLIENT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 标准 JSON 响应
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

// 错误响应
export function err(status, message) {
  return json({ error: message }, status);
}

// 校验名字: 非空 + 不超长 + 不含控制字符
export function validName(s) {
  if (typeof s !== 'string') return null;
  const v = s.trim();
  if (!v) return null;
  if (v.length > MAX_NAME) return null;
  if (/[\x00-\x1f\x7f]/.test(v)) return null;
  return v;
}

// 校验忏悔内容
export function validContent(s) {
  if (typeof s !== 'string') return null;
  const v = s.trim();
  if (!v) return null;
  if (v.length > MAX_CONTENT) return null;
  if (/[\x00-\x1f\x7f]/.test(v)) return null;
  return v;
}

// 校验归一化字符串
export function validNormalized(s) {
  if (typeof s !== 'string') return null;
  const v = s.trim();
  if (!v) return null;
  if (v.length > MAX_NORMALIZED) return null;
  return v;
}

// 校验颜色: 必须是 #RRGGBB
export function validColor(s) {
  if (typeof s !== 'string') return null;
  return COLOR_RE.test(s) ? s.toLowerCase() : null;
}

// 校验 client_id (UUID 格式)
export function validClientId(s) {
  if (typeof s !== 'string') return null;
  return CLIENT_ID_RE.test(s) ? s.toLowerCase() : null;
}

// 校验"因为..."文字: 可空, 但有长度上限 + 不允许控制字符
export function validBut(s) {
  if (s === undefined || s === null || s === '') return '';
  if (typeof s !== 'string') return null;
  const v = s.trim();
  if (v.length > MAX_BUT) return null;
  if (/[\x00-\x08\x0e-\x1f\x7f]/.test(v)) return null;
  return v;
}

// 今天的开始时间(秒级 Unix, UTC+8 时区计算"今天")
// 给中国用户用, 用 UTC+8 边界, 不用服务器本地时区
export function todayStartSec() {
  const TZ_OFFSET = 8 * 3600;
  const nowSec = Math.floor(Date.now() / 1000);
  return nowSec - ((nowSec + TZ_OFFSET) % 86400);
}

// 写入限额配置 — 防机器人 + 防一个人撑爆数据库
export const LIMITS = {
  PER_MINUTE: 30,      // 每分钟最多写 30 条(忏悔+破戒合计)
  PER_DAY:    200,     // 每天最多 200 条
  TOTAL:      10000,   // 累计最多 10000 条
};

// 检查写入限额; 返回 null 通过, 否则返回拒绝原因字符串
export async function checkWriteLimit(env, name) {
  const nowSec = Math.floor(Date.now() / 1000);
  const oneMinAgo = nowSec - 60;
  const todayStart = todayStartSec();

  // 一次查 3 个聚合(忏悔+破戒合并计数)
  const [minRow, dayRow, totalRow] = await Promise.all([
    env.DB.prepare(
      "SELECT (" +
        "(SELECT COUNT(*) FROM confessions WHERE penitent_name = ? AND created_at >= ?) + " +
        "(SELECT COUNT(*) FROM breakings   WHERE penitent_name = ? AND created_at >= ?)" +
      ") AS n"
    ).bind(name, oneMinAgo, name, oneMinAgo).first(),

    env.DB.prepare(
      "SELECT (" +
        "(SELECT COUNT(*) FROM confessions WHERE penitent_name = ? AND created_at >= ?) + " +
        "(SELECT COUNT(*) FROM breakings   WHERE penitent_name = ? AND created_at >= ?)" +
      ") AS n"
    ).bind(name, todayStart, name, todayStart).first(),

    env.DB.prepare(
      "SELECT (" +
        "(SELECT COUNT(*) FROM confessions WHERE penitent_name = ?) + " +
        "(SELECT COUNT(*) FROM breakings   WHERE penitent_name = ?)" +
      ") AS n"
    ).bind(name, name).first(),
  ]);

  if ((minRow?.n   || 0) >= LIMITS.PER_MINUTE) return 'rate_minute';
  if ((dayRow?.n   || 0) >= LIMITS.PER_DAY)    return 'rate_day';
  if ((totalRow?.n || 0) >= LIMITS.TOTAL)      return 'rate_total';
  return null;
}
