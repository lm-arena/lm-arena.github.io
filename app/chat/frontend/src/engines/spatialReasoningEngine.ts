/**
 * Spatial Reasoning Benchmark Engine
 * Orchestrates multi-model responses to spatial reasoning tasks
 */

import { fetchChatStream, ChatStreamEvent } from '../utils/streaming';
import { extractSpatialAnswer } from '../utils/spatialAnswerExtraction';
import { scoreSpatialAnswer, assessReasoningDepth } from '../utils/spatialScoringEngine';
import { SpatialTask, SpatialResult } from '../types';

export interface SpatialReasoningEvent {
  type: 'task_start' | 'model_start' | 'model_chunk' | 'model_response' | 'model_error' | 'spatial_complete' | 'error';
  task?: SpatialTask;
  participants?: string[];
  model_id?: string;
  model_name?: string;
  chunk?: string;
  response?: string;
  predicted_answer?: string;
  accuracy?: number;
  reasoning_depth?: string;
  error?: string;
  results?: SpatialResult[];
}

interface SpatialReasoningParams {
  participants: string[];
  taskCategory: 'route' | 'relationship' | 'perspective';
  task: SpatialTask;
  signal: AbortSignal;
  maxTokens?: number;
  systemPrompt?: string | null;
  githubToken?: string | null;
  modelEndpoints?: Record<string, string>;
  modelKeys?: Record<string, string>;
  modelIdToName?: (id: string) => string;
}

const DEFAULT_SYSTEM_PROMPT = `You are answering a spatial reasoning question. Be accurate and clear.
- Answer directly and concisely
- Show your reasoning
- Keep to 100-200 words`;

/**
 * Run spatial reasoning benchmark on a single task with multiple models
 */
export async function* runSpatialReasoning(
  params: SpatialReasoningParams
): AsyncGenerator<SpatialReasoningEvent, void, unknown> {
  const {
    participants,
    task,
    signal,
    maxTokens = 512,
    systemPrompt,
    githubToken,
    modelEndpoints = {},
    modelKeys = {},
    modelIdToName = (id) => id,
  } = params;

  // Emit task start
  yield {
    type: 'task_start',
    task,
    participants,
  };

  const collectedResponses: Array<{
    model_id: string;
    response: string;
  }> = [];

  // Fetch responses from all models concurrently
  const messages = [
    {
      role: 'user',
      content: task.prompt,
    },
  ];

  const payload = {
    models: participants,
    messages,
    max_tokens: maxTokens,
    temperature: 0.7,
    github_token: githubToken || null,
    modelEndpoints,
    modelKeys,
  };

  let currentModel: string | null = null;
  let currentChunks: string[] = [];

  // Stream responses and collect them
  for await (const event of fetchChatStream(payload, signal)) {
    if (event.event === 'start') {
      currentModel = event.model_id;
      currentChunks = [];
      yield {
        type: 'model_start',
        model_id: event.model_id,
        model_name: modelIdToName(event.model_id),
      };
    } else if (event.event === 'token' && currentModel) {
      currentChunks.push(event.content);
      yield {
        type: 'model_chunk',
        model_id: currentModel,
        chunk: event.content,
      };
    } else if (event.event === 'done' && currentModel) {
      const fullResponse = currentChunks.join('');
      collectedResponses.push({
        model_id: currentModel,
        response: fullResponse,
      });

      yield {
        type: 'model_response',
        model_id: currentModel,
        model_name: modelIdToName(currentModel),
        response: fullResponse,
      };

      currentModel = null;
      currentChunks = [];
    } else if (event.event === 'error') {
      yield {
        type: 'model_error',
        model_id: event.model_id,
        error: event.content,
      };
    }
  }

  // Score all responses
  const results: SpatialResult[] = collectedResponses.map((resp) => {
    const predictedAnswer = extractSpatialAnswer(resp.response, task.answer_format);
    const scoreResult = scoreSpatialAnswer(predictedAnswer, task.expected_answer, task.answer_format);
    const reasoningDepth = assessReasoningDepth(resp.response);

    return {
      model_id: resp.model_id,
      response: resp.response,
      predicted_answer: predictedAnswer,
      accuracy: scoreResult.accuracy,
      reasoning_depth: reasoningDepth,
      response_time_ms: 0, // Would need to track timing separately
    };
  });

  // Emit final results
  yield {
    type: 'spatial_complete',
    results,
  };
}
