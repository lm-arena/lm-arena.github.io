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

async function handleTunnelGet(env, model) {
  const [url, signal] = await Promise.all([
    env.TUNNELS_KV.get(`tunnel:${model}`),
    env.TUNNELS_KV.get(`signal:${model}`),
  ]);
  if (!url) return jsonResponse({ error: 'not found' }, 404);
  return jsonResponse({ url, signal: signal || null });
}

async function handleTunnelPut(request, env, model) {
  if (!isAuthorized(request, env)) return jsonResponse({ error: 'unauthorized' }, 401);
  const { url } = await request.json();
  if (!url?.startsWith('https://')) return jsonResponse({ error: 'invalid url' }, 400);
  // Fresh registration clears any pending signal
  await Promise.all([
    env.TUNNELS_KV.put(`tunnel:${model}`, url, { expirationTtl: 21600 }),
    env.TUNNELS_KV.delete(`signal:${model}`),
  ]);
  return jsonResponse({ ok: true, model, url });
}

async function handleTunnelDelete(request, env, model) {
  if (!isAuthorized(request, env)) return jsonResponse({ error: 'unauthorized' }, 401);
  await Promise.all([
    env.TUNNELS_KV.delete(`tunnel:${model}`),
    env.TUNNELS_KV.delete(`signal:${model}`),
  ]);
  return jsonResponse({ ok: true, model });
}

async function handlePurge(env) {
  const list = await env.TUNNELS_KV.list({ prefix: 'tunnel:' });
  const purged = [];

  await Promise.all(list.keys.map(async ({ name }) => {
    const model = name.slice('tunnel:'.length);
    const url = await env.TUNNELS_KV.get(name);
    if (!url) return;
    try {
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error('unhealthy');
    } catch {
      await Promise.all([
        env.TUNNELS_KV.delete(`tunnel:${model}`),
        env.TUNNELS_KV.delete(`signal:${model}`),
      ]);
      purged.push(model);
    }
  }));

  return jsonResponse({ ok: true, purged });
}

async function handleSignalPut(request, env, model) {
  if (!isAuthorized(request, env)) return jsonResponse({ error: 'unauthorized' }, 401);
  const body = await request.json();
  const signal = body.signal ?? null;
  if (!['stop', 'restart', null].includes(signal)) return jsonResponse({ error: 'invalid signal' }, 400);
  if (signal === null) {
    await env.TUNNELS_KV.delete(`signal:${model}`);
  } else {
    await env.TUNNELS_KV.put(`signal:${model}`, signal, { expirationTtl: 21600 });
  }
  return jsonResponse({ ok: true, model, signal });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const { pathname } = new URL(request.url);
    const method = request.method;

    if (pathname === '/tunnels' && method === 'GET') {
      return handleTunnelsGet(env);
    }

    if (pathname === '/health' && method === 'GET') {
      return new Response('ok');
    }

    if (pathname === '/purge' && method === 'POST') {
      return handlePurge(env);
    }

    const tunnelMatch = pathname.match(/^\/tunnel\/([^/]+)$/);
    if (tunnelMatch) {
      const model = tunnelMatch[1];
      if (method === 'GET') return handleTunnelGet(env, model);
      if (method === 'PUT') return handleTunnelPut(request, env, model);
      if (method === 'DELETE') return handleTunnelDelete(request, env, model);
    }

    const signalMatch = pathname.match(/^\/signal\/([^/]+)$/);
    if (signalMatch) {
      const model = signalMatch[1];
      if (method === 'PUT') return handleSignalPut(request, env, model);
    }

    return new Response('Not found', { status: 404 });
  },
};
