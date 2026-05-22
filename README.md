# 赛博上帝 / 忏悔楼

联网匿名忏悔楼。每天写一句「我再也不 ___」，看到全站有多少人和你一起忏悔。

## 技术栈

- **前端**：原生 HTML + CSS + JS（无框架）
- **后端**：Cloudflare Pages Functions（serverless）
- **数据库**：Cloudflare D1（SQLite）
- **部署**：Cloudflare Pages（一站式）

## 本地开发

```bash
# 装依赖
npm install

# 第一次：在本地建表
npm run db:init

# 跑本地开发服务器
npm run dev
```

## 部署

```bash
# 第一次部署到线上：在线上建表
npm run db:init:remote

# 推前端 + Functions 到 Cloudflare
npm run deploy
```

## 文件结构

```
.
├── public/              前端静态文件（HTML/CSS/JS）
├── functions/api/       API 函数（每个 .js = 一个 API 端点）
├── schema.sql           数据库表结构
├── wrangler.toml        Cloudflare 配置
└── package.json         项目依赖
```

## 数据库设计

两张表：

- **penitents** 忏悔者：`name`（主键，唯一）+ `created_at`
- **confessions** 忏悔记录：`id` + `penitent_name` + `content` + `normalized`（去空格去标点后用于统计）+ `color` + `created_at`

详见 `schema.sql`。

## 隐私设计

- 没有密码，名字 = 访问 key
- 任何人输入一个忏悔者的名字都能看到该忏悔者的全部忏悔
- 主页提醒用户：不要在内容里输入隐私信息
