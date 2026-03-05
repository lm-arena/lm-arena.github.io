const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS, POST',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Expose-Headers': 'X-Routed-Model, X-Route-Category, X-Route-Classifier',
};

// Category → preferred models (in priority order)
const ROUTE_MAP = {
  reasoning:       ['nanbeige', 'dasd', 'phireasoning', 'lfm2thinking', 'r1qwen', 'falcon'],
  general:         ['qwen', 'lfm2', 'gemma3n', 'lfm2mini', 'gemma', 'phi', 'llama'],
  function_calling:['smollm3', 'agentcpm', 'rnj', 'functiongemma', 'gptoss'],
  coding:          ['jancode'],
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

// Validate a GitHub token by checking push access to this repo
async function isGitHubAdmin(token) {
  try {
    const res = await fetch('https://api.github.com/repos/jonasneves/lm-arena', {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'lm-arena-worker' },
    });
    if (!res.ok) return false;
    const data = await res.json();
    return !!(data.permissions?.push || data.permissions?.admin);
  } catch {
    return false;
  }
}

// Supports both legacy plain-URL strings and new JSON format { url, runner_account }
function parseTunnelValue(raw) {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    return { url: obj.url, runner_account: obj.runner_account || null };
  } catch {
    return { url: raw, runner_account: null };
  }
}

async function handleTunnelsGet(env) {
  const list = await env.TUNNELS_KV.list({ prefix: 'tunnel:' });
  const tunnels = {};
  await Promise.all(list.keys.map(async ({ name }) => {
    const model = name.slice('tunnel:'.length);
    const raw = await env.TUNNELS_KV.get(name);
    tunnels[model] = parseTunnelValue(raw);
  }));
  return jsonResponse(tunnels);
}

async function handleTunnelGet(env, model) {
  const [raw, signal] = await Promise.all([
    env.TUNNELS_KV.get(`tunnel:${model}`),
    env.TUNNELS_KV.get(`signal:${model}`),
  ]);
  if (!raw) return jsonResponse({ error: 'not found' }, 404);
  const parsed = parseTunnelValue(raw);
  return jsonResponse({ url: parsed.url, runner_account: parsed.runner_account, signal: signal || null });
}

async function handleTunnelPut(request, env, model) {
  if (!isAuthorized(request, env)) return jsonResponse({ error: 'unauthorized' }, 401);
  const { url, runner_account } = await request.json();
  if (!url?.startsWith('https://')) return jsonResponse({ error: 'invalid url' }, 400);
  const value = JSON.stringify({ url, runner_account: runner_account || null });
  // Fresh registration clears any pending signal
  await Promise.all([
    env.TUNNELS_KV.put(`tunnel:${model}`, value, { expirationTtl: 21600 }),
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
    const raw = await env.TUNNELS_KV.get(name);
    const parsed = parseTunnelValue(raw);
    if (!parsed?.url) return;
    try {
      const res = await fetch(`${parsed.url}/health`, { signal: AbortSignal.timeout(5000) });
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
  const auth = request.headers.get('Authorization') || '';
  const isWriteKey = auth === `Bearer ${env.TUNNEL_WRITE_KEY}`;
  if (!isWriteKey) {
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token || !(await isGitHubAdmin(token))) return jsonResponse({ error: 'unauthorized' }, 401);
  }
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

// ── Feature 1: OpenAI-compatible API Gateway ────────────────────────────────

async function handleModelsGet(env) {
  const list = await env.TUNNELS_KV.list({ prefix: 'tunnel:' });
  const created = Math.floor(Date.now() / 1000);
  const data = list.keys.map(({ name }) => ({
    id: name.slice('tunnel:'.length),
    object: 'model',
    created,
    owned_by: 'lm-arena',
  }));
  return jsonResponse({ object: 'list', data });
}

// ── Feature 2: Capability routing ───────────────────────────────────────────

// Returns { model_key: url } for all online models
async function getAvailableModels(env) {
  const list = await env.TUNNELS_KV.list({ prefix: 'tunnel:' });
  const entries = await Promise.all(list.keys.map(async ({ name }) => {
    const model = name.slice('tunnel:'.length);
    const raw = await env.TUNNELS_KV.get(name);
    const parsed = parseTunnelValue(raw);
    return parsed?.url ? [model, parsed.url] : null;
  }));
  return Object.fromEntries(entries.filter(Boolean));
}

async function routeAuto(env, body) {
  const available = await getAvailableModels(env);
  const modelKeys = Object.keys(available);
  if (modelKeys.length === 0) return null;

  const fallbackKey = modelKeys[0];
  const fallbackUrl = available[fallbackKey];
  const classifierUrl = available['functiongemma'];

  if (classifierUrl) {
    const firstUserMsg = body.messages?.find(m => m.role === 'user')?.content || '';
    try {
      const classRes = await fetch(`${classifierUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'functiongemma-270m-it',
          messages: [
            {
              role: 'system',
              content: 'Classify this user message into one category. Respond with JSON only: {"category": "coding"|"reasoning"|"function_calling"|"general"}',
            },
            { role: 'user', content: firstUserMsg },
          ],
          max_tokens: 32,
          stream: false,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (classRes.ok) {
        const classData = await classRes.json();
        const text = classData.choices?.[0]?.message?.content || '';
        const jsonMatch = text.match(/\{[^}]+\}/);
        if (jsonMatch) {
          const { category } = JSON.parse(jsonMatch[0]);
          const candidates = ROUTE_MAP[category] || ROUTE_MAP.general;
          for (const candidate of candidates) {
            if (available[candidate]) {
              return { url: available[candidate], modelKey: candidate, category, classifier: 'functiongemma' };
            }
          }
        }
      }
    } catch {}
  }

  return { url: fallbackUrl, modelKey: fallbackKey, category: 'general' };
}

async function handleChatCompletions(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: { message: 'Invalid JSON', type: 'invalid_request_error' } }, 400);
  }

  const { model, stream } = body;
  let targetUrl;
  let routingHeaders = {};

  if (model === 'auto') {
    const routed = await routeAuto(env, body);
    if (!routed) {
      return jsonResponse(
        { error: { message: 'No models available', type: 'service_unavailable' } },
        503,
      );
    }
    targetUrl = routed.url;
    routingHeaders = {
      'X-Routed-Model': routed.modelKey,
      'X-Route-Category': routed.category,
      ...(routed.classifier ? { 'X-Route-Classifier': routed.classifier } : {}),
    };
  } else {
    const raw = await env.TUNNELS_KV.get(`tunnel:${model}`);
    const parsed = parseTunnelValue(raw);
    if (!parsed?.url) {
      return jsonResponse(
        { error: { message: `Model '${model}' is not currently available. Check /v1/models for online models.`, type: 'service_unavailable' } },
        503,
      );
    }
    targetUrl = parsed.url;
  }

  const upstream = await fetch(`${targetUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (stream) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        ...routingHeaders,
      },
    });
  }

  const data = await upstream.json();
  return new Response(JSON.stringify(data), {
    status: upstream.status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', ...routingHeaders },
  });
}

// ── Feature 3: Benchmarks ────────────────────────────────────────────────────

async function handleBenchmarksGet(env) {
  const list = await env.TUNNELS_KV.list({ prefix: 'benchmark:' });
  const results = {};
  await Promise.all(list.keys.map(async ({ name }) => {
    const model = name.slice('benchmark:'.length);
    const raw = await env.TUNNELS_KV.get(name);
    try { results[model] = JSON.parse(raw); } catch { results[model] = raw; }
  }));
  return jsonResponse(results);
}

async function handleBenchmarkPut(request, env, model) {
  if (!isAuthorized(request, env)) return jsonResponse({ error: 'unauthorized' }, 401);
  const body = await request.text();
  await env.TUNNELS_KV.put(`benchmark:${model}`, body);
  return jsonResponse({ ok: true, model });
}

// ── Router ───────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const { pathname } = new URL(request.url);
    const method = request.method;

    if (pathname === '/tunnels' && method === 'GET') return handleTunnelsGet(env);
    if (pathname === '/health' && method === 'GET') return new Response('ok');
    if (pathname === '/purge' && method === 'POST') return handlePurge(env);

    // Feature 1: OpenAI-compatible API
    if (pathname === '/v1/models' && method === 'GET') return handleModelsGet(env);
    if (pathname === '/v1/chat/completions' && method === 'POST') return handleChatCompletions(request, env);

    // Feature 3: Benchmarks
    if (pathname === '/benchmarks' && method === 'GET') return handleBenchmarksGet(env);

    const benchmarkMatch = pathname.match(/^\/benchmark\/([^/]+)$/);
    if (benchmarkMatch && method === 'PUT') return handleBenchmarkPut(request, env, benchmarkMatch[1]);

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
