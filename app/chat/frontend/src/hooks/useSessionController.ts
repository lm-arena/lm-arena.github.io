import { Dispatch, SetStateAction } from 'react';
import { GENERATION_DEFAULTS, isThinkingModel } from '../constants';
import { fetchChatStream } from '../utils/streaming';
import { ChatHistoryEntry, Mode, Model } from '../types';
import { ExecutionTimeData } from '../components/ExecutionTimeDisplay';
import { parseThinkingChunk, ThinkingState } from '../utils/thinkingParser';
import { runAnalyze } from '../engines/analyzeEngine';
import { runDebate } from '../engines/debateEngine';

// Sentinel prefix that cannot appear in normal text or model output (null bytes).
// renderSvgContent in ArenaCanvas checks for this exact prefix before calling
// dangerouslySetInnerHTML, so only strings produced here are rendered as HTML.
const SVG_SENTINEL_PREFIX = '\x00SVG\x00';
const SVG_SENTINEL_SUFFIX = '\x00END\x00';

const ICON_CLOCK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="display: inline-block; vertical-align: text-bottom; margin-right: 6px;"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ICON_WARNING_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="display: inline-block; vertical-align: text-bottom; margin-right: 6px;"><path d="M12 2L2 20h20L12 2z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/><path d="M12 9v4M12 17h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

const wrapSvgIcon = (svgContent: string, message: string): string =>
  `${SVG_SENTINEL_PREFIX}${svgContent}${SVG_SENTINEL_SUFFIX}${message}`;

export { SVG_SENTINEL_PREFIX, SVG_SENTINEL_SUFFIX };

const escapeHtml = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

type DiscussionTurn = {
  turn_number: number;
  response: string;
  evaluation?: unknown;
};

interface SessionControllerParams {
  // — mode & session config —
  mode: Mode;
  moderator: string;
  selected: string[];
  selectedCardIds: Set<string>;
  systemPrompt?: string;
  isGenerating: boolean;

  // — model data & lookups —
  modelsData: Model[];
  modelIdToName: (id: string) => string;
  modelKeyMap: Record<string, string>;
  getModelEndpoints: (models: Model[]) => Record<string, string>;
  setModelsData: React.Dispatch<React.SetStateAction<Model[]>>;

  // — auth —
  githubToken?: string;

  // — state setters —
  setLastQuery: (text: string) => void;
  setHoveredCard: (value: string | null) => void;
  setPhaseLabel: Dispatch<SetStateAction<string | null>>;
  setModeratorSynthesis: Dispatch<SetStateAction<string>>;
  setDiscussionTurnsByModel: Dispatch<SetStateAction<Record<string, DiscussionTurn[]>>>;
  setIsGenerating: (value: boolean) => void;
  setIsSynthesizing: (value: boolean) => void;
  setSpeaking: React.Dispatch<React.SetStateAction<Set<string>>>;
  setExecutionTimes: React.Dispatch<React.SetStateAction<Record<string, ExecutionTimeData>>>;

  // — failed model tracking —
  resetFailedModels: () => void;
  markModelFailed: (modelId: string) => void;

  // — refs —
  failedModelsRef: React.MutableRefObject<Set<string>>;
  currentDiscussionTurnRef: React.MutableRefObject<{ modelId: string; turnNumber: number } | null>;
  sessionModelIdsRef: React.MutableRefObject<string[]>;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  thinkingStateRef: React.MutableRefObject<Record<string, { inThink: boolean; carry: string; implicitThinking?: boolean }>>;
  conversationHistoryRef: React.MutableRefObject<ChatHistoryEntry[]>;

  // — history utilities —
  pushHistoryEntries: (entries: ChatHistoryEntry[]) => void;
  historyToText: (history: ChatHistoryEntry[]) => string;
  buildCarryoverHistory: (history: ChatHistoryEntry[], targetMode: Mode) => ChatHistoryEntry[];
  summarizeSessionResponses: (responses: Record<string, string>, order: string[]) => string | null;

  // — stream utilities —
  enqueueStreamDelta: (modelId: string, answerAdd: string, thinkingAdd: string) => void;
  clearPendingStreamForModel: (modelId: string) => void;
  resetPendingStream: () => void;
}

interface SendMessageOptions {
  skipHistory?: boolean;
}

export function useSessionController(params: SessionControllerParams) {
  const {
    mode,
    moderator,
    selected,
    selectedCardIds,
    githubToken,
    isGenerating,
    systemPrompt,
    summarizeSessionResponses,
    setLastQuery,
    setHoveredCard,
    setPhaseLabel,
    setModeratorSynthesis,
    setDiscussionTurnsByModel,
    resetFailedModels,
    markModelFailed,
    failedModelsRef,
    currentDiscussionTurnRef,
    sessionModelIdsRef,
    abortControllerRef,
    thinkingStateRef,
    conversationHistoryRef,
    pushHistoryEntries,
    historyToText,
    buildCarryoverHistory,
    setModelsData,
    modelIdToName,
    setExecutionTimes,
    setIsGenerating,
    setIsSynthesizing,
    setSpeaking,
    enqueueStreamDelta,
    clearPendingStreamForModel,
    resetPendingStream,
    getModelEndpoints,
    modelKeyMap,
    modelsData,
  } = params;

  const sendMessage = async (
    text: string,
    previousResponses?: Record<string, string> | null,
    participantsOverride?: string[],
    options?: SendMessageOptions,
  ) => {
    if (!text.trim() || (selected.length === 0 && !participantsOverride)) return;
    if (!participantsOverride && isGenerating) return;

    const skipHistory = options?.skipHistory ?? false;
    const userEntry: ChatHistoryEntry = { role: 'user', content: text };
    const baseHistory = skipHistory
      ? conversationHistoryRef.current
      : [...conversationHistoryRef.current, userEntry];

    if (!skipHistory) {
      pushHistoryEntries([userEntry]);
    }

    const carryoverHistory = buildCarryoverHistory(baseHistory, mode);
    const historyContext = historyToText(carryoverHistory);

    setLastQuery(text);
    const contextualQuery = historyContext
      ? `${historyContext}\n\nContinue the conversation above and respond to the latest user request.`
      : text;

    let sessionModelIds: string[];
    if (participantsOverride) {
      sessionModelIds = participantsOverride;
    } else {
      const selectionOverride = Array.from(selectedCardIds).filter(id =>
        selected.includes(id) && (mode === 'compare' || id !== moderator),
      );
      sessionModelIds = selectionOverride.length > 0 ? selectionOverride : selected.slice();
    }
    sessionModelIdsRef.current = sessionModelIds;

    const sessionResponses: Record<string, string> = {};
    const recordResponse = (modelId: string, content: string, opts?: { replace?: boolean; label?: string }) => {
      if (!content) return;
      const addition = opts?.label ? `${opts.label}: ${content}` : content;
      sessionResponses[modelId] = opts?.replace
        ? addition
        : (sessionResponses[modelId]
          ? `${sessionResponses[modelId]}\n\n${addition}`
          : addition);
    };

    const currentController = new AbortController();
    abortControllerRef.current = currentController;
    setIsGenerating(true);
    setIsSynthesizing(false);
    setHoveredCard(null);
    setPhaseLabel(null);
    setModeratorSynthesis('');
    setDiscussionTurnsByModel({});
    resetFailedModels();
    currentDiscussionTurnRef.current = null;

    resetPendingStream();

    setModelsData(prev => prev.map(model => {
      if (sessionModelIds.includes(model.id) || model.id === moderator) {
        if (previousResponses && previousResponses[model.id]) {
          return { ...model, response: previousResponses[model.id], thinking: undefined, error: undefined };
        }
        return { ...model, response: '', thinking: undefined, error: undefined };
      }
      return model;
    }));

    setExecutionTimes(prev => {
      const next = { ...prev };
      const startTime = performance.now();
      sessionModelIds.forEach(id => {
        next[id] = { startTime };
      });
      if (moderator && !next[moderator]) {
        next[moderator] = { startTime };
      }
      return next;
    });

    const thinkingResetIds = new Set(sessionModelIds);
    if (moderator) thinkingResetIds.add(moderator);
    thinkingResetIds.forEach(modelId => {
      const startsInThinkingMode = isThinkingModel(modelId, modelsData);
      thinkingStateRef.current[modelId] = {
        inThink: startsInThinkingMode,
        carry: '',
        implicitThinking: startsInThinkingMode,
      };
    });

    const firstTokenReceived = new Set<string>();

    const appendEventHistory = (content: string, kind: ChatHistoryEntry['kind']) => {
      const trimmed = content?.trim();
      if (!trimmed || skipHistory) return;
      pushHistoryEntries([{ role: 'assistant', content: trimmed, kind }]);
    };

    const applyThinkingChunk = (modelId: string, rawChunk: string) => {
      const currentState: ThinkingState = thinkingStateRef.current[modelId] || {
        inThink: false,
        carry: '',
        implicitThinking: false,
      };

      const { answerAdd, thinkingAdd, newState } = parseThinkingChunk(rawChunk, currentState);
      thinkingStateRef.current[modelId] = newState;

      if (answerAdd) {
        recordResponse(modelId, answerAdd);
      }

      if (thinkingAdd || answerAdd) {
        enqueueStreamDelta(modelId, answerAdd, thinkingAdd);
      }
    };

    const addIconToMessage = (message: string): string => {
      const lowerMsg = message.toLowerCase();
      if (lowerMsg.includes('rate limit') || lowerMsg.includes('waiting')) {
        return wrapSvgIcon(ICON_CLOCK_SVG, escapeHtml(message));
      }
      if (lowerMsg.includes('error') || lowerMsg.includes('failed')) {
        return wrapSvgIcon(ICON_WARNING_SVG, escapeHtml(message));
      }
      return escapeHtml(message);
    };

    const finalizeModel = (modelId: string, errorText: string | null, failed: boolean) => {
      const now = performance.now();
      setExecutionTimes(prev => ({
        ...prev,
        [modelId]: { ...prev[modelId], endTime: now },
      }));
      setSpeaking(prev => {
        const next = new Set(prev);
        next.delete(modelId);
        return next;
      });
      if (failed && errorText !== null) {
        setModelsData(prev => prev.map(model =>
          model.id === modelId ? { ...model, response: errorText, error: errorText } : model,
        ));
        markModelFailed(modelId);
      }
    };

    const handleCompare = async () => {
      setSpeaking(new Set(sessionModelIds));

      const baseMessages = baseHistory.map(msg => ({ role: msg.role, content: msg.content }));
      const messages = systemPrompt
        ? [{ role: 'system', content: systemPrompt }, ...baseMessages]
        : baseMessages;

      const modelEndpoints = getModelEndpoints(modelsData);
      const response = await fetchChatStream({
        models: sessionModelIds,
        messages,
        max_tokens: GENERATION_DEFAULTS.maxTokens,
        temperature: GENERATION_DEFAULTS.temperature,
        github_token: githubToken || null,
        modelEndpoints,
        modelKeys: modelKeyMap,
      }, currentController.signal);

      for await (const data of response) {
        if (data.event === 'info' && data.content) {
          const rawMessage = String(data.content);
          const messageWithIcon = addIconToMessage(rawMessage);
          setPhaseLabel(messageWithIcon);
          if (data.model_id) {
            setModelsData(prev => prev.map(model =>
              model.id === data.model_id
                ? { ...model, statusMessage: messageWithIcon }
                : model,
            ));
          }
        }

        if (data.event === 'token' && data.model_id) {
          const modelId = data.model_id as string;
          const now = performance.now();

          if (!firstTokenReceived.has(modelId)) {
            firstTokenReceived.add(modelId);
            setExecutionTimes(prev => ({
              ...prev,
              [modelId]: { ...prev[modelId], firstTokenTime: now },
            }));
            setModelsData(prev => prev.map(model =>
              model.id === modelId ? { ...model, statusMessage: undefined } : model,
            ));
          }

          applyThinkingChunk(modelId, String(data.content ?? ''));
        }

        if (data.event === 'error' && data.model_id) {
          const modelId = data.model_id as string;
          const errorText = String(data.content ?? 'Error generating response.');
          finalizeModel(modelId, errorText, true);
        }

        if (data.event === 'done' && data.model_id) {
          const modelId = data.model_id as string;
          finalizeModel(modelId, null, false);
        }
      }

      if (!skipHistory) {
        const summary = summarizeSessionResponses(sessionResponses, sessionModelIds);
        if (summary) {
          pushHistoryEntries([{ role: 'assistant', content: summary, kind: 'compare_summary' }]);
        }
      }
    };

    const handleAnalyze = async () => {
      const participants = sessionModelIds;
      if (participants.length < 2) {
        const msg = 'Select at least 2 participants for Analyze mode.';
        setModeratorSynthesis(msg);
        if (moderator) {
          setModelsData(prev => prev.map(model => model.id === moderator ? { ...model, response: msg } : model));
        }
        setPhaseLabel('Error');
        return;
      }
      setSpeaking(new Set(participants));

      const modelEndpoints = getModelEndpoints(modelsData);

      let analyzeSynthesis = '';

      for await (const event of runAnalyze({
        query: contextualQuery,
        participants,
        maxTokens: GENERATION_DEFAULTS.maxTokens,
        systemPrompt: systemPrompt || null,
        githubToken: githubToken || null,
        signal: currentController.signal,
        modelEndpoints,
        modelKeys: modelKeyMap,
        modelIdToName,
      })) {
        const eventType = event.type;

        if (eventType === 'analyze_start') {
          setPhaseLabel('Collecting Responses');
        }

        if (eventType === 'model_start' && event.model_id) {
          const modelId = event.model_id;
          setSpeaking(prev => {
            const next = new Set(prev);
            next.add(modelId);
            return next;
          });
        }

        if (eventType === 'model_chunk' && event.model_id) {
          const modelId = event.model_id;
          const now = performance.now();
          if (!firstTokenReceived.has(modelId)) {
            firstTokenReceived.add(modelId);
            setExecutionTimes(prev => ({
              ...prev,
              [modelId]: { ...prev[modelId], firstTokenTime: now },
            }));
          }
          applyThinkingChunk(modelId, event.chunk ?? '');
        }

        if (eventType === 'model_response' && event.model_id) {
          const modelId = event.model_id;
          finalizeModel(modelId, null, false);

          const responseText = event.response ?? '';
          recordResponse(modelId, responseText, { replace: true });
          setModelsData(prev => prev.map(model => model.id === modelId ? { ...model, response: responseText } : model));
          appendEventHistory(`${modelIdToName(modelId)}:\n${responseText}`, 'analyze_response');
        }

        if (eventType === 'model_error' && event.model_id) {
          const modelId = event.model_id;
          const errorText = event.error ?? 'Error generating response.';
          clearPendingStreamForModel(modelId);
          finalizeModel(modelId, errorText, true);
          recordResponse(modelId, errorText, { replace: true });
        }

        if (eventType === 'analyze_complete') {
          const commonPhrases = event.commonPhrases || [];
          const distinctPhrases = event.distinctPhrases || {};

          let analysis = 'Vocabulary overlap (not semantic analysis):\n\n';
          if (commonPhrases.length > 0) {
            analysis += 'Shared phrasing:\n' + commonPhrases.map((c: string) => `• ${c}`).join('\n') + '\n\n';
          }
          if (Object.keys(distinctPhrases).length > 0) {
            analysis += 'Unique phrasing:\n';
            for (const [modelId, points] of Object.entries(distinctPhrases)) {
              const modelName = modelIdToName(modelId);
              analysis += `\n${modelName}:\n` + (points as string[]).map((p: string) => `• ${p}`).join('\n') + '\n';
            }
          }
          analyzeSynthesis = analysis;
          setModeratorSynthesis(analysis);
          if (moderator) {
            setModelsData(prev => prev.map(model => model.id === moderator ? { ...model, response: analysis } : model));
          }

          setPhaseLabel('Complete');
          setSpeaking(new Set());
        }

        if (eventType === 'error') {
          const message = event.error ?? 'Analyze error.';
          setModeratorSynthesis(message);
          setPhaseLabel('Error');
        }
      }

      if (!skipHistory) {
        const trimmed = analyzeSynthesis.trim();
        if (trimmed) {
          pushHistoryEntries([{ role: 'assistant', content: trimmed, kind: 'analyze_synthesis' }]);
        }
      }
    };

    const handleDebate = async () => {
      const participants = sessionModelIds;
      if (participants.length < 2) {
        const msg = 'Select at least 2 participants for Debate mode.';
        setModeratorSynthesis(msg);
        if (moderator) {
          setModelsData(prev => prev.map(model => model.id === moderator ? { ...model, response: msg } : model));
        }
        setPhaseLabel('Error');
        return;
      }

      const modelEndpoints = getModelEndpoints(modelsData);

      for await (const event of runDebate({
        query: contextualQuery,
        participants,
        rounds: 2,
        maxTokens: GENERATION_DEFAULTS.maxTokens,
        temperature: GENERATION_DEFAULTS.temperature,
        systemPrompt: systemPrompt || null,
        githubToken: githubToken || null,
        signal: currentController.signal,
        modelEndpoints,
        modelKeys: modelKeyMap,
        modelIdToName,
      })) {
        const eventType = event.type;

        if (eventType === 'debate_start') {
          setPhaseLabel('Debate Starting');
        }

        if (eventType === 'round_start') {
          const roundNum = event.round_number ?? 0;
          setPhaseLabel(`Round ${roundNum + 1}`);
        }

        if (eventType === 'turn_start' && event.model_id) {
          const modelId = event.model_id;
          const turnNum = event.turn_number ?? 0;
          const roundNum = event.round_number ?? 0;
          firstTokenReceived.delete(modelId);
          setSpeaking(new Set([modelId]));
          setPhaseLabel(`Round ${roundNum + 1} · Turn ${turnNum + 1}`);
          currentDiscussionTurnRef.current = { modelId, turnNumber: turnNum };
        }

        if (eventType === 'turn_chunk' && event.model_id) {
          const modelId = event.model_id;
          const now = performance.now();
          if (!firstTokenReceived.has(modelId)) {
            firstTokenReceived.add(modelId);
            setExecutionTimes(prev => ({
              ...prev,
              [modelId]: { ...prev[modelId], firstTokenTime: now },
            }));
          }
          applyThinkingChunk(modelId, event.chunk ?? '');
        }

        if (eventType === 'turn_complete' && event.model_id) {
          const modelId = event.model_id;
          finalizeModel(modelId, null, false);

          const responseText = event.response ?? '';
          const turnNum = event.turn_number ?? 0;
          recordResponse(modelId, responseText);
          setModelsData(prev => prev.map(model =>
            model.id === modelId
              ? { ...model, response: model.response ? model.response + '\n\n---\n\n' + responseText : responseText }
              : model
          ));

          setDiscussionTurnsByModel(prev => ({
            ...prev,
            [modelId]: [...(prev[modelId] || []), { turn_number: turnNum, response: responseText }],
          }));

          appendEventHistory(`${modelIdToName(modelId)}:\n${responseText}`, 'debate_turn');
        }

        if (eventType === 'turn_error' && event.model_id) {
          const modelId = event.model_id;
          const errorText = event.error ?? 'Turn error.';
          clearPendingStreamForModel(modelId);
          finalizeModel(modelId, errorText, true);
        }

        if (eventType === 'debate_complete') {
          setPhaseLabel('Complete');
          setSpeaking(new Set());
        }

        if (eventType === 'error') {
          const message = event.error ?? 'Debate error.';
          setPhaseLabel('Error');
          setModeratorSynthesis(message);
        }
      }
    };

    try {
      if (mode === 'compare') return await handleCompare();
      if (mode === 'analyze') return await handleAnalyze();
      if (mode === 'debate') return await handleDebate();
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return;
      }
      console.error('Chat error:', err);
      if (abortControllerRef.current === currentController) {
        const errorMsg = (err as Error).message || String(err);
        setModeratorSynthesis(`Session Error: ${errorMsg}`);
        setPhaseLabel('Error');
        resetPendingStream();
        setModelsData(prev => prev.map(model =>
          sessionModelIds.includes(model.id) && !model.response
            ? { ...model, response: 'Error generating response.' }
            : model,
        ));
        sessionModelIds.forEach(id => markModelFailed(id));
      }
    } finally {
      if (abortControllerRef.current === currentController) {
        const finalTime = performance.now();
        setExecutionTimes(prev => {
          const updated = { ...prev };
          sessionModelIdsRef.current.forEach(modelId => {
            if (updated[modelId] && !updated[modelId].endTime) {
              updated[modelId] = { ...updated[modelId], endTime: finalTime };
            }
          });
          return updated;
        });
        setIsGenerating(false);
        setIsSynthesizing(false);
        setPhaseLabel(prev => (prev === 'Error' ? prev : null));
        setSpeaking(new Set());
      }
    }
  };

  return { sendMessage };
}
