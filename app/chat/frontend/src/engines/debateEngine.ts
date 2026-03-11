/**
 * Debate Mode - Frontend Orchestration
 * Sequential turn-based discussion between models
 */

import { splitThinkingContent } from '../utils/thinking';
import { DEBATE_TURN_SYSTEM } from '../constants';
import { streamCompletion } from '../utils/streaming';

export interface DebateTurn {
  turn_number: number;
  round_number: number;
  model_id: string;
  model_name: string;
  response: string;
  response_time_ms: number;
  timestamp: string;
}

export interface DebateEvent {
  type: 'debate_start' | 'round_start' | 'turn_start' | 'turn_chunk' | 'turn_complete' | 'turn_error' | 'round_complete' | 'debate_complete' | 'error';
  participants?: string[];
  rounds?: number;
  round_number?: number;
  total_rounds?: number;
  turn_number?: number;
  model_id?: string;
  model_name?: string;
  chunk?: string;
  response?: string;
  response_time_ms?: number;
  turns_in_round?: number;
  total_turns?: number;
  participating_models?: string[];
  total_time_ms?: number;
  error?: string;
  error_type?: string;
}

interface DebateParams {
  query: string;
  participants: string[];
  rounds: number;
  maxTokens: number;
  temperature: number;
  systemPrompt: string | null;
  githubToken: string | null;
  signal: AbortSignal;
  modelEndpoints: Record<string, string>;
  modelKeys?: Record<string, string>;
  modelIdToName: (id: string) => string;
}

function buildTurnPrompt(
  query: string,
  modelId: string,
  previousTurns: DebateTurn[],
  participantIds: string[],
  modelIdToName: (id: string) => string
): string {
  const myName = modelIdToName(modelId);

  const otherNames = participantIds
    .filter(pid => pid !== modelId)
    .map(pid => modelIdToName(pid));
  const othersList = otherNames.length > 0 ? otherNames.join(', ') : 'others';

  if (previousTurns.length === 0) {
    return `You are ${myName}, participating in a discussion with ${othersList}.

User Query:
${query}

Provide your response to the query. Be concise and clear.`;
  } else {
    const previousContext = previousTurns
      .map(turn => `**${turn.model_name}**:\n${turn.response}`)
      .join('\n\n');

    return `You are ${myName}, participating in a discussion with ${othersList}.

Original User Query:
${query}

Discussion so far:
${previousContext}

Now it's your turn. You can:
- Build on previous responses
- Offer a different perspective
- Point out what others missed
- Synthesize the discussion

Provide your response:`;
  }
}


interface ExecuteTurnParams {
  query: string;
  modelId: string;
  turnNumber: number;
  roundNumber: number;
  previousTurns: DebateTurn[];
  participantIds: string[];
  maxTokens: number;
  temperature: number;
  systemPrompt: string | null;
  githubToken: string | null;
  signal: AbortSignal;
  modelEndpoints: Record<string, string>;
  modelIdToName: (id: string) => string;
  modelKeys?: Record<string, string>;
}

async function* executeTurn(params: ExecuteTurnParams): AsyncGenerator<DebateEvent> {
  const {
    query,
    modelId,
    turnNumber,
    roundNumber,
    previousTurns,
    participantIds,
    maxTokens,
    temperature,
    systemPrompt,
    githubToken,
    signal,
    modelEndpoints,
    modelIdToName,
    modelKeys,
  } = params;
  const modelName = modelIdToName(modelId);
  const modelUrl = modelEndpoints[modelId];

  if (!modelUrl) {
    yield {
      type: 'turn_error',
      model_id: modelId,
      error: 'Model endpoint not configured',
    };
    return;
  }

  const prompt = buildTurnPrompt(query, modelId, previousTurns, participantIds, modelIdToName);

  yield {
    type: 'turn_start',
    turn_number: turnNumber,
    round_number: roundNumber,
    model_id: modelId,
    model_name: modelName,
  };

  let fullResponse = '';
  const startTime = Date.now();

  try {
    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'system', content: DEBATE_TURN_SYSTEM });
    messages.push({ role: 'user', content: prompt });

    for await (const event of streamCompletion(`${modelUrl}/chat/completions`, { model: modelKeys?.[modelId] ?? modelId, messages, max_tokens: maxTokens, temperature, stream: true }, githubToken, signal)) {
      if (event.type === 'chunk') {
        fullResponse += event.content;
        yield {
          type: 'turn_chunk',
          model_id: modelId,
          chunk: event.content,
        };
      } else if (event.type === 'error') {
        yield {
          type: 'turn_error',
          model_id: modelId,
          error: event.error || 'Unknown error',
        };
        return;
      } else if (event.type === 'done') {
        const responseTimeMs = Date.now() - startTime;
        const { answer } = splitThinkingContent(fullResponse);
        const cleanResponse = answer || fullResponse;

        yield {
          type: 'turn_complete',
          turn_number: turnNumber,
          round_number: roundNumber,
          model_id: modelId,
          model_name: modelName,
          response: cleanResponse,
          response_time_ms: responseTimeMs,
        };
      }
    }
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      yield {
        type: 'turn_error',
        model_id: modelId,
        error: 'aborted',
      };
    } else {
      yield {
        type: 'turn_error',
        model_id: modelId,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

export async function* runDebate(params: DebateParams): AsyncGenerator<DebateEvent> {
  const {
    query,
    participants,
    rounds,
    maxTokens,
    temperature,
    systemPrompt,
    githubToken,
    signal,
    modelEndpoints,
    modelKeys,
    modelIdToName,
  } = params;

  try {
    if (!participants.length) {
      yield { type: 'error', error: 'No participants selected' };
      return;
    }

    yield {
      type: 'debate_start',
      participants,
      rounds,
    };

    const completedTurns: DebateTurn[] = [];
    let turnCounter = 0;

    for (let roundNum = 0; roundNum < rounds; roundNum++) {
      yield {
        type: 'round_start',
        round_number: roundNum,
        total_rounds: rounds,
      };

      for (const modelId of participants) {
        for await (const event of executeTurn({
          query,
          modelId,
          turnNumber: turnCounter,
          roundNumber: roundNum,
          previousTurns: completedTurns,
          participantIds: participants,
          maxTokens,
          temperature,
          systemPrompt,
          githubToken,
          signal,
          modelEndpoints,
          modelIdToName,
          modelKeys,
        })) {
          yield event;

          if (event.type === 'turn_complete') {
            completedTurns.push({
              turn_number: turnCounter,
              round_number: roundNum,
              model_id: event.model_id!,
              model_name: event.model_name!,
              response: event.response!,
              response_time_ms: event.response_time_ms!,
              timestamp: new Date().toISOString(),
            });
            turnCounter++;
          }
        }
      }

      yield {
        type: 'round_complete',
        round_number: roundNum,
        turns_in_round: participants.length,
      };
    }

    yield {
      type: 'debate_complete',
      total_turns: completedTurns.length,
      total_rounds: rounds,
      participating_models: participants,
      total_time_ms: completedTurns.reduce((sum, t) => sum + t.response_time_ms, 0),
    };
  } catch (error: unknown) {
    yield {
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      error_type: error instanceof Error ? error.constructor.name : 'UnknownError',
    };
  }
}
