import { useEffect, useRef } from 'react';
import { Model, ChatHistoryEntry, Mode } from '../types';
import FormattedContent from './FormattedContent';
import { MessageSquare, RotateCcw } from 'lucide-react';
import { MODE_EXAMPLE_PROMPTS } from '../constants';

interface DiscussionTranscriptProps {
    history: ChatHistoryEntry[];
    models: Model[];
    mode?: Mode;
    onSelectPrompt?: (prompt: string) => void;
    onNewSession?: () => void;
    className?: string; // For layout positioning
    // Stage indicator props
    phaseLabel?: string | null;
    isGenerating?: boolean;
    isSynthesizing?: boolean;
    speakingCount?: number;
    totalParticipants?: number;
}

export default function DiscussionTranscript({
    history,
    models,
    mode,
    onSelectPrompt,
    onNewSession,
    className = '',
    phaseLabel,
    isGenerating,
    isSynthesizing,
    speakingCount = 0,
    totalParticipants = 0,
}: DiscussionTranscriptProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    // Get example prompts for current mode
    const examplePrompts = (mode ? MODE_EXAMPLE_PROMPTS[mode] : null) ?? [];

    // Auto-scroll to bottom when history changes
    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [history.length, history[history.length - 1]?.content]);

    // Helper to find model by name (from the formatted string)
    const getModelByName = (name: string) => {
        return models.find(m => m.name === name); // Simple match
    };

    // Determine stage display
    const isActive = isGenerating || isSynthesizing;
    const completedCount = totalParticipants - speakingCount;
    const progressPercent = totalParticipants > 0 ? (completedCount / totalParticipants) * 100 : 0;

    const renderEntry = (entry: ChatHistoryEntry, index: number) => {
        if (entry.role === 'user') {
            return (
                <div key={index} className="flex justify-end mb-6">
                    <div className="max-w-[85%] bg-blue-600/20 border border-blue-500/30 rounded-2xl rounded-tr-sm px-4 py-3 text-slate-100">
                        <div className="text-[10px] text-blue-300 uppercase tracking-wider mb-1 font-bold text-right">You</div>
                        <div className="whitespace-pre-wrap text-sm">{entry.content}</div>
                    </div>
                </div>
            );
        }

        // Handle Assistant / System messages based on 'kind'
        const isChairman = entry.kind === 'analyze_synthesis'
            || entry.kind === 'compare_summary';

        if (isChairman) {
            let name = 'Analysis';
            let text = entry.content;

            if (entry.kind === 'compare_summary') {
                name = 'Summary';
            } else if (entry.kind === 'analyze_synthesis') {
                name = 'Analysis';
            }

            return (
                <div key={index} className="flex justify-center mb-6">
                    <div className="max-w-[90%] w-full bg-slate-800/40 border border-slate-700/50 rounded-xl px-4 py-3">
                        <div className="flex items-center gap-2 mb-2 justify-center">
                            <span className="text-[10px] uppercase tracking-widest text-orange-400 font-bold">
                                {name}
                            </span>
                            <div className="h-px flex-1 bg-slate-700/50"></div>
                        </div>
                        <div className="text-slate-300 text-sm italic text-center">
                            <FormattedContent text={text} showThinking={false} />
                        </div>
                    </div>
                </div>
            );
        }

        // Handle Model Turns (Name:\nContent)
        if (entry.kind === 'analyze_response' || entry.kind === 'debate_turn') {
            // Expected format: "Name [· Round X]:\nContent"
            const firstLineEnd = entry.content.indexOf('\n');
            let header = 'Model';
            let body = entry.content;

            if (firstLineEnd !== -1) {
                header = entry.content.slice(0, firstLineEnd).trim();
                body = entry.content.slice(firstLineEnd + 1).trim();
            }

            // Try to extract pure name for color lookup
            // Remove " · Round X" etc.
            const cleanName = header.split('·')[0].split(':')[0].trim();
            const model = getModelByName(cleanName);
            const color = model?.color || '#94a3b8'; // slate-400 fallback

            return (
                <div key={index} className="flex flex-col items-start mb-6 max-w-[90%]">
                    <div className="flex items-center gap-2 mb-1 pl-1">
                        <div
                            className="w-4 h-4 rounded-full border border-white/10 shadow-sm"
                            style={{ backgroundColor: color }}
                        />
                        <span className="text-xs font-bold text-slate-300">{header.replace(':', '')}</span>
                    </div>
                    <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl rounded-tl-sm px-4 py-3 text-slate-200 w-full">
                        <FormattedContent text={body} showThinking={false} />
                    </div>
                </div>
            );
        }

        // Fallback for standard assistant messages (Compare mode normal replies, though they are usually not in history list effectively in this app's current flow, user only sees latest)
        // But if we do show generic history:
        return (
            <div key={index} className="flex items-start mb-6">
                <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-tl-sm px-4 py-3 text-slate-200">
                    <FormattedContent text={entry.content} />
                </div>
            </div>
        );
    };

    return (
        <div
            ref={containerRef}
            className={`flex-1 overflow-y-auto px-4 py-6 scroll-smooth ${className} [mask-image:linear-gradient(to_bottom,transparent_0%,black_2rem,black_100%)]`}
            data-no-arena-scroll // Prevent arena scroll capture
        >
            {/* Stage Indicator Banner */}
            {isActive && phaseLabel && (
                <div className="sticky top-0 z-10 mb-4">
                    <div
                        className={`px-4 py-3 rounded-xl backdrop-blur-md transition-all duration-300 ${isSynthesizing
                            ? 'bg-yellow-500/20 border border-yellow-500/40'
                            : 'bg-slate-800/80 border border-slate-700/60'
                            }`}
                    >
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                {/* Animated indicator */}
                                <div className={`w-2 h-2 rounded-full ${isSynthesizing ? 'bg-yellow-400' : 'bg-blue-400'} animate-pulse`}></div>
                                <span className={`text-xs font-semibold uppercase tracking-wider ${isSynthesizing ? 'text-yellow-300' : 'text-slate-300'}`}>
                                    {phaseLabel}
                                </span>
                            </div>

                            {/* Progress indicator - only show during response gathering */}
                            {isGenerating && !isSynthesizing && totalParticipants > 0 && (
                                <div className="flex items-center gap-2">
                                    <div className="w-24 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-blue-400 transition-all duration-300 rounded-full"
                                            style={{ width: `${progressPercent}%` }}
                                        />
                                    </div>
                                    <span className="text-[10px] text-slate-400 tabular-nums">
                                        {completedCount}/{totalParticipants}
                                    </span>
                                </div>
                            )}

                            {/* Synthesizing spinner */}
                            {isSynthesizing && (
                                <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-yellow-400 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                    </svg>
                                    <span className="text-[10px] text-yellow-300">Working...</span>
                                </div>
                            )}
                        </div>
                    </div>
                    {/* Gradient fade below banner */}
                    <div
                        className="pointer-events-none"
                        style={{
                            height: '24px',
                            marginTop: '-4px',
                            background: 'linear-gradient(to bottom, rgba(15, 23, 42, 0.6), transparent)',
                        }}
                    />
                </div>
            )}

            {/* Add spacer when banner is active to ensure content starts at appropriate level */}
            <div className={`max-w-3xl mx-auto flex flex-col ${history.length > 0 ? 'justify-start' : 'justify-end'} min-h-full`}>
                {history.length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-500 pb-20">
                        <MessageSquare size={48} className="mb-4 opacity-50" />
                        <p className="text-lg mb-8 opacity-50">Start a discussion to see the transcript.</p>

                        {examplePrompts.length > 0 && onSelectPrompt && (
                            <div className="flex flex-col gap-3 w-full items-center">
                                <p className="text-sm text-slate-400 text-center mb-2">Try an example:</p>
                                {examplePrompts.map((example, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => onSelectPrompt(example)}
                                        className="w-[85%] max-w-[340px] text-sm text-slate-300 hover:text-blue-400 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/40 hover:border-blue-400/40 rounded-xl px-5 py-3 transition-all active:scale-[0.98] text-left"
                                    >
                                        {example}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                {history.map(renderEntry)}

                {/* New Round button - shown when session is complete */}
                {history.length > 0 && !isGenerating && !isSynthesizing && onNewSession && (
                    <div className="flex justify-center py-8">
                        <button
                            onClick={onNewSession}
                            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700/50 hover:border-slate-600 rounded-full transition-all active:scale-[0.97] shadow-lg shadow-black/20"
                        >
                            <RotateCcw size={16} />
                            New Round
                        </button>
                    </div>
                )}

                <div ref={bottomRef} />
            </div>
        </div>
    );
}

