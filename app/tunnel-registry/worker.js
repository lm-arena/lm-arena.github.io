const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function isAuthorized(request, env) {
  const auth = request.headers.get('Authorization') || '';
  return auth === `Bearer ${env.TUNNEL_WRITE_KEY}`;
}

async function handleTunnelsGet(env) {
  const list = await env.TUNNELS_KV.list({ prefix: 'tunnel:' });
  const tunnels = {};
  for (const key of list.keys) {
    const model = key.name.slice('tunnel:'.length);
    tunnels[model] = await env.TUNNELS_KV.get(key.name);
  }
  return jsonResponse(tunnels);
}

async function handleTunnelPut(request, env, model) {
  if (!isAuthorized(request, env)) return jsonResponse({ error: 'unauthorized' }, 401);
  const { url } = await request.json();
  if (!url?.startsWith('https://')) return jsonResponse({ error: 'invalid url' }, 400);
  // 6h TTL as safety net — workflows also DELETE on cleanup
  await env.TUNNELS_KV.put(`tunnel:${model}`, url, { expirationTtl: 21600 });
  return jsonResponse({ ok: true, model, url });
}

async function handleTunnelDelete(request, env, model) {
  if (!isAuthorized(request, env)) return jsonResponse({ error: 'unauthorized' }, 401);
  await env.TUNNELS_KV.delete(`tunnel:${model}`);
  return jsonResponse({ ok: true, model });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const { pathname } = new URL(request.url);

    if (pathname === '/tunnels' && request.method === 'GET') {
      return handleTunnelsGet(env);
    }

    const tunnelMatch = pathname.match(/^\/tunnel\/([^/]+)$/);
    if (tunnelMatch) {
      const model = tunnelMatch[1];
      if (request.method === 'PUT') return handleTunnelPut(request, env, model);
      if (request.method === 'DELETE') return handleTunnelDelete(request, env, model);
    }

    if (pathname === '/health') {
      return new Response('ok');
    }

    return new Response('Not found', { status: 404 });
  },
};
