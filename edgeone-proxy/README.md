# EdgeOne Pages 反向代理 — 国内访问加速

把这个目录当成一个独立的 EdgeOne Pages 项目部署。它做一件事：把进来的请求透传到 Cloudflare Worker `always-regret-never-stop.kkkb.workers.dev`。

用户感受：访问 `xxx.edgeone.app`（国内 CDN 直连）→ 实际数据来自 Cloudflare（D1 / API / 静态资源全在原处）。

## 部署步骤（你做）

### 1. 注册 EdgeOne 国际版（关键！）

打开 **https://edgeone.ai/**（**不是** edgeone.cloud.tencent.com，那是国内版要实名）

邮箱注册即可，不要信用卡、不要实名。

### 2. 控制台新建 Pages 项目

登入 dashboard → 「Pages」 → 「Create Project」 → 选择 **Import Git Repository**

授权 GitHub，选 `Kkeist/chanhuilou` 这个 repo。

**关键配置**：
- **Root directory**: `edgeone-proxy`（重要！只用这个子目录，不是整个 repo）
- **Build command**: 留空（不需要 build）
- **Output directory**: 留空（纯 Functions 不产出静态文件）
- **Framework preset**: None / Static

点 Deploy。

### 3. 拿域名

部署完成后 EdgeOne 给一个域名，类似 `chanhuilou-proxy.edgeone.app`（具体看你项目名）。

打开这个域名，应该看到你的赛博上帝/忏悔楼页面，完全跟 `always-regret-never-stop.kkkb.workers.dev` 一样，但国内能直连。

## 维护

如果哪天我们改了 Cloudflare Worker 的代码（API / 前端 HTML / 任何东西），**不需要重新部署 EdgeOne 项目**——反代是实时透传，原服务怎么变它就怎么传过去。

只有改 `edgeone-proxy/functions/[[default]].js` 里的 `ORIGIN` 时才需要重新部署 EdgeOne 项目。

## 局限

- 浏览器在 `xxx.edgeone.app` 域名下存的 localStorage（`chanhuilou.me`、`chanhuilou.client_id`）跟 `always-regret-never-stop.kkkb.workers.dev` 域名下的是分开的——这是浏览器同源策略，所有反代都有这问题。用户从一个域名换到另一个等于新身份。
- HTML 里的 canonical 链接 + sitemap 还是写 `.workers.dev` 域名（SEO 给搜索引擎用，跟用户访问无关）。
