/**
 * Analyze Mode - Frontend Orchestration
 * Post-hoc analysis of multiple model responses
 */

import { splitThinkingContent } from '../utils/thinking';
import { ANALYZE_RESPONSE_SYSTEM } from '../constants';
import { streamCompletion, mergeAsyncGenerators } from '../utils/streaming';

export interface AnalyzeEvent {
  type: 'analyze_start' | 'model_start' | 'model_chunk' | 'model_response' | 'model_error' | 'analyze_complete' | 'error';
  participants?: string[];
  model_id?: string;
  model_name?: string;
  chunk?: string;
  full_response?: string;
  response?: string;
  error?: string;
  commonPhrases?: string[];
  distinctPhrases?: Record<string, string[]>;
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

// Identifies sentences containing words (>4 chars) that appear in >=50% of responses.
// This is vocabulary co-occurrence, not semantic agreement.
function findCommonPhrases(responses: Array<{ model_id: string; response: string }>): string[] {
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

  const commonPhrases: string[] = [];
  for (const point of allPoints) {
    const words = new Set(point.toLowerCase().split(/\s+/));
    const intersection = [...words].filter(w => commonWords.has(w));
    if (intersection.length > 0 && !commonPhrases.includes(point)) {
      commonPhrases.push(point);
      if (commonPhrases.length >= 3) break;
    }
  }

  return commonPhrases;
}

// Identifies sentences with low word overlap relative to other models' responses.
function findDistinctPhrases(responses: Array<{ model_id: string; response: string }>): Record<string, string[]> {
  const distinct: Record<string, string[]> = {};
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

    const modelDistinct: string[] = [];
    for (const point of points) {
      const words = new Set(point.toLowerCase().split(/\s+/));
      let isDistinct = true;

      for (const otherPoint of otherPoints) {
        const otherWords = new Set(otherPoint.toLowerCase().split(/\s+/));
        const intersection = [...words].filter(w => otherWords.has(w));
        const overlap = intersection.length / Math.max(words.size, otherWords.size);
        if (overlap > 0.5) {
          isDistinct = false;
          break;
        }
      }

      if (isDistinct) {
        modelDistinct.push(point);
        if (modelDistinct.length >= 2) break;
      }
    }

    if (modelDistinct.length > 0) {
      distinct[modelId] = modelDistinct;
    }
  }

  return distinct;
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
      if (error instanceof Error && error.name === 'AbortError') {
        yield {
          type: 'model_error' as const,
          model_id: modelId,
          model_name: modelName,
          error: 'aborted',
        };
      } else {
        yield {
          type: 'model_error' as const,
          model_id: modelId,
          model_name: modelName,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  }

  // Merge all model streams concurrently using shared utility (no polling)
  const streams = participants.map(modelId => streamModel(modelId));
  for await (const event of mergeAsyncGenerators(streams)) {
    yield event;
  }

  if (results.length === 0 && !signal.aborted) {
    yield { type: 'error', error: 'All models failed' };
    return;
  }

  const commonPhrases = findCommonPhrases(results);
  const distinctPhrases = findDistinctPhrases(results);

  yield {
    type: 'analyze_complete',
    results,
    commonPhrases,
    distinctPhrases,
    total_responses: results.length,
  };
}
