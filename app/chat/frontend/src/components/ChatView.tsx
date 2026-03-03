import { useState, useRef, useEffect, forwardRef, useImperativeHandle, useCallback, useMemo, memo } from 'react';
import { Model } from '../types';
import FormattedContent from './FormattedContent';
import PromptInput from './PromptInput';
import { Bot, AlertTriangle, User, Check, Copy } from 'lucide-react';
import { extractTextWithoutJSON } from '../hooks/useGestureOptions';
import GestureOptions from './GestureOptions';
import { fetchChatStream, streamSseEvents } from '../utils/streaming';
import ModelTabs from './ModelTabs';
import { useGestureOptional } from '../context/GestureContext';
import ExecutionTimeDisplay, { ExecutionTimeData } from './ExecutionTimeDisplay';
import { UI_BUILDER_PROMPT } from '../constants';

export interface ChatViewHandle {
    sendMessage: (text: string, fromGesture?: boolean) => void;
    setInput: (text: string) => void;
    stopGeneration: () => void;
    scroll: (deltaY: number) => void;
}

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    modelName?: string;
    modelId?: string;
    error?: boolean;
    timing?: ExecutionTimeData;
}

interface ChatViewProps {
    models: Model[];
    selectedModels: Set<string>;
    onToggleModel: (modelId: string) => void;
    githubToken?: string;
    githubUsername?: string;
    onConnectGitHub?: () => void;
    messages: ChatMessage[];
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
    isGenerating: boolean;
    setIsGenerating: React.Dispatch<React.SetStateAction<boolean>>;
    gesturesActive?: boolean;
    uiBuilderEnabled: boolean;
    setUiBuilderEnabled: React.Dispatch<React.SetStateAction<boolean>>;
    getModelEndpoints: (models: Model[]) => Record<string, string>;
}

interface ChatMessageItemProps {
    msg: ChatMessage;
    idx: number;
    gesturesActive: boolean;
    uiBuilderEnabled: boolean;
    isCopied: boolean;
    onCopy: (idx: number) => void;
    onGestureSelect: (value: string) => void;
}

function getMessageBubbleClasses(role: 'user' | 'assistant', hasError?: boolean): string {
    const base = 'group relative max-w-[85%] rounded-2xl px-4 py-3';
    if (role === 'user') {
        return `${base} bg-blue-600/20 border border-blue-500/30 text-white rounded-tr-sm`;
    }
    if (hasError) {
        return `${base} bg-red-500/10 border border-red-500/30 text-red-200 rounded-tl-sm`;
    }
    return `${base} bg-slate-800/60 border border-slate-700/60 text-slate-200 rounded-tl-sm`;
}

const ChatMessageItem = memo(({ msg, idx, gesturesActive, uiBuilderEnabled, isCopied, onCopy, onGestureSelect }: ChatMessageItemProps) => {
    const hasGestureOptions = msg.role === 'assistant' && (gesturesActive || uiBuilderEnabled) && msg.content.includes('```json');

    return (
        <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={getMessageBubbleClasses(msg.role, msg.error)}>
                <div className={`flex items-center gap-2 mb-1 text-[10px] font-bold uppercase tracking-wider ${
                    msg.role === 'user' ? 'text-blue-300 flex-row-reverse' : 'text-slate-400'
                }`}>
                    {msg.role === 'user' ? <User size={12} /> : <Bot size={12} />}
                    {msg.role === 'user' ? 'You' : msg.modelName || 'Assistant'}
                    {msg.error && <AlertTriangle size={12} className="text-red-400" />}
                </div>
                <div className="prose prose-invert prose-sm max-w-none">
                    <FormattedContent text={msg.role === 'user' ? msg.content : extractTextWithoutJSON(msg.content)} />
                </div>
                {msg.role === 'assistant' && msg.timing && (
                    <div className="mt-2 pt-2 border-t border-slate-700/30">
                        <ExecutionTimeDisplay times={msg.timing} />
                    </div>
                )}
                {msg.role === 'assistant' && msg.content && (
                    <button
                        onClick={() => onCopy(idx)}
                        className={`absolute bottom-2 right-2 p-1.5 rounded-md transition-all ${
                            isCopied
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : 'opacity-0 group-hover:opacity-100 bg-slate-700/70 text-slate-400'
                        }`}
                    >
                        {isCopied ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                )}
            </div>
            {hasGestureOptions && (
                <div className="ml-4">
                    <GestureOptions
                        content={msg.content}
                        onSelect={onGestureSelect}
                        isInline={false}
                    />
                </div>
            )}
        </div>
    );
});

const ChatView = forwardRef<ChatViewHandle, ChatViewProps>(({
    models,
    selectedModels,
    onToggleModel,
    githubToken,
    githubUsername,
    onConnectGitHub,
    messages,
    setMessages,
    isGenerating,
    setIsGenerating,
    gesturesActive = false,
    uiBuilderEnabled,
    setUiBuilderEnabled,
    getModelEndpoints,
}, ref) => {
    const [inputFocused, setInputFocused] = useState(false);
    const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null);
    const [streamingResponses, setStreamingResponses] = useState<Map<string, string>>(new Map());
    const [streamingTiming, setStreamingTiming] = useState<Map<string, ExecutionTimeData>>(new Map());
    const abortRefs = useRef<Map<string, AbortController>>(new Map());
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const userScrolledAwayRef = useRef(false);
    const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const streamingContentRef = useRef<Map<string, string>>(new Map());
    const streamingTimingRef = useRef<Map<string, ExecutionTimeData>>(new Map());
    const rafRef = useRef<number | null>(null);

    const gestureCtx = useGestureOptional();
    const isMiddleFinger = gestureCtx?.gestureState?.gesture === 'Middle_Finger';

    const modelMap = useMemo(() => new Map(models.map(m => [m.id, m])), [models]);

    useEffect(() => {
        return () => {
            if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, []);

    // Throttled streaming state sync using rAF
    const syncStreamingState = useCallback(() => {
        if (rafRef.current) return;
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;
            setStreamingResponses(new Map(streamingContentRef.current));
            setStreamingTiming(new Map(streamingTimingRef.current));
        });
    }, []);

    // Auto-focus input when typing printable characters (type-anywhere)
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

            if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
                if (inputRef.current) {
                    inputRef.current.focus();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const isNearBottom = useCallback(() => {
        if (!scrollRef.current) return true;
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        return scrollHeight - scrollTop - clientHeight < 100;
    }, []);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        const handleScroll = () => {
            userScrolledAwayRef.current = !isNearBottom();
        };

        el.addEventListener('scroll', handleScroll, { passive: true });
        return () => el.removeEventListener('scroll', handleScroll);
    }, [isNearBottom]);

    const smartScroll = useCallback(() => {
        if (!userScrolledAwayRef.current && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, []);

    useEffect(() => {
        smartScroll();
    }, [messages, streamingResponses, smartScroll]);

    const handleSend = useCallback(async (text: string, fromGesture = false) => {
        if (!text.trim() || isGenerating) return;

        const modelIds = Array.from(selectedModels);
        if (modelIds.length === 0) return;

        userScrolledAwayRef.current = false;

        const now = Date.now();
        const initialContent = new Map(modelIds.map(id => [id, ''] as const));
        const initialTiming = new Map(modelIds.map(id => [id, { startTime: now }] as const));

        streamingContentRef.current = initialContent;
        streamingTimingRef.current = initialTiming;

        setIsGenerating(true);
        setStreamingResponses(new Map(initialContent));
        setStreamingTiming(new Map(initialTiming));

        const userMessage: ChatMessage = { role: 'user', content: text };
        setMessages(prev => [...prev, userMessage]);

        const baseMessages = [...messages, userMessage].map(m => ({ role: m.role, content: m.content }));

        const systemPrompts: Array<{ role: 'system'; content: string }> = [];

        if (uiBuilderEnabled) {
            systemPrompts.push({ role: 'system', content: UI_BUILDER_PROMPT });
        }

        if (fromGesture) {
            systemPrompts.push({ role: 'system', content: `User is using gesture control. Available gestures: 👍 (yes), 👎 (no), 👋 (hello), "ok", "thanks", "stop", pointing finger (select buttons).` });
        }

        const isAngryTrigger = text === "🖕" || text.toLowerCase().includes("middle finger");
        if (isAngryTrigger) {
            systemPrompts.push({ role: 'system', content: "The user is showing you their middle finger. Respond with humorous, over-the-top mock indignation. Play along with the 'angry robot' persona." });
        }

        const apiMessages = [...systemPrompts, ...baseMessages];

        const modelEndpoints = getModelEndpoints(models);
        let completedCount = 0;
        const totalCount = modelIds.length;

        function appendAssistantMessage(fields: Omit<ChatMessage, 'role'>) {
            setMessages(prev => [...prev, { role: 'assistant', ...fields }]);
        }

        const streamPromises = modelIds.map(async (modelId) => {
            const model = modelMap.get(modelId);
            const startTime = Date.now();

            if (!model) {
                appendAssistantMessage({ content: `Model ${modelId} not found`, modelId, modelName: modelId, error: true });
                completedCount++;
                if (completedCount === totalCount) setIsGenerating(false);
                return;
            }

            const controller = new AbortController();
            abortRefs.current.set(modelId, controller);

            try {
                const stream = fetchChatStream({
                    models: [modelId],
                    messages: apiMessages,
                    max_tokens: 4096,
                    temperature: 0.7,
                    github_token: githubToken,
                    modelEndpoints,
                }, controller.signal);

                let content = '';
                let firstToken = true;
                let firstTokenTime: number | undefined;
                let hasError = false;

                await streamSseEvents(stream, (event) => {
                    if (event.event === 'error' || event.error === true) {
                        hasError = true;
                        content = typeof event.content === 'string' ? event.content : 'An error occurred';
                        streamingContentRef.current.set(modelId, content);
                        syncStreamingState();
                        return;
                    }
                    if (event.content) {
                        if (firstToken) {
                            firstToken = false;
                            firstTokenTime = Date.now();
                            const existing = streamingTimingRef.current.get(modelId) || { startTime };
                            streamingTimingRef.current.set(modelId, { ...existing, firstTokenTime });
                        }
                        content += event.content;
                        streamingContentRef.current.set(modelId, content);
                        syncStreamingState();
                    }
                });

                const endTime = Date.now();

                appendAssistantMessage({
                    content: content || '(empty response)',
                    modelId,
                    modelName: model.name,
                    timing: { startTime, firstTokenTime, endTime },
                    error: hasError,
                });
            } catch (err: any) {
                if (err.name !== 'AbortError') {
                    appendAssistantMessage({ content: err.message || 'Request failed', modelId, modelName: model.name, error: true });
                }
            } finally {
                abortRefs.current.delete(modelId);
                streamingContentRef.current.delete(modelId);
                streamingTimingRef.current.delete(modelId);
                syncStreamingState();
                completedCount++;
                if (completedCount === totalCount) setIsGenerating(false);
            }
        });

        await Promise.allSettled(streamPromises);
    }, [isGenerating, selectedModels, messages, modelMap, githubToken, uiBuilderEnabled, setMessages, setIsGenerating, syncStreamingState, getModelEndpoints, models]);

    const stopGeneration = useCallback(() => {
        abortRefs.current.forEach(c => c.abort());
        abortRefs.current.clear();
        setIsGenerating(false);
    }, [setIsGenerating]);

    const scroll = useCallback((deltaY: number) => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop -= deltaY;
        }
    }, []);

    useImperativeHandle(ref, () => ({
        sendMessage: handleSend,
        setInput: (text: string) => {
            if (inputRef.current) {
                inputRef.current.value = text;
                inputRef.current.focus();
            }
        },
        stopGeneration,
        scroll,
    }), [handleSend, stopGeneration, scroll]);

    const copyResponse = useCallback((idx: number) => {
        const msg = messages[idx];
        if (msg?.role === 'assistant') {
            navigator.clipboard.writeText(msg.content);
            setCopiedMessageId(idx);
            if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
            copyTimeoutRef.current = setTimeout(() => setCopiedMessageId(null), 2000);
        }
    }, [messages]);

    const handleGestureSelect = useCallback((value: string) => {
        handleSend(value, true);
    }, [handleSend]);

    const streamingEntries = useMemo(
        () => Array.from(streamingResponses.entries()),
        [streamingResponses]
    );

    return (
        <div className="flex flex-col h-full w-full relative">
            <div
                ref={scrollRef}
                data-no-arena-scroll
                className="flex-1 overflow-y-auto px-4 py-6 space-y-4 chat-scroll"
                style={{ paddingBottom: messages.length > 0 ? '160px' : '80px' }}
            >
                <div className="max-w-3xl mx-auto space-y-4">
                    {/* Empty state - centered vertically */}
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
                            {isMiddleFinger ? (
                                <div className="mb-2 relative">
                                    <div className="absolute inset-0 bg-red-500 blur-xl opacity-50 rounded-full" />
                                    <Bot size={72} className="relative text-red-500" />
                                    <div className="absolute -top-2 -right-2 text-3xl">💢</div>
                                </div>
                            ) : (
                                <Bot size={72} className="mb-2 text-slate-500 transition-all duration-300" />
                            )}
                            {githubUsername && (
                                <p className="text-slate-400 text-lg font-medium">Hey {githubUsername.split(' ')[0]}!</p>
                            )}
                            <p className="text-slate-500 text-sm">Select one or more models and start chatting</p>
                            <ModelTabs
                                models={models}
                                selectedModels={selectedModels}
                                onToggleModel={onToggleModel}
                                isGenerating={isGenerating}
                                githubToken={githubToken}
                                onConnectGitHub={onConnectGitHub}
                                dropDirection="down"
                            />
                        </div>
                    )}

                    {messages.map((msg, idx) => (
                        <ChatMessageItem
                            key={idx}
                            msg={msg}
                            idx={idx}
                            gesturesActive={gesturesActive}
                            uiBuilderEnabled={uiBuilderEnabled}
                            isCopied={copiedMessageId === idx}
                            onCopy={copyResponse}
                            onGestureSelect={handleGestureSelect}
                        />
                    ))}

                    {/* Streaming responses */}
                    {isGenerating && streamingEntries.map(([modelId, content]) => {
                        const model = modelMap.get(modelId);
                        const timing = streamingTiming.get(modelId);
                        return (
                            <div key={modelId} className="flex justify-start">
                                <div className="max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-3 bg-slate-800/60 border border-amber-500/30 text-slate-200">
                                    <div className="flex items-center gap-2 mb-1 text-[10px] font-bold uppercase tracking-wider text-amber-400/80">
                                        <div className="w-3 h-3 border-2 border-amber-400/50 border-t-amber-400 rounded-full animate-spin" />
                                        {model?.name || modelId}
                                    </div>
                                    <div className="prose prose-invert prose-sm max-w-none">
                                        <FormattedContent text={content || '...'} />
                                    </div>
                                    {timing && (
                                        <div className="mt-2 pt-2 border-t border-slate-700/30">
                                            <ExecutionTimeDisplay times={timing} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="fixed bottom-0 left-0 right-0 z-[99] flex flex-col items-center gap-2 px-4 pb-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
                <PromptInput
                    inputRef={inputRef}
                    inputFocused={inputFocused}
                    setInputFocused={setInputFocused}
                    onSendMessage={handleSend}
                    isGenerating={isGenerating || selectedModels.size === 0}
                    onStop={stopGeneration}
                    placeholder={selectedModels.size === 0 ? "Select a model above..." : "Type a message..."}
                    uiBuilderEnabled={uiBuilderEnabled}
                    onToggleUiBuilder={() => setUiBuilderEnabled(!uiBuilderEnabled)}
                />
            </div>
        </div>
    );
});

ChatView.displayName = 'ChatView';

export default ChatView;
