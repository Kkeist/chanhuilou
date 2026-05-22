// ============================================================
// EdgeOne Pages Functions — 反向代理
// 所有进来的请求透传到 Cloudflare Worker (always-regret-never-stop.kkkb.workers.dev)
// EdgeOne 国内边缘节点接用户 -> 服务器对服务器到 Cloudflare -> 拿响应返回
// 用户感受: 访问 xxx.edgeone.app, 国内 CDN 加速, 后端 D1 / API 全在 Cloudflare 不动
// ============================================================

const ORIGIN = 'https://always-regret-never-stop.kkkb.workers.dev';

// EdgeOne Pages Functions 命名约定: [[default]].js = catch-all 路由 /*
export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // 拼目标 URL: origin + 原始 path + query
  const target = ORIGIN + url.pathname + url.search;

  // 复制 headers, 改 Host 让上游知道真实主机名
  const upstreamHeaders = new Headers(request.headers);
  upstreamHeaders.set('Host', new URL(ORIGIN).host);
  // 加 X-Forwarded-* 让上游识别真实客户端
  upstreamHeaders.set('X-Forwarded-Host', url.host);
  upstreamHeaders.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
  const cfIp = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-real-ip')
    || request.headers.get('x-forwarded-for')
    || '';
  if (cfIp) upstreamHeaders.set('X-Forwarded-For', cfIp);

  // 构造上游请求 (body 在非 GET/HEAD 时透传)
  const upstreamRequest = new Request(target, {
    method: request.method,
    headers: upstreamHeaders,
    body: (request.method === 'GET' || request.method === 'HEAD') ? undefined : request.body,
    redirect: 'manual',
  });

  // 发请求 + 拿响应
  const upstreamResponse = await fetch(upstreamRequest);

  // 回传响应 — body / status / headers 全部透传
  // 注: Cloudflare 设的 cookie domain 是 .workers.dev, 浏览器在 .edgeone.app 域名下不会保存
  //      本项目不用 cookie (用 localStorage 存 client_id / me), 所以无影响
  const responseHeaders = new Headers(upstreamResponse.headers);
  // 移除可能引起冲突的 hop-by-hop headers
  responseHeaders.delete('transfer-encoding');
  responseHeaders.delete('connection');

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}
