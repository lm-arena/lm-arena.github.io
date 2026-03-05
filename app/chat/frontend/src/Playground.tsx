import { useState, useEffect, useRef, useLayoutEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { Model, Mode, Position, BackgroundStyle } from './types';
import { BG_STYLES, PLAYGROUND_BACKGROUND, LAYOUT, UI_BUILDER_PROMPT } from './constants';
import ModelDock from './components/ModelDock';
import PromptInput from './components/PromptInput';
import Header from './components/Header';
import { useModelsManager } from './hooks/useModelsManager';
import { usePersistedSetting } from './hooks/usePersistedSetting';
import { useConversationHistory } from './hooks/useConversationHistory';
import { useStreamAccumulator } from './hooks/useStreamAccumulator';
import { useSessionController } from './hooks/useSessionController';
import { useSelectionBox } from './hooks/useSelectionBox';
import { useCardReorder } from './hooks/useCardReorder';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useArenaScroll } from './hooks/useArenaScroll';
import { ArenaCanvas } from './components/arenas/ArenaCanvas';
import { ArenaContextMenu } from './components/arenas/types';
import type { ExecutionTimeData } from './components/ExecutionTimeDisplay';
import SelectionOverlay from './components/SelectionOverlay';
import { GestureProvider, useGesture } from './context/GestureContext';
import { connectGitHub, type GitHubAuth } from './utils/oauth';
import './playground.css';

const SettingsModal = lazy(() => import('./components/SettingsModal'));
const ResponseModal = lazy(() => import('./components/ResponseModal'));
const DiscussionTranscript = lazy(() => import('./components/DiscussionTranscript'));
const GestureControl = lazy(() => import('./components/GestureControl'));
const HandBackground = lazy(() => import('./components/HandBackground'));
const ChatView = lazy(() => import('./components/ChatView'));
import ErrorBoundary from './components/ErrorBoundary';

import type { ChatViewHandle, ChatMessage } from './components/ChatView';

const BACKGROUND_IGNORE_SELECTOR = 'button, input, textarea, select, a, [role="button"], [data-no-background], [data-card]';
const ARENA_MODES: Mode[] = ['compare', 'analyze', 'debate'];
const SMART_DEFAULT_LIMITS: Record<string, number> = { compare: Infinity, analyze: 4, debate: 3 };

function PlaygroundInner() {
  const gestureCtx = useGesture();

  const {
    modelsData,
    setModelsData,
    selected,
    setSelected,
    chatModelId,
    setChatModelId,
    moderator,
    setModerator,
    availableModels,
    totalModelsByType,
    allSelectedByType,
    modelIdToName,
    isLoading: isLoadingModels,
    loadError: modelsLoadError,
    retryNow: retryModelsNow,
    getModelEndpoints,
    onlineModelIds,
    modelKeyMap,
  } = useModelsManager();

  const [mode, setMode] = usePersistedSetting<Mode>(
    'playground_mode',
    'chat',
    {
      serialize: value => value,
      deserialize: (stored, fallback) => {
        const validModes: Mode[] = ['chat', 'compare', 'analyze', 'debate'];
        return validModes.includes(stored as Mode) ? (stored as Mode) : fallback;
      },
    },
  );
  const [linesTransitioning, setLinesTransitioning] = useState(false);
  const lineTransitionTimeoutRef = useRef<number | null>(null);

  const [draggedDockModelId, setDraggedDockModelId] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const [showDock, setShowDock] = useState(false);
  const [gridCols, setGridCols] = useState(2);
  const [showSettings, setShowSettings] = useState(false);
  const [githubAuth, setGithubAuth] = usePersistedSetting<GitHubAuth | null>('github_auth', null);

  const handleConnectGitHub = useCallback(async () => {
    try {
      const auth = await connectGitHub();
      setGithubAuth(auth);
    } catch (err) {
      console.error('GitHub OAuth failed:', err);
    }
  }, [setGithubAuth]);

  const [uiBuilderEnabled, setUiBuilderEnabled] = useState(false);
  const [executionTimes, setExecutionTimes] = useState<Record<string, ExecutionTimeData>>({});
  const dockRef = useRef<HTMLDivElement>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const [lastQuery, setLastQuery] = useState('');

  const [apiLimitToast, setApiLimitToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const showApiLimitToast = useCallback((message: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setApiLimitToast(message);
    toastTimeoutRef.current = window.setTimeout(() => {
      setApiLimitToast(null);
      toastTimeoutRef.current = null;
    }, 5000);
  }, []);

  // In multi-model modes, GitHub models require a token
  const canAddApiModel = useCallback((modelId: string): boolean => {
    if (mode === 'chat' || githubAuth?.token) return true;
    const model = modelsData.find(m => m.id === modelId);
    return !model || model.type !== 'github';
  }, [mode, githubAuth, modelsData]);

  const canAddApiGroup = useCallback((): boolean => {
    return mode === 'chat' || !!githubAuth?.token;
  }, [mode, githubAuth]);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [persistedChatModels, setPersistedChatModels] = usePersistedSetting<string[]>(
    'playground_chat_selected_models',
    ['lfm2.5-1.2b-instruct'], // Default to fastest model (will fallback if offline)
  );
  const chatSelectedModels = useMemo(
    () => new Set(persistedChatModels.filter(id => modelsData.some(m => m.id === id))),
    [persistedChatModels, modelsData],
  );
  const [chatIsGenerating, setChatIsGenerating] = useState(false);
  const prevGestureActiveRef = useRef(false);

  const [persistedCompareModels, setPersistedCompareModels] = usePersistedSetting<string[]>(
    'playground_compare_selected_models',
    [],
  );
  const [persistedAnalyzeModels, setPersistedAnalyzeModels] = usePersistedSetting<string[]>(
    'playground_analyze_selected_models',
    [],
  );
  const [persistedDebateModels, setPersistedDebateModels] = usePersistedSetting<string[]>(
    'playground_debate_selected_models',
    [],
  );

  const persistedByMode = useMemo(() => ({
    compare: { get: persistedCompareModels, set: setPersistedCompareModels },
    analyze: { get: persistedAnalyzeModels, set: setPersistedAnalyzeModels },
    debate: { get: persistedDebateModels, set: setPersistedDebateModels },
  }), [persistedCompareModels, persistedAnalyzeModels, persistedDebateModels,
       setPersistedCompareModels, setPersistedAnalyzeModels, setPersistedDebateModels]);

  const handleToggleModel = useCallback((modelId: string) => {
    const model = modelsData.find(m => m.id === modelId);
    if (!model) return;

    setPersistedChatModels(prev => {
      const set = new Set(prev);
      if (set.has(modelId)) {
        set.delete(modelId);
      } else if (modelId === 'auto') {
        // Auto is mutually exclusive
        return ['auto'];
      } else {
        // Selecting any model clears Auto and models from the other group
        set.delete('auto');
        const otherType = model.type === 'self-hosted' ? 'github' : 'self-hosted';
        modelsData.filter(m => m.type === otherType).forEach(m => set.delete(m.id));
        set.add(modelId);
      }
      return Array.from(set);
    });
  }, [setPersistedChatModels, modelsData]);

  const handleToggleChatGroup = useCallback((type: 'self-hosted' | 'github') => {
    const idsOfType = modelsData
      .filter(m => m.type === type)
      .map(m => m.id);
    const otherType = type === 'self-hosted' ? 'github' : 'self-hosted';
    const idsOfOtherType = modelsData.filter(m => m.type === otherType).map(m => m.id);

    setPersistedChatModels(prev => {
      const set = new Set(prev);
      const allSelected = idsOfType.length > 0 && idsOfType.every(id => set.has(id));
      if (allSelected) {
        idsOfType.forEach(id => set.delete(id));
      } else {
        // Clear Auto and models from the other group
        set.delete('auto');
        idsOfOtherType.forEach(id => set.delete(id));
        idsOfType.forEach(id => set.add(id));
      }
      return Array.from(set);
    });
  }, [modelsData, setPersistedChatModels]);

  const {
    history,
    historyRef: conversationHistoryRef,
    pushHistoryEntries,
    clearHistory,
    historyToText,
    buildCarryoverHistory,
  } = useConversationHistory();

  const summarizeSessionResponses = (responses: Record<string, string>, order: string[]) => {
    const seen = new Set<string>();
    const entries: Array<{ id: string; text: string }> = [];

    // Add ordered models first, then any remaining responses
    for (const id of [...order, ...Object.keys(responses)]) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const text = responses[id]?.trim();
      if (text) entries.push({ id, text });
    }

    if (!entries.length) return null;
    return entries.map(({ id, text }) => `${modelIdToName(id)}:\n${text}`).join('\n\n');
  };

  useEffect(() => {
    // Auto-enable UI builder and select GPT-4o when gestures become active
    if (gestureCtx.isActive && !prevGestureActiveRef.current) {
      setUiBuilderEnabled(true);
      setPersistedChatModels(['openai/gpt-4o']);
    }
    prevGestureActiveRef.current = gestureCtx.isActive;
  }, [gestureCtx.isActive, setPersistedChatModels]);

  const selectedModelsBase = selected
    .map(id => modelsData.find(m => m.id === id))
    .filter((m): m is Model => !!m && (mode === 'compare' || m.id !== moderator));

  const selectedModels = useMemo(() => {
    if (mode !== 'compare') return selectedModelsBase;

    return [...selectedModelsBase].sort((a, b) => {
      const aTime = executionTimes[a.id]?.firstTokenTime;
      const bTime = executionTimes[b.id]?.firstTokenTime;

      // Models that haven't responded go to the end
      if (aTime === undefined && bTime === undefined) return 0;
      if (aTime === undefined) return 1;
      if (bTime === undefined) return -1;

      // Earlier response time comes first
      return aTime - bTime;
    });
  }, [mode, selectedModelsBase, executionTimes]);

  const { fastestTTFT, fastestTotal } = useMemo(() => {
    if (mode !== 'compare') return { fastestTTFT: null, fastestTotal: null };

    let fastestTTFTId: string | null = null;
    let fastestTTFTValue = Infinity;
    let fastestTotalId: string | null = null;
    let fastestTotalValue = Infinity;
    let ttftCount = 0;
    let totalCount = 0;

    for (const model of selectedModelsBase) {
      const times = executionTimes[model.id];
      if (!times) continue;

      // TTFT = firstTokenTime - startTime
      if (times.firstTokenTime !== undefined) {
        ttftCount++;
        const ttft = times.firstTokenTime - times.startTime;
        if (ttft < fastestTTFTValue) {
          fastestTTFTValue = ttft;
          fastestTTFTId = model.id;
        }
      }

      // Total time = endTime - startTime
      if (times.endTime !== undefined) {
        totalCount++;
        const total = times.endTime - times.startTime;
        if (total < fastestTotalValue) {
          fastestTotalValue = total;
          fastestTotalId = model.id;
        }
      }
    }

    // Only show badges if at least 2 models have data (otherwise no competition)
    return {
      fastestTTFT: ttftCount >= 2 ? fastestTTFTId : null,
      fastestTotal: totalCount >= 2 ? fastestTotalId : null,
    };
  }, [mode, selectedModelsBase, executionTimes]);

  const getCirclePosition = (index: number, total: number, currentMode: Mode, radius: number): Position => {
    if (currentMode === 'analyze') {
      const startAngle = 250;
      const endAngle = 470;
      const angleRange = endAngle - startAngle;
      const angle = (startAngle + (index * angleRange / (total - 1))) - 90;
      const rad = angle * Math.PI / 180;
      return {
        x: Math.cos(rad) * radius,
        y: Math.sin(rad) * radius,
        angle
      };
    }

    const angle = (index * 360 / total) - 90;
    const x = Math.cos(angle * Math.PI / 180) * radius;
    const y = Math.sin(angle * Math.PI / 180) * radius;
    return { x, y, angle };
  };

  const handleDockDragStart = (e: React.DragEvent, modelId: string) => {
    setDraggedDockModelId(modelId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (draggedDockModelId) {
      if (mode === 'chat') {
        // Chat mode uses separate selection state
        setChatModelId(draggedDockModelId);
      } else if (!selected.includes(draggedDockModelId)) {
        // Check API model limit for multi-model modes
        if (!canAddApiModel(draggedDockModelId)) {
          showApiLimitToast('Connect GitHub in Settings to use API models');
          setDraggedDockModelId(null);
          return;
        }
        setSelected(prev => [...prev, draggedDockModelId]);
      }
      setDraggedDockModelId(null);
    }
  };

  const handleModelToggle = (modelId: string) => {
    if (mode === 'chat') {
      // Chat mode uses separate selection state
      setChatModelId(chatModelId === modelId ? null : modelId);
      return;
    }

    if (selected.includes(modelId)) {
      const isRemovingActive = isGenerating && sessionModelIdsRef.current.includes(modelId);

      if (isRemovingActive && lastQuery) {
        // We are removing a model while generating. Restart session without it.
        if (abortControllerRef.current) abortControllerRef.current.abort();

        const remainingIds = sessionModelIdsRef.current.filter(id => id !== modelId);

        // Collect existing responses to avoid re-generation
        const previousResponses: Record<string, string> = {};
        modelsData.forEach(m => {
          if (remainingIds.includes(m.id) && m.response && !m.error) {
            previousResponses[m.id] = m.response;
          }
        });

        // Update selection state immediately
        setSelected(prev => prev.filter(id => id !== modelId));
        if (selectedCardIds.has(modelId)) {
          setSelectedCardIds(prev => {
            const next = new Set(prev);
            next.delete(modelId);
            return next;
          });
        }

        // Restart if we have enough participants (multi-model modes need 2+)
        if ((mode === 'analyze' || mode === 'debate') && remainingIds.length < 2) {
          setIsGenerating(false);
          setIsSynthesizing(false);
          setModeratorSynthesis('This mode requires at least 2 participants.');
          setPhaseLabel('Error');
          return;
        }

        // Trigger restart with override
        sendMessage(lastQuery, previousResponses, remainingIds, { skipHistory: true });

      } else {
        // Normal removal
        setSelected(prev => prev.filter(id => id !== modelId));
      }

    } else {
      // Adding a model - check API limit for multi-model modes
      if (!canAddApiModel(modelId)) {
        showApiLimitToast('Connect GitHub in Settings to use API models');
        return;
      }
      setSelected(prev => [...prev, modelId]);
    }
  };

  const handleAddGroup = (type: 'self-hosted' | 'github') => {
    const idsOfType = modelsData
      .filter(m => m.type === type)
      .map(m => m.id);
    const isAllSelected = idsOfType.length > 0 && idsOfType.every(id => selected.includes(id));

    if (isAllSelected) {
      setSelected(prev => prev.filter(id => !idsOfType.includes(id)));
      return;
    }

    if (type === 'github' && !canAddApiGroup()) {
      showApiLimitToast('Connect GitHub in Settings to use API models');
      return;
    }

    const newIds = idsOfType.filter(id => !selected.includes(id));
    if (newIds.length > 0) {
      setSelected(prev => [...prev, ...newIds]);
    }
  };

  const handleClearAll = useCallback(() => {
    setSelected([]);
  }, [setSelected]);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const [inputFocused, setInputFocused] = useState<boolean>(false);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const clearSelection = () => setSelectedCardIds(new Set());

  const [arenaSize, setArenaSize] = useState<{ width: number; height: number } | null>(null);

  const layoutRadius = useMemo(() => {
    if (mode === 'compare') return 0;

    // Minimum radius required to fit all cards without overlapping
    const minRequiredRadius = Math.max(LAYOUT.baseRadius, LAYOUT.minRadius + selectedModels.length * LAYOUT.radiusPerModel);

    if (!arenaSize) return minRequiredRadius;

    // Calculate maximum radius that fits in the viewport
    // Use smaller dimension, subtract padding for card size (buffer ~140px)
    const minDimension = Math.min(arenaSize.width, arenaSize.height);
    const safeMaxRadius = (minDimension / 2) - 140;

    // Use safeMaxRadius to expand, but ensure we never shrink below minRequiredRadius
    return Math.max(minRequiredRadius, safeMaxRadius);
  }, [mode, selectedModels.length, arenaSize]);

  useEffect(() => {
    const calculateLayout = () => {
      if (!visualizationAreaRef.current) return;
      const { clientWidth, clientHeight } = visualizationAreaRef.current;

      // Update Grid Cols
      let newCols = Math.floor(clientWidth / (LAYOUT.cardWidth + LAYOUT.gapX));
      newCols = Math.max(1, newCols); // Ensure at least 1 column
      setGridCols(newCols);

      // Update Arena Size
      setArenaSize({ width: clientWidth, height: clientHeight });
    };

    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        if (entry.target === visualizationAreaRef.current) {
          calculateLayout();
        }
      }
    });

    if (visualizationAreaRef.current) {
      resizeObserver.observe(visualizationAreaRef.current);
      // Trigger initial calculation
      calculateLayout();
    }

    return () => {
      if (visualizationAreaRef.current) {
        resizeObserver.unobserve(visualizationAreaRef.current);
      }
    };
  }, [mode]); // Recalculate when layout changes
  const inputRef = useRef<HTMLInputElement>(null);
  const visualizationAreaRef = useRef<HTMLDivElement>(null);

  const chatViewRef = useRef<ChatViewHandle>(null);
  const rootContainerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const lastSelectedCardRef = useRef<string | null>(null);
  const suppressClickRef = useRef({ card: false, background: false });
  const thinkingStateRef = useRef<Record<string, { inThink: boolean; carry: string; implicitThinking?: boolean }>>({});
  const sessionModelIdsRef = useRef<string[]>([]);
  const {
    enqueueStreamDelta,
    clearPendingStreamForModel,
    resetPendingStream,
  } = useStreamAccumulator(setModelsData);

  const dragSelectionActiveRef = useRef(false);

  const {
    arenaOffsetYRef,
    arenaTargetYRef,
    wheelRafRef,
    clampTarget,
    ensureRaf,
  } = useArenaScroll({
    visualizationAreaRef,
    dragSelectionActiveRef,
  });

  const {
    selectionRect,
    isSelecting,
  } = useSelectionBox({
    rootContainerRef,
    visualizationAreaRef,
    arenaOffsetYRef,
    arenaTargetYRef,
    wheelRafRef,
    selectedModels,
    cardRefs,
    selectedCardIds,
    setSelectedCardIds,
    suppressClickRef,
    dragSelectionActiveRef,
  });

  const { dragState, handlePointerDown } = useCardReorder({
    visualizationAreaRef,
    cardRefs,
    selected,
    setSelected,
    mode,
    gridCols,
    getCirclePosition,
  });

  useEffect(() => () => resetPendingStream(), [resetPendingStream]);

  const [contextMenu, setContextMenu] = useState<ArenaContextMenu>(null);

  useEffect(() => {
    const className = 'arena-selecting';
    const body = document.body;
    if (isSelecting) {
      body.classList.add(className);
    } else {
      body.classList.remove(className);
    }
    return () => {
      body.classList.remove(className);
    };
  }, [isSelecting]);

  const isBackgroundTarget = useCallback(
    (target: HTMLElement | null) => {
      if (!target) return false;
      return !target.closest(BACKGROUND_IGNORE_SELECTOR);
    },
    [],
  );

  const handleBackgroundClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (!isBackgroundTarget(event.target as HTMLElement | null)) return;
      if (suppressClickRef.current.background) {
        suppressClickRef.current.background = false;
        return;
      }
      setHoveredCard(null);
      clearSelection();
      suppressClickRef.current.background = false;
    },
    [isBackgroundTarget, clearSelection],
  );

  const handleBackgroundContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (!isBackgroundTarget(event.target as HTMLElement | null)) return;
      event.preventDefault();
      setContextMenu({ x: event.clientX, y: event.clientY, type: 'background' });
    },
    [isBackgroundTarget],
  );

  const triggerLineTransition = useCallback(() => {
    setLinesTransitioning(true);
    if (lineTransitionTimeoutRef.current) {
      clearTimeout(lineTransitionTimeoutRef.current);
    }
    lineTransitionTimeoutRef.current = window.setTimeout(() => {
      setLinesTransitioning(false);
      lineTransitionTimeoutRef.current = null;
    }, 350);
  }, []);

  const prevModeForClearRef = useRef<Mode>(mode);
  const getSmartDefaults = useCallback((targetMode: Mode): string[] => {
    const limit = SMART_DEFAULT_LIMITS[targetMode];
    if (limit === undefined) return [];

    const available = modelsData
      .filter(m => m.id !== 'auto')
      .map(m => m.id);

    return available.slice(0, limit);
  }, [modelsData]);

  const handleModeChange = useCallback((nextMode: Mode) => {
    if (nextMode === mode) return;
    triggerLineTransition();

    // Save current arena mode selection before switching
    const current = persistedByMode[mode as keyof typeof persistedByMode];
    if (current && selected.length > 0) {
      current.set(selected);
    }

    // Load persisted selection or apply smart defaults for arena modes
    const next = persistedByMode[nextMode as keyof typeof persistedByMode];
    if (next) {
      const persisted = next.get.filter(id =>
        modelsData.find(m => m.id === id)
      );
      setSelected(persisted.length > 0 ? persisted : getSmartDefaults(nextMode));
    }

    // Only reset generating when switching to/from chat mode
    const isArenaToArena = ARENA_MODES.includes(mode) && ARENA_MODES.includes(nextMode);
    if (!isArenaToArena) {
      setIsGenerating(false);
    }
    setMode(nextMode);
  }, [mode, triggerLineTransition, selected, modelsData, getSmartDefaults, persistedByMode, setSelected]);

  // Cleanup timeouts on unmount
  useEffect(() => () => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    if (lineTransitionTimeoutRef.current) clearTimeout(lineTransitionTimeoutRef.current);
  }, []);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [moderatorSynthesis, setModeratorSynthesis] = useState<string>('');

  const handleNewSession = useCallback(() => {
    clearHistory();
    setIsGenerating(false);
    setIsSynthesizing(false);
    setModeratorSynthesis('');
    setPhaseLabel(null);
    setDiscussionTurnsByModel({});
    setModelsData(prev => prev.map(model => ({
      ...model,
      response: '',
      thinking: undefined,
      error: undefined,
    })));
    setExecutionTimes({});
    setSpeaking(new Set());
  }, [clearHistory, setModelsData]);

  type OrchestratorAutoScope = 'all' | 'self-hosted' | 'api';
  const [orchestratorAutoMode, setOrchestratorAutoMode] = useState(true);
  const [orchestratorAutoScope, setOrchestratorAutoScope] = useState<OrchestratorAutoScope>('api');
  const [showOrchestratorMenu, setShowOrchestratorMenu] = useState(false);
  const orchestratorMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (orchestratorMenuRef.current && !orchestratorMenuRef.current.contains(e.target as Node)) {
        setShowOrchestratorMenu(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowOrchestratorMenu(false);
      }
    };

    if (showOrchestratorMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showOrchestratorMenu]);

  const [phaseLabel, setPhaseLabel] = useState<string | null>(null);
  const [, setDiscussionTurnsByModel] = useState<Record<string, Array<{
    turn_number: number;
    response: string;
    evaluation?: any;
  }>>>({});
  const [failedModels, setFailedModels] = useState<Set<string>>(new Set());
  const failedModelsRef = useRef<Set<string>>(new Set());
  const currentDiscussionTurnRef = useRef<{ modelId: string; turnNumber: number } | null>(null);

  const compareCardRectsRef = useRef<Record<string, DOMRect>>({});
  const prevModeRef = useRef<Mode>(mode);
  const [orchestratorEntryOffset, setOrchestratorEntryOffset] = useState<{ x: number; y: number } | null>(null);
  const resetFailedModels = () => {
    const empty = new Set<string>();
    failedModelsRef.current = empty;
    setFailedModels(empty);
  };
  const markModelFailed = (modelId: string) => {
    setFailedModels(prev => {
      if (prev.has(modelId)) return prev;
      const next = new Set(prev);
      next.add(modelId);
      failedModelsRef.current = next;
      return next;
    });
  };

  type ArenaModeState = {
    responses: Record<string, { response: string; thinking?: string; error?: string }>;
    moderatorSynthesis: string;
    phaseLabel: string | null;
    executionTimes: Record<string, ExecutionTimeData>;
    isGenerating: boolean;
    speaking: Set<string>;
  };
  const arenaModeStateRef = useRef<Record<string, ArenaModeState>>({
    compare: { responses: {}, moderatorSynthesis: '', phaseLabel: null, executionTimes: {}, isGenerating: false, speaking: new Set() },
    analyze: { responses: {}, moderatorSynthesis: '', phaseLabel: null, executionTimes: {}, isGenerating: false, speaking: new Set() },
    debate: { responses: {}, moderatorSynthesis: '', phaseLabel: null, executionTimes: {}, isGenerating: false, speaking: new Set() },
  });

  const arenaStateSnapshotRef = useRef({ modelsData, moderatorSynthesis, phaseLabel, executionTimes, isGenerating, speaking });
  useEffect(() => {
    arenaStateSnapshotRef.current = { modelsData, moderatorSynthesis, phaseLabel, executionTimes, isGenerating, speaking };
  }, [modelsData, moderatorSynthesis, phaseLabel, executionTimes, isGenerating, speaking]);

  useEffect(() => {
    const prevMode = prevModeForClearRef.current;

    if (ARENA_MODES.includes(prevMode) && ARENA_MODES.includes(mode) && prevMode !== mode) {
      const snap = arenaStateSnapshotRef.current;
      const currentResponses: Record<string, { response: string; thinking?: string; error?: string }> = {};
      snap.modelsData.forEach(m => {
        currentResponses[m.id] = { response: m.response, thinking: m.thinking, error: m.error };
      });
      arenaModeStateRef.current[prevMode] = {
        responses: currentResponses,
        moderatorSynthesis: snap.moderatorSynthesis,
        phaseLabel: snap.phaseLabel,
        executionTimes: snap.executionTimes,
        isGenerating: snap.isGenerating,
        speaking: new Set(snap.speaking),
      };

      const savedState = arenaModeStateRef.current[mode];
      const hasContent = Object.values(savedState.responses).some(r => r.response && r.response !== '');

      if (hasContent || savedState.isGenerating) {
        setModelsData(prev => prev.map(model => ({
          ...model,
          response: savedState.responses[model.id]?.response || '',
          thinking: savedState.responses[model.id]?.thinking,
          error: savedState.responses[model.id]?.error,
        })));
        setModeratorSynthesis(savedState.moderatorSynthesis);
        setPhaseLabel(savedState.phaseLabel);
        setExecutionTimes(savedState.executionTimes);
        setIsGenerating(savedState.isGenerating);
        setSpeaking(new Set(savedState.speaking));
      } else {
        clearHistory();
        setModelsData(prev => prev.map(model => ({
          ...model,
          response: '',
          thinking: undefined,
          error: undefined,
        })));
        setModeratorSynthesis('');
        setPhaseLabel(null);
        setExecutionTimes({});
        setIsGenerating(false);
        setSpeaking(new Set());
      }

      setIsSynthesizing(false);
      setDiscussionTurnsByModel({});
    }
    prevModeForClearRef.current = mode;
  }, [mode, clearHistory, setModelsData]);

  const { sendMessage } = useSessionController({
    mode,
    moderator,
    selected,
    selectedCardIds,
    githubToken: githubAuth?.token,
    isGenerating,
    systemPrompt: uiBuilderEnabled ? UI_BUILDER_PROMPT : undefined,
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
  });

  // Keyboard shortcuts
  useKeyboardShortcuts({
    mode,
    showSettings,
    showDock,
    contextMenu,
    selectedCardIds,
    selected,
    inputRef,
    setShowSettings,
    setShowDock,
    setContextMenu,
    setSelected,
    setSelectedCardIds,
    clearSelection,
    setHoveredCard,
    handleModeChange,
  });

  const [bgStyle, setBgStyle] = usePersistedSetting<BackgroundStyle>(
    'playground-bg-style',
    'dots',
    {
      serialize: value => value,
      deserialize: (stored, fallback) =>
        stored && BG_STYLES.includes(stored as BackgroundStyle)
          ? (stored as BackgroundStyle)
          : fallback,
    },
  );

  const moderatorModel = modelsData.find(m => m.id === moderator);

  const orchestratorStatus = (() => {
    if (isSynthesizing) return 'responding';
    if (isGenerating) return 'waiting';
    if (moderatorSynthesis) return 'done';
    return 'idle';
  })();

  const orchestratorTransform = orchestratorEntryOffset
    ? `translate(-50%, -50%) translate(${orchestratorEntryOffset.x}px, ${orchestratorEntryOffset.y}px)`
    : 'translate(-50%, -50%)';
  const orchestratorTransformWithScale = `${orchestratorTransform} scale(1)`;

  useLayoutEffect(() => {
    if (mode !== 'compare') return;
    const rects: Record<string, DOMRect> = {};
    selectedModels.forEach(model => {
      const card = cardRefs.current.get(model.id);
      if (card) {
        rects[model.id] = card.getBoundingClientRect();
      }
    });
    compareCardRectsRef.current = rects;
  }, [mode, selectedModels.length, selectedModels.map(m => m.id).join(',')]);

  useEffect(() => {
    const prevMode = prevModeRef.current;
    if (prevMode === 'compare' && mode !== 'compare' && moderator && visualizationAreaRef.current) {
      const rect = compareCardRectsRef.current[moderator];
      const viz = visualizationAreaRef.current.getBoundingClientRect();
      if (rect && viz.width > 0 && viz.height > 0) {
        const targetX = viz.left + viz.width / 2;
        const verticalOffset = mode === 'analyze' ? layoutRadius - 64 : 0;
        const targetY = viz.top + (viz.height * 0.5 + verticalOffset);
        const offsetX = rect.left + rect.width / 2 - targetX;
        const offsetY = rect.top + rect.height / 2 - targetY;
        if (Math.abs(offsetX) > 1 || Math.abs(offsetY) > 1) {
          setOrchestratorEntryOffset({ x: offsetX, y: offsetY });
          requestAnimationFrame(() => setOrchestratorEntryOffset(null));
        }
      }
    }
    prevModeRef.current = mode;
  }, [mode, moderator, layoutRadius]);

  const bgClass = bgStyle === 'none' ? '' : `bg-${bgStyle}`;

  const getTailSnippet = (text: string, maxChars: number = 280) => {
    if (!text) return '';
    if (text.length <= maxChars) return text;
    return `…${text.slice(text.length - maxChars)}`;
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
      setIsSynthesizing(false);
    }
  };

  return (
    <div
      ref={rootContainerRef}
      className={`fixed inset-0 overflow-hidden text-white ${bgClass}`}
      style={{
        backgroundColor: PLAYGROUND_BACKGROUND,
        transition: 'background-color 1s ease',
        ...(bgStyle === 'none' ? { background: PLAYGROUND_BACKGROUND } : {}),
        ...(isSelecting ? { userSelect: 'none', WebkitUserSelect: 'none' } : {}),
      }}
      onClick={handleBackgroundClick}
      onContextMenu={handleBackgroundContextMenu}
    >
      {gestureCtx.isActive && (
        <Suspense fallback={null}>
          <HandBackground
            onSendMessage={gestureCtx.callbacks.current.onSendMessage}
            onScroll={gestureCtx.callbacks.current.onScroll}
            onPinch={gestureCtx.callbacks.current.onPinch}
            onHover={gestureCtx.callbacks.current.onHover}
            gestureActiveArea={{ minX: 0.70, maxX: 1.0, minY: 0, maxY: 1.0 }}
            onGestureState={gestureCtx.setGestureState}
            onError={gestureCtx.setCameraError}
            onPerformance={gestureCtx.setPerformanceMetrics}
          />
        </Suspense>
      )}

      {/* Loading overlay while models are being fetched */}
      {isLoadingModels && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/95 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-5 text-center">
            <div className="relative">
              <div className="w-12 h-12 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
              <div className="absolute inset-0 w-12 h-12 border-2 border-transparent border-b-emerald-500/50 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
            </div>
            <div className="space-y-1.5">
              <p className="text-white/80 text-sm font-medium">
                {modelsLoadError || 'Loading models...'}
              </p>
            </div>
            <button
              onClick={retryModelsNow}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white/70 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg transition-all active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh Now
            </button>
          </div>
        </div>
      )}
      {/* Header - centered within the dotted background area */}
      <Header
        mode={mode}
        setMode={handleModeChange}
        setHoveredCard={setHoveredCard}
        clearSelection={clearSelection}
        showDock={showDock}
        setShowDock={setShowDock}
        onOpenSettings={() => setShowSettings(true)}
        isAuthenticated={!!githubAuth?.token}
        gestureButtonSlot={
          <Suspense fallback={null}>
            <GestureControl
              inHeader={true}
              appContext={mode}
              onStopGeneration={() => {
                if (mode === 'chat' && chatViewRef.current) {
                  chatViewRef.current.stopGeneration();
                  return;
                }
                handleStop();
              }}
              onSendMessage={(msg) => {
                if (mode === 'chat' && chatViewRef.current) {
                  chatViewRef.current.sendMessage(msg, true); // fromGesture = true
                  return;
                }

                if (selected.length > 0) {
                  sendMessage(msg, {}, selected);
                }
              }}
              onScroll={(deltaY) => {
                // Chat mode uses its own scroll container
                if (mode === 'chat' && chatViewRef.current) {
                  chatViewRef.current.scroll(deltaY);
                  return;
                }
                // Other modes use arena scrolling
                arenaTargetYRef.current = clampTarget(arenaTargetYRef.current + deltaY);
                ensureRaf();
              }}
              onHover={(xOfScreen, yOfScreen) => {
                const hoverX = xOfScreen * window.innerWidth;
                const hoverY = yOfScreen * window.innerHeight;

                const el = document.elementFromPoint(hoverX, hoverY) as HTMLElement;
                if (el) {
                  // Check if hovering over mode track
                  const modeTrack = el.closest('[data-gesture-mode-track]') as HTMLElement;
                  if (modeTrack) {
                    // Calculate which mode based on horizontal position
                    const rect = modeTrack.getBoundingClientRect();
                    const relativeX = hoverX - rect.left;
                    const trackWidth = rect.width;
                    const modeIndex = Math.floor((relativeX / trackWidth) * 5); // 5 modes
                    const modes: Mode[] = ['chat', 'compare', 'analyze', 'debate'];
                    const targetMode = modes[Math.max(0, Math.min(4, modeIndex))];

                    if (targetMode && targetMode !== mode) {
                      handleModeChange(targetMode);
                    }
                    return;
                  }

                  // Get the current hovered element stored in a data attribute
                  const currentHovered = document.querySelector('[data-gesture-hovered="true"]') as HTMLElement;

                  // Find the interactive element or just use the element itself
                  const interactive = el.closest('button, a, [role="button"], [data-clickable], .cursor-pointer, [onclick]') as HTMLElement || el;

                  if (interactive !== currentHovered) {
                    // Pointer/Mouse leave on previous element
                    if (currentHovered) {
                      currentHovered.removeAttribute('data-gesture-hovered');
                      currentHovered.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false, cancelable: true }));
                      currentHovered.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false, cancelable: true }));
                      currentHovered.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, cancelable: true }));
                    }

                    // Pointer/Mouse enter on new element
                    interactive.setAttribute('data-gesture-hovered', 'true');
                    interactive.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false, cancelable: true, clientX: hoverX, clientY: hoverY }));
                    interactive.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, clientX: hoverX, clientY: hoverY }));
                    interactive.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, cancelable: true, clientX: hoverX, clientY: hoverY }));
                    interactive.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, clientX: hoverX, clientY: hoverY }));
                  } else if (interactive === currentHovered) {
                    // Still hovering same element, dispatch pointermove for continuous tracking
                    interactive.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, clientX: hoverX, clientY: hoverY }));
                    interactive.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: hoverX, clientY: hoverY }));
                  }
                }
              }}
              onPinch={(xOfScreen, yOfScreen) => {
                const clickX = xOfScreen * window.innerWidth;
                const clickY = yOfScreen * window.innerHeight;

                const el = document.elementFromPoint(clickX, clickY) as HTMLElement;
                if (el) {
                  // Dispatch pointer and mouse events on the target element
                  // This ensures compatibility with both pointer-based (cards) and mouse-based (buttons) handlers
                  const dispatchClickEvents = (target: HTMLElement) => {
                    // Pointer events (for cards and modern UI)
                    target.dispatchEvent(new PointerEvent('pointerdown', {
                      bubbles: true, cancelable: true, clientX: clickX, clientY: clickY,
                      pointerId: 1, pointerType: 'touch', isPrimary: true
                    }));
                    target.dispatchEvent(new PointerEvent('pointerup', {
                      bubbles: true, cancelable: true, clientX: clickX, clientY: clickY,
                      pointerId: 1, pointerType: 'touch', isPrimary: true
                    }));

                    // Mouse events (for traditional buttons and links)
                    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: clickX, clientY: clickY }));
                    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: clickX, clientY: clickY }));
                    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: clickX, clientY: clickY }));
                  };

                  // Find clickable elements: buttons, links, cards, anything with click handlers
                  const clickable = el.closest('button, a, [role="button"], [data-clickable], .cursor-pointer, [onclick]') as HTMLElement;

                  if (clickable) {
                    dispatchClickEvents(clickable);
                  } else {
                    // If no clickable found, try clicking the element directly (works for cards)
                    dispatchClickEvents(el);
                  }

                  // Visual feedback ripple
                  const ripple = document.createElement('div');
                  ripple.style.position = 'fixed';
                  ripple.style.left = `${clickX}px`;
                  ripple.style.top = `${clickY}px`;
                  ripple.style.width = '20px';
                  ripple.style.height = '20px';
                  ripple.style.background = 'rgba(236, 72, 153, 0.5)';
                  ripple.style.borderRadius = '50%';
                  ripple.style.transform = 'translate(-50%, -50%)';
                  ripple.style.pointerEvents = 'none';
                  ripple.style.zIndex = '9999';
                  document.body.appendChild(ripple);

                  ripple.animate([
                    { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
                    { transform: 'translate(-50%, -50%) scale(4)', opacity: 0 }
                  ], { duration: 400 }).onfinish = () => ripple.remove();
                }
              }}
              onModeChange={(direction) => {
                const modes: Mode[] = ['chat', 'compare', 'analyze', 'debate'];
                const currentIndex = modes.indexOf(mode);
                let nextIndex: number;
                if (direction === 'next') {
                  nextIndex = (currentIndex + 1) % modes.length;
                } else {
                  nextIndex = (currentIndex - 1 + modes.length) % modes.length;
                }
                handleModeChange(modes[nextIndex]);
              }}
            />
          </Suspense>
        }
      />

      {/* Content Wrapper with Sidebar Offset */}
      <div
        style={{
          paddingLeft: '1.5rem',
          paddingRight: '0',
        }}
      >
        {/* Dock Backdrop */}
        {showDock && (
          <div
            className="fixed inset-0 z-[55] bg-black/10 backdrop-blur-[1px] transition-opacity duration-300"
            onClick={() => setShowDock(false)}
          />
        )}

        {/* Model Dock (Left) - Available in all modes */}
        <ModelDock
          showDock={showDock}
          availableModels={availableModels}
          allSelectedByType={allSelectedByType}
          totalModelsByType={totalModelsByType}
          handleDragStart={handleDockDragStart}
          handleModelToggle={handleModelToggle}
          handleAddGroup={handleAddGroup}
          handleClearAll={handleClearAll}
          dockRef={dockRef}
          mode={mode}
          allModels={modelsData}
          setShowDock={setShowDock}
          chatSelectedModels={chatSelectedModels}
          onToggleChatModel={handleToggleModel}
          onToggleChatGroup={handleToggleChatGroup}
        />

        {/* Chat View */}
        {mode === 'chat' && (
          <div className="flex h-screen w-full relative z-[10]">
            <div className="flex-1 relative px-2 sm:px-6 pt-20 pb-6">
              <ErrorBoundary>
                <Suspense fallback={<div className="flex items-center justify-center h-full text-white/50 gap-2"><div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />Loading...</div>}>
                  <ChatView
                    ref={chatViewRef}
                    models={modelsData}
                    selectedModels={chatSelectedModels}
                    onToggleModel={handleToggleModel}
                    githubToken={githubAuth?.token}
                    githubUsername={githubAuth?.name || githubAuth?.username}
                    onConnectGitHub={handleConnectGitHub}
                    messages={chatMessages}
                    setMessages={setChatMessages}
                    isGenerating={chatIsGenerating}
                    setIsGenerating={setChatIsGenerating}
                    gesturesActive={gestureCtx.isActive}
                    uiBuilderEnabled={uiBuilderEnabled}
                    setUiBuilderEnabled={setUiBuilderEnabled}
                    getModelEndpoints={getModelEndpoints}
                    modelKeyMap={modelKeyMap}
                    onlineModelIds={onlineModelIds}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>
          </div>
        )}

        {/* Main Content Area (Arena/Transcript) - Hidden in Chat Mode */}
        {mode !== 'chat' && (
          <div className="flex h-screen w-full relative">
            {/* Left/Main Visualization Area */}
            <div
              className={`relative flex-1 transition-all duration-300 flex flex-col pt-24`}
            >
              <div
                ref={visualizationAreaRef}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative w-full h-full z-10 transition-all duration-300`}
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: mode === 'compare' ? 'flex-start' : 'center',
                  justifyContent: 'center',
                  ['--arena-offset-y' as any]: `${arenaOffsetYRef.current}px`,
                  transform: mode === 'analyze' || mode === 'debate'
                    ? `translateY(calc(var(--arena-offset-y) - 50px)) scale(${isDraggingOver ? 1.02 : 1})`
                    : `translateY(var(--arena-offset-y)) scale(${isDraggingOver ? 1.02 : 1})`,
                  willChange: 'transform',
                  border: isDraggingOver ? '2px dashed rgba(59, 130, 246, 0.4)' : '2px dashed transparent',
                  borderRadius: isDraggingOver ? '24px' : '0px',
                  transition: 'transform 0s linear',

                  // Mode-specific styles override base
                  ...(mode === 'compare' ? {
                    minHeight: '300px', // Minimum height to ensure clickable background
                    paddingBottom: '120px', // Extra space at bottom for right-click menu access
                  } : mode === 'analyze' || mode === 'debate' ? {
                    height: '100%',
                    minHeight: '100%',
                    overflow: 'hidden', // Prevent scroll in arena for multi-model modes
                  } : {
                    height: '100%',
                    minHeight: '100%',
                    overflow: 'hidden'
                  }),

                  ...(isDraggingOver ? {
                    background: 'rgba(59, 130, 246, 0.05)',
                  } : {})
                }}
              >
                <ArenaCanvas
                  mode={mode}
                  selectedModels={selectedModels}
                  gridCols={gridCols}
                  speaking={speaking}
                  selectedCardIds={selectedCardIds}
                  setSelectedCardIds={setSelectedCardIds}
                  executionTimes={executionTimes}
                  failedModels={failedModels}
                  cardRefs={cardRefs}
                  handlePointerDown={handlePointerDown}
                  dragState={dragState}
                  handleModelToggle={handleModelToggle}
                  setContextMenu={setContextMenu}
                  suppressClickRef={suppressClickRef}
                  getTailSnippet={getTailSnippet}
                  hoveredCard={hoveredCard}
                  setHoveredCard={setHoveredCard}
                  setExpandedModelId={setExpandedModelId}
                  layoutRadius={layoutRadius}
                  getCirclePosition={getCirclePosition}
                  moderatorModel={moderatorModel}
                  moderatorId={moderator}
                  orchestratorTransform={orchestratorTransformWithScale}
                  orchestratorStatus={orchestratorStatus}
                  moderatorSynthesis={moderatorSynthesis}
                  isSynthesizing={isSynthesizing}
                  isGenerating={isGenerating}
                  phaseLabel={phaseLabel}
                  linesTransitioning={linesTransitioning}
                  lastSelectedCardRef={lastSelectedCardRef}
                  orchestratorAutoMode={orchestratorAutoMode}
                  orchestratorAutoScope={orchestratorAutoScope}
                  showOrchestratorMenu={showOrchestratorMenu}
                  setShowOrchestratorMenu={setShowOrchestratorMenu}
                  setOrchestratorAutoMode={setOrchestratorAutoMode}
                  setOrchestratorAutoScope={setOrchestratorAutoScope}
                  orchestratorMenuRef={orchestratorMenuRef}
                  availableModels={availableModels}
                  setModerator={setModerator}
                  fastestTTFT={fastestTTFT}
                  fastestTotal={fastestTotal}
                />
              </div>
            </div>

            {/* Right Panel: Transcript (Analyze, Debate modes only) */}
            {mode !== 'compare' && (
              <div className="transcript-panel w-[400px] xl:w-[480px] flex flex-col border-l border-white/5 bg-slate-900/20 backdrop-blur-sm z-40 relative h-full">
                <Suspense fallback={null}>
                  <DiscussionTranscript
                    history={history}
                    models={modelsData}
                    mode={mode}
                    onSelectPrompt={(prompt) => {
                      if (inputRef.current) {
                        inputRef.current.value = prompt;
                        inputRef.current.focus();
                      }
                    }}
                    onNewSession={handleNewSession}
                    className="pt-24 pb-6 mask-fade-top"
                    phaseLabel={phaseLabel}
                    isGenerating={isGenerating}
                    isSynthesizing={isSynthesizing}
                    speakingCount={speaking.size}
                    totalParticipants={selectedModels.length}
                  />
                </Suspense>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Selection rectangle overlay - positioned relative to root container */}
      <SelectionOverlay rect={selectionRect} />

      {/* API Limit Toast Notification */}
      {apiLimitToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[200] animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 backdrop-blur-md shadow-xl">
            <svg className="w-5 h-5 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-sm text-amber-100">{apiLimitToast}</span>
            <button
              onClick={() => {
                setApiLimitToast(null);
                setShowSettings(true);
              }}
              className="ml-2 px-3 py-1 text-xs font-medium text-amber-900 bg-amber-400 hover:bg-amber-300 rounded-md transition-colors"
            >
              Open Settings
            </button>
            <button
              onClick={() => setApiLimitToast(null)}
              className="ml-1 p-1 text-amber-400/60 hover:text-amber-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <Suspense fallback={null}>
        <SettingsModal
          open={showSettings}
          onClose={() => setShowSettings(false)}
          githubAuth={githubAuth}
          setGithubAuth={setGithubAuth}
          bgStyle={bgStyle}
          setBgStyle={setBgStyle}
        />
      </Suspense>

      {/* Response Modal for viewing full responses */}
      {expandedModelId && mode === 'compare' && (
        <Suspense fallback={null}>
          <ResponseModal
            model={selectedModels.find(m => m.id === expandedModelId) || null}
            executionTimes={executionTimes[expandedModelId]}
            onClose={() => setExpandedModelId(null)}
            onPrev={() => {
              const idx = selectedModels.findIndex(m => m.id === expandedModelId);
              if (idx > 0) setExpandedModelId(selectedModels[idx - 1].id);
            }}
            onNext={() => {
              const idx = selectedModels.findIndex(m => m.id === expandedModelId);
              if (idx < selectedModels.length - 1) setExpandedModelId(selectedModels[idx + 1].id);
            }}
            hasPrev={selectedModels.findIndex(m => m.id === expandedModelId) > 0}
            hasNext={selectedModels.findIndex(m => m.id === expandedModelId) < selectedModels.length - 1}
          />
        </Suspense>
      )}

      {/* Fixed Prompt Input for Compare, Analyze, and Debate Modes */}
      {
        ARENA_MODES.includes(mode) && (
          <PromptInput
            inputRef={inputRef}
            inputFocused={inputFocused}
            setInputFocused={setInputFocused}
            onSendMessage={sendMessage}
            isGenerating={isGenerating || isSynthesizing}
            onStop={handleStop}
            placeholder={mode === 'compare' ? undefined : "Steer the discussion..."}
            className={`fixed bottom-0 left-0 z-[100] pb-6 px-3 sm:px-4 flex justify-center items-end pointer-events-none transition-all duration-300 ${mode === 'compare' ? 'right-0' : 'right-[400px] xl:right-[480px]'}`}
            style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
          />
        )
      }

      {/* Custom Context Menu */}
      {
        contextMenu && (
          <div
            className="fixed bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 z-[200] min-w-[160px]"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            {contextMenu.type === 'background' ? (
              // Background context menu - Add Model option
              <button
                className="w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors flex items-center gap-2"
                onClick={() => {
                  setShowDock(true);
                  setContextMenu(null);
                }}
              >
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Model
              </button>
            ) : contextMenu.modelId ? (
              // Model context menu - different options based on mode
              <>
                {/* Set as first responder - only in multi-model modes and not already set */}
                {mode !== 'compare' && contextMenu.modelId !== moderator && (
                  <button
                    className="w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors flex items-center gap-2"
                    onClick={() => {
                      setModerator(contextMenu.modelId!);
                      setContextMenu(null);
                    }}
                  >
                    <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                    Set as Orchestrator
                  </button>
                )}

                {/* Remove Model option - available in all modes */}
                <button
                  className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-slate-700 transition-colors flex items-center gap-2"
                  onClick={() => {
                    const removingModerator = contextMenu.modelId === moderator;

                    // Remove the model from selected
                    handleModelToggle(contextMenu.modelId!);

                    // If removing the orchestrator, auto-select a new one from remaining models
                    if (removingModerator && mode !== 'compare') {
                      const remaining = selected.filter(id => id !== contextMenu.modelId);
                      if (remaining.length > 0) {
                        setModerator(remaining[0]);
                      } else {
                        // If no models remain, clear moderator
                        setModerator('');
                      }
                    }
                    setContextMenu(null);
                  }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Remove
                </button>
              </>
            ) : null}
          </div>
        )
      }

    </div>
  );
}

export default function Playground() {
  return (
    <GestureProvider>
      <PlaygroundInner />
    </GestureProvider>
  );
}
