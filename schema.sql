-- 赛博上帝 / 忏悔楼 数据库 schema
-- 跑在 Cloudflare D1 (SQLite)

-- 开启外键约束 (SQLite 默认 off, D1 每个 session 需主动开)
PRAGMA foreign_keys = ON;

-- ============================================================
-- 表 1: penitents (忏悔者)
-- 每个忏悔者一行, 名字唯一
-- ============================================================
CREATE TABLE IF NOT EXISTS penitents (
  -- 忏悔者名字, 同时作为主键(唯一 key)
  name TEXT PRIMARY KEY NOT NULL,

  -- 创建时间(秒级 Unix 时间戳, SQLite 默认存数字)
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);


-- ============================================================
-- 表 2: confessions (忏悔记录)
-- 每写一句忏悔就一行
-- ============================================================
CREATE TABLE IF NOT EXISTS confessions (
  -- 自增主键
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- 这条忏悔属于哪个忏悔者(关联 penitents.name)
  penitent_name TEXT NOT NULL,

  -- 忏悔内容(我再也不"___"后面填的部分, 不存前缀)
  -- 比如 "买衣服" / "给男人花钱"
  content TEXT NOT NULL,

  -- 归一化后的内容(去空格 + 去末尾标点), 用于统计同句子计数
  -- 比如 content="买衣服 ", normalized="买衣服"
  normalized TEXT NOT NULL,

  -- 这条忏悔在自己账户下显示的颜色 (#RRGGBB)
  -- 同一个 normalized 在同一个忏悔者下用同一个颜色
  color TEXT NOT NULL,

  -- 客户端身份(UUID, 存浏览器 localStorage)
  -- 用于鉴权: 同名情况下, 只有 client_id 匹配才能删
  client_id TEXT,

  -- 创建时间(秒级 Unix 时间戳)
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),

  -- 外键, 关联到 penitents.name
  FOREIGN KEY (penitent_name) REFERENCES penitents(name)
);

-- ============================================================
-- 索引(让常用查询变快)
-- ============================================================

-- 查"某忏悔者的所有忏悔"很快
CREATE INDEX IF NOT EXISTS idx_confessions_penitent
  ON confessions(penitent_name);

-- 查"某句忏悔被全站说过多少次"很快
CREATE INDEX IF NOT EXISTS idx_confessions_normalized
  ON confessions(normalized);

-- 查"某天的忏悔"很快
CREATE INDEX IF NOT EXISTS idx_confessions_created
  ON confessions(created_at);


-- ============================================================
-- 表 3: breakings (破戒记录)
-- 用户从自己忏悔过的句子里挑一句, 标记为"破戒了"+ 可选写"因为..."
-- ============================================================
CREATE TABLE IF NOT EXISTS breakings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  penitent_name TEXT NOT NULL,

  -- 归一化后的内容, 用于按句子聚合统计
  -- 注: 不存 content 冗余字段, 前端从同 normalized 的 confession 拼回
  normalized TEXT NOT NULL,

  -- 用户写的"因为..."狡辩内容, 可空
  but_text TEXT,

  -- 同句忏悔的颜色, 继承自最早那条 confession
  color TEXT NOT NULL,

  -- 客户端身份(UUID, 同 confessions, 用于删除鉴权)
  client_id TEXT,

  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),

  FOREIGN KEY (penitent_name) REFERENCES penitents(name)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_breakings_penitent
  ON breakings(penitent_name);

CREATE INDEX IF NOT EXISTS idx_breakings_normalized
  ON breakings(normalized);

CREATE INDEX IF NOT EXISTS idx_breakings_created
  ON breakings(created_at);

-- 注: client_id 列不加索引
-- 删除查询走 id 主键索引(已经够快), 没有按 client_id 单独查询的场景
-- 不加索引省 ~57 字节/行, 累计可观
