// ============================================================
// EdgeOne Pages Edge Functions — catch-all 反向代理
// 路径: edge-functions/[[default]].js 匹配所有路径 + 所有 HTTP 方法
// 透传请求到 Cloudflare Worker, 拿响应返回. 不动 Cloudflare 后端.
// ============================================================

const ORIGIN = 'https://always-regret-never-stop.kkkb.workers.dev';

export default async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // 拼目标 URL: origin + 原始 path + query
  const target = ORIGIN + url.pathname + url.search;

  // 复制 headers, 改 Host 让上游识别真实主机名
  const upstreamHeaders = new Headers(request.headers);
  upstreamHeaders.set('Host', new URL(ORIGIN).host);
  upstreamHeaders.set('X-Forwarded-Host', url.host);
  upstreamHeaders.set('X-Forwarded-Proto', url.protocol.replace(':', ''));

  // 构造上游请求 (body 在非 GET/HEAD 时透传)
  const upstreamRequest = new Request(target, {
    method: request.method,
    headers: upstreamHeaders,
    body: (request.method === 'GET' || request.method === 'HEAD') ? undefined : request.body,
    redirect: 'manual',
  });

  // 发请求 + 拿响应
  const upstreamResponse = await fetch(upstreamRequest);

  // 回传响应 — body / status / headers 透传, 去掉 hop-by-hop headers
  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.delete('transfer-encoding');
  responseHeaders.delete('connection');

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}
