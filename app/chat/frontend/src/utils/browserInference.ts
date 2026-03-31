// In-browser inference fallback using @huggingface/transformers@3 (CDN).
// Loaded lazily — only when the corresponding server endpoint is offline.
//
// Usage pattern: server-side endpoint resolves to null → streamBrowser() takes over.
// The pipeline is cached across calls; the first invocation downloads the ONNX weights (~230 MB).

const HF_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3';

// model.id → HuggingFace Hub repo ID
export const BROWSER_MODELS: Record<string, string> = {
  'lfm2-350m': 'onnx-community/LFM2-350M-ONNX',
};

export const BROWSER_CAPABLE_MODEL_IDS = new Set(Object.keys(BROWSER_MODELS));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _mod: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _pipelines: Record<string, any> = {};
let _loadModulePromise: Promise<void> | null = null;

async function ensureModule(): Promise<void> {
  if (_mod) return;
  if (_loadModulePromise) return _loadModulePromise;
  _loadModulePromise = (import(/* @vite-ignore */ HF_CDN) as Promise<unknown>).then(mod => {
    _mod = mod;
  });
  return _loadModulePromise;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getPipeline(modelId: string): Promise<any> {
  if (_pipelines[modelId]) return _pipelines[modelId];
  await ensureModule();
  const hfId = BROWSER_MODELS[modelId];
  if (!hfId) throw new Error(`No browser model registered for '${modelId}'`);
  _pipelines[modelId] = await _mod.pipeline('text-generation', hfId, {
    dtype: 'q8',
    device: 'auto', // webgpu → wasm fallback
  });
  return _pipelines[modelId];
}

type BrowserStreamEvent =
  | { event: 'start';  model_id: string; model: string }
  | { event: 'token';  model_id: string; model: string; content: string }
  | { event: 'done';   model_id: string; model: string }
  | { event: 'error';  model_id: string; error: true;  content: string };

export async function* streamBrowser(
  modelId: string,
  messages: Array<{ role: string; content: string }>,
  signal?: AbortSignal,
): AsyncGenerator<BrowserStreamEvent> {
  yield { event: 'start', model_id: modelId, model: modelId };

  let pipe: unknown;
  try {
    pipe = await getPipeline(modelId);
  } catch (err) {
    yield {
      event: 'error',
      model_id: modelId,
      error: true,
      content: `Browser model load failed: ${err instanceof Error ? err.message : String(err)}`,
    };
    return;
  }

  if (signal?.aborted) return;

  // Bridge synchronous TextStreamer callback → async generator via a simple queue.
  type QueueItem = { text: string } | { err: string } | { done: true };
  const queue: QueueItem[] = [];
  let notify: (() => void) | null = null;
  const push = (item: QueueItem) => { queue.push(item); if (notify) { notify(); notify = null; } };
  const wait = () => new Promise<void>(r => { notify = r; });

  const streamer = new _mod.TextStreamer(
    (pipe as { tokenizer: unknown }).tokenizer,
    { skip_prompt: true, callback_function: (text: string) => push({ text }) },
  );

  (pipe as (
    msgs: typeof messages,
    opts: { max_new_tokens: number; do_sample: boolean; streamer: unknown }
  ) => Promise<void>)(messages, { max_new_tokens: 512, do_sample: false, streamer })
    .then(() => push({ done: true }))
    .catch((e: Error) => push({ err: e?.message ?? String(e) }));

  while (true) {
    if (signal?.aborted) return;
    if (queue.length === 0) await wait();
    const item = queue.shift()!;
    if ('done' in item) break;
    if ('err' in item) {
      yield { event: 'error', model_id: modelId, error: true, content: item.err };
      return;
    }
    yield { event: 'token', model_id: modelId, model: modelId, content: item.text };
  }

  yield { event: 'done', model_id: modelId, model: modelId };
}
