/**
 * Streaming utilities for all modes
 * Calls GitHub Models API directly from the browser (CORS supported)
 */

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
      model,
      messages: payload.messages,
      max_tokens: payload.max_tokens,
      temperature: payload.temperature,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    let msg = response.statusText;
    try {
      msg = (await response.json()).error?.message || msg;
    } catch {}
    yield { event: 'error', model_id: model, error: true, content: msg };
    return;
  }

  yield { event: 'start', model_id: model, model };

  const reader = response.body?.getReader();
  if (!reader) {
    yield { event: 'error', model_id: model, error: true, content: 'No response body' };
    return;
  }

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
        const data = line.slice(6).trim();
        if (!data || data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            yield { event: 'token', model_id: model, model, content };
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield { event: 'done', model_id: model, model };
}

async function* mergeStreams(
  generators: AsyncGenerator<ChatStreamEvent>[],
): AsyncGenerator<ChatStreamEvent> {
  type Entry = {
    gen: AsyncGenerator<ChatStreamEvent>;
    idx: number;
    next: Promise<{ result: IteratorResult<ChatStreamEvent>; idx: number }>;
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

  return mergeStreams(
    models.map(model => streamModel(model, rest, signal)),
  );
}

export async function streamSseEvents(
  eventStream: AsyncGenerator<ChatStreamEvent>,
  onEvent: (data: ChatStreamEvent) => void,
): Promise<void> {
  for await (const event of eventStream) {
    onEvent(event);
  }
}
