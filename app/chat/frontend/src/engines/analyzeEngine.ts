/**
 * Analyze Mode - Frontend Orchestration
 * Post-hoc analysis of multiple model responses
 */

import { splitThinkingContent } from '../utils/thinking';
import { ANALYZE_RESPONSE_SYSTEM } from '../constants';
import { streamCompletion } from '../utils/streaming';

export interface AnalyzeEvent {
  type: 'analyze_start' | 'model_start' | 'model_chunk' | 'model_response' | 'model_error' | 'analysis_complete' | 'analyze_complete' | 'error';
  participants?: string[];
  model_id?: string;
  model_name?: string;
  chunk?: string;
  full_response?: string;
  response?: string;
  error?: string;
  consensus?: string[];
  unique_contributions?: Record<string, string[]>;
  total_responses?: number;
  results?: Array<{ model_id: string; model_name: string; response: string }>;
}

interface AnalyzeParams {
  query: string;
  participants: string[];
  maxTokens: number;
  systemPrompt: string | null;
  githubToken: string | null;
  signal: AbortSignal;
  modelEndpoints: Record<string, string>;
  modelKeys?: Record<string, string>;
  modelIdToName: (id: string) => string;
}

function extractKeyPoints(response: string): string[] {
  const sentences = response
    .replace(/\n/g, ' ')
    .split('.')
    .map(s => s.trim())
    .filter(s => s.length > 20);
  return sentences.slice(0, 5);
}

function findConsensus(responses: Array<{ model_id: string; response: string }>): string[] {
  if (responses.length < 2) return [];

  const allPoints: string[] = [];
  for (const resp of responses) {
    const points = extractKeyPoints(resp.response);
    allPoints.push(...points);
  }

  const wordCounts: Record<string, number> = {};
  for (const point of allPoints) {
    const words = point.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.length > 4) {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      }
    }
  }

  const threshold = responses.length / 2;
  const commonWords = new Set(
    Object.entries(wordCounts)
      .filter(([_, count]) => count >= threshold)
      .map(([word]) => word)
  );

  const consensus: string[] = [];
  for (const point of allPoints) {
    const words = new Set(point.toLowerCase().split(/\s+/));
    const intersection = [...words].filter(w => commonWords.has(w));
    if (intersection.length > 0 && !consensus.includes(point)) {
      consensus.push(point);
      if (consensus.length >= 3) break;
    }
  }

  return consensus;
}

function findUniqueContributions(responses: Array<{ model_id: string; response: string }>): Record<string, string[]> {
  const unique: Record<string, string[]> = {};
  const allPointsByModel: Record<string, string[]> = {};

  for (const resp of responses) {
    allPointsByModel[resp.model_id] = extractKeyPoints(resp.response);
  }

  for (const [modelId, points] of Object.entries(allPointsByModel)) {
    const otherPoints: string[] = [];
    for (const [otherId, otherPts] of Object.entries(allPointsByModel)) {
      if (otherId !== modelId) {
        otherPoints.push(...otherPts);
      }
    }

    const modelUnique: string[] = [];
    for (const point of points) {
      const words = new Set(point.toLowerCase().split(/\s+/));
      let isUnique = true;

      for (const otherPoint of otherPoints) {
        const otherWords = new Set(otherPoint.toLowerCase().split(/\s+/));
        const intersection = [...words].filter(w => otherWords.has(w));
        const overlap = intersection.length / Math.max(words.size, otherWords.size);
        if (overlap > 0.5) {
          isUnique = false;
          break;
        }
      }

      if (isUnique) {
        modelUnique.push(point);
        if (modelUnique.length >= 2) break;
      }
    }

    if (modelUnique.length > 0) {
      unique[modelId] = modelUnique;
    }
  }

  return unique;
}


export async function* runAnalyze(params: AnalyzeParams): AsyncGenerator<AnalyzeEvent> {
  const { query, participants, maxTokens, systemPrompt, githubToken, signal, modelEndpoints, modelKeys, modelIdToName } = params;

  if (!participants.length) {
    yield { type: 'error', error: 'No participants selected' };
    return;
  }

  yield { type: 'analyze_start', participants };

  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'system', content: ANALYZE_RESPONSE_SYSTEM });
  messages.push({ role: 'user', content: query });

  const modelResponses: Record<string, string> = {};
  const results: Array<{ model_id: string; model_name: string; response: string }> = [];

  async function* streamModel(modelId: string) {
    const modelName = modelIdToName(modelId);
    const modelUrl = modelEndpoints[modelId];

    if (!modelUrl) {
      yield {
        type: 'model_error' as const,
        model_id: modelId,
        model_name: modelName,
        error: 'Model endpoint not configured',
      };
      return;
    }

    yield {
      type: 'model_start' as const,
      model_id: modelId,
      model_name: modelName,
    };

    let fullResponse = '';

    try {
      for await (const event of streamCompletion(`${modelUrl}/chat/completions`, { model: modelKeys?.[modelId] ?? modelId, messages, max_tokens: maxTokens, temperature: 0.7, stream: true }, githubToken, signal)) {
        if (event.type === 'chunk') {
          fullResponse += event.content;
          modelResponses[modelId] = fullResponse;
          yield {
            type: 'model_chunk' as const,
            model_id: modelId,
            model_name: modelName,
            chunk: event.content,
            full_response: fullResponse,
          };
        } else if (event.type === 'error') {
          yield {
            type: 'model_error' as const,
            model_id: modelId,
            model_name: modelName,
            error: event.error || 'Unknown error',
          };
          return;
        } else if (event.type === 'done') {
          const { answer } = splitThinkingContent(fullResponse);
          const finalResponse = answer || fullResponse;
          modelResponses[modelId] = finalResponse;
          results.push({ model_id: modelId, model_name: modelName, response: finalResponse });
          yield {
            type: 'model_response' as const,
            model_id: modelId,
            model_name: modelName,
            response: finalResponse,
          };
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== 'AbortError') {
        yield {
          type: 'model_error' as const,
          model_id: modelId,
          model_name: modelName,
          error: error.message,
        };
      }
    }
  }

  const streams = participants.map(modelId => streamModel(modelId));
  const queues: Array<{ queue: Array<AnalyzeEvent | null>; done: boolean }> = streams.map(() => ({
    queue: [],
    done: false,
  }));

  const tasks = streams.map(async (stream, index) => {
    try {
      for await (const event of stream) {
        queues[index].queue.push(event);
      }
    } finally {
      queues[index].queue.push(null);
      queues[index].done = true;
    }
  });

  Promise.all(tasks).catch(() => {});

  let activeStreams = queues.length;
  while (activeStreams > 0) {
    let yielded = false;

    for (const queueData of queues) {
      if (queueData.queue.length > 0) {
        const event = queueData.queue.shift()!;
        if (event === null) {
          activeStreams--;
        } else {
          yield event;
          yielded = true;
        }
      }
    }

    if (!yielded && activeStreams > 0) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  if (results.length === 0) {
    yield { type: 'error', error: 'All models failed' };
    return;
  }

  const consensus = findConsensus(results);
  const uniqueContributions = findUniqueContributions(results);

  yield {
    type: 'analysis_complete',
    consensus,
    unique_contributions: uniqueContributions,
    total_responses: results.length,
  };

  yield {
    type: 'analyze_complete',
    results,
    consensus,
    unique_contributions: uniqueContributions,
  };
}
