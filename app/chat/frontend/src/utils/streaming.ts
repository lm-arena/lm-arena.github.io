const GITHUB_MODELS_URL = 'https://models.github.ai/inference/chat/completions';

export type ChatStreamEvent = {
  event: string;
  model_id?: string;
  model?: string;
  content?: string;
  error?: boolean;
  [key: string]: unknown;
};

export interface ChatStreamPayload {
  models: string[];
  messages: Array<{ role: string; content: string }>;
  max_tokens: number;
  temperature: number;
  github_token?: string | null;
  modelEndpoints?: Record<string, string>;
  modelKeys?: Record<string, string>;
}

async function* streamModel(
  model: string,
  payload: Omit<ChatStreamPayload, 'models'>,
  signal?: AbortSignal,
): AsyncGenerator<ChatStreamEvent> {
  const endpoint = payload.modelEndpoints?.[model];
  const url = endpoint ? `${endpoint}/chat/completions` : GITHUB_MODELS_URL;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (payload.github_token && (!endpoint || endpoint.includes('github.ai'))) {
    headers['Authorization'] = `Bearer ${payload.github_token}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: payload.modelKeys?.[model] ?? model,
      messages: payload.messages,
      max_tokens: payload.max_tokens,
      temperature: payload.temperature,
      stream: true,
    }),
    signal,
  });

  // Emit routing metadata when the gateway performed auto-routing
  const routedTo = response.headers.get('X-Routed-Model');
  const routeCategory = response.headers.get('X-Route-Category');
  const routeClassifier = response.headers.get('X-Route-Classifier');
  if (routedTo) {
    yield { event: 'routing', model_id: model, routed_to: routedTo, category: routeCategory ?? 'general', classifier: routeClassifier ?? null };
  }

  if (!response.ok) {
    let msg = response.statusText;
    try {
      msg = (await response.json()).error?.message || msg;
    } catch {}
    yield { event: 'error', model_id: model, error: true, content: msg };
    return;
  }

  yield { event: 'start', model_id: model, model };

  if (!response.body) {
    yield { event: 'error', model_id: model, error: true, content: 'No response body' };
    return;
  }

  for await (const ev of readSseStream(response.body)) {
    if (ev.type === 'chunk') {
      yield { event: 'token', model_id: model, model, content: ev.content };
    } else if (ev.type === 'error') {
      yield { event: 'error', model_id: model, error: true, content: ev.error };
      return;
    }
    // 'done' from readSseStream just signals end-of-stream; fall through
  }

  yield { event: 'done', model_id: model, model };
}

export async function* mergeAsyncGenerators<T>(
  generators: AsyncGenerator<T>[],
): AsyncGenerator<T> {
  type Entry = {
    gen: AsyncGenerator<T>;
    idx: number;
    next: Promise<{ result: IteratorResult<T>; idx: number }>;
  };

  const active: Entry[] = generators.map((gen, idx) => ({
    gen,
    idx,
    next: gen.next().then(result => ({ result, idx })),
  }));

  while (active.length > 0) {
    const { result, idx } = await Promise.race(active.map(e => e.next));
    const entryIdx = active.findIndex(e => e.idx === idx);

    if (result.done) {
      active.splice(entryIdx, 1);
    } else {
      yield result.value;
      active[entryIdx].next = active[entryIdx].gen.next().then(result => ({ result, idx }));
    }
  }
}

export function fetchChatStream(
  payload: ChatStreamPayload,
  signal?: AbortSignal,
): AsyncGenerator<ChatStreamEvent> {
  const { models, ...rest } = payload;

  if (models.length === 1) {
    return streamModel(models[0], rest, signal);
  }

  return mergeAsyncGenerators(
    models.map(model => streamModel(model, rest, signal)),
  );
}


export type SseDeltaEvent =
  | { type: 'chunk'; content: string }
  | { type: 'done' }
  | { type: 'error'; error: string };

export interface CompletionPayload {
  model: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens: number;
  temperature: number;
  stream: true;
}

/**
 * Fetches a streaming chat completion from `url`, checks response.ok,
 * then pipes the body through readSseStream. Silently swallows AbortError;
 * yields an error event for all other failures.
 */
export async function* streamCompletion(
  url: string,
  payload: CompletionPayload,
  githubToken: string | null,
  signal?: AbortSignal,
): AsyncGenerator<SseDeltaEvent> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (githubToken) {
    headers['Authorization'] = `Bearer ${githubToken}`;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      yield { type: 'error', error: `HTTP ${response.status}` };
      return;
    }

    yield* readSseStream(response.body!);
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      return;
    }
    yield { type: 'error', error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Reads a streaming OpenAI-compatible SSE response body and yields typed
 * delta events. The caller is responsible for the fetch() call and for
 * checking response.ok before passing the body here.
 */
export async function* readSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SseDeltaEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') {
          yield { type: 'done' };
          return;
        }

        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            yield { type: 'error', error: String(parsed.error) };
            return;
          }
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            yield { type: 'chunk', content };
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
