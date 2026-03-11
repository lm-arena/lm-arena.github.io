import { useState, useEffect, Dispatch, SetStateAction, MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import { Zap } from 'lucide-react';
import StatusIndicator from '../StatusIndicator';
import Typewriter from '../Typewriter';
import type { Model, Mode } from '../../types';
import { type OrchestratorAutoScope, type StatusState, getStatusLabel } from './ArenaCanvas';
import { SVG_SENTINEL_PREFIX, SVG_SENTINEL_SUFFIX } from '../../hooks/useSessionController';

interface OrchestratorCardProps {
  mode: Mode;
  layoutRadius: number;
  moderatorModel: Model;
  moderatorId: string;
  orchestratorTransform: string;
  orchestratorStatus: StatusState;
  moderatorSynthesis: string;
  isSynthesizing: boolean;
  isGenerating: boolean;
  phaseLabel: string | null;
  speaking: Set<string>;
  hoveredCard: string | null;
  setHoveredCard: (value: string | null) => void;
  setSelectedCardIds: Dispatch<SetStateAction<Set<string>>>;
  lastSelectedCardRef: MutableRefObject<string | null>;
  orchestratorAutoMode: boolean;
  orchestratorAutoScope: OrchestratorAutoScope;
  showOrchestratorMenu: boolean;
  setShowOrchestratorMenu: Dispatch<SetStateAction<boolean>>;
  setOrchestratorAutoMode: Dispatch<SetStateAction<boolean>>;
  setOrchestratorAutoScope: Dispatch<SetStateAction<OrchestratorAutoScope>>;
  orchestratorMenuRef: MutableRefObject<HTMLDivElement | null>;
  availableModels: Model[];
  setModerator: (id: string) => void;
  getTailSnippet: (text: string, maxChars?: number) => string;
}

const CIRCLE_CARD_SIZE = 96;

export function OrchestratorCard({
  mode,
  layoutRadius,
  moderatorModel,
  moderatorId,
  orchestratorTransform,
  orchestratorStatus,
  moderatorSynthesis,
  isSynthesizing,
  isGenerating,
  phaseLabel,
  speaking,
  hoveredCard,
  setHoveredCard,
  setSelectedCardIds,
  lastSelectedCardRef,
  orchestratorAutoMode,
  orchestratorAutoScope,
  showOrchestratorMenu,
  setShowOrchestratorMenu,
  setOrchestratorAutoMode,
  setOrchestratorAutoScope,
  orchestratorMenuRef,
  availableModels,
  setModerator,
  getTailSnippet,
}: OrchestratorCardProps) {
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const orchestratorStatusLabel = getStatusLabel(orchestratorStatus);
  const orchestratorPhaseLabel = phaseLabel || '';

  useEffect(() => {
    if (!showOrchestratorMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (orchestratorMenuRef.current && !orchestratorMenuRef.current.contains(e.target as Node)) {
        setShowOrchestratorMenu(false);
        setMenuPosition(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, [showOrchestratorMenu, orchestratorMenuRef, setShowOrchestratorMenu]);

  const renderModeratorContent = () => {
    if (moderatorSynthesis) {
      if (isSynthesizing && moderatorId && speaking.has(moderatorId)) {
        return <Typewriter text={moderatorSynthesis} speed={20} />;
      }
      return getTailSnippet(moderatorSynthesis);
    }

    if (isSynthesizing) {
      return <span className="text-slate-500 italic">Synthesizing responses...</span>;
    }

    if (isGenerating) {
      if (phaseLabel?.startsWith(SVG_SENTINEL_PREFIX)) {
        // Strip sentinel markers; the remaining string is trusted SVG icon + escaped text.
        const inner = phaseLabel
          .slice(SVG_SENTINEL_PREFIX.length)
          .replace(SVG_SENTINEL_SUFFIX, '');
        return <span className="text-slate-500 italic" dangerouslySetInnerHTML={{ __html: inner }} />;
      }
      const label = phaseLabel === 'Stage 1 · Responses' ? 'Waiting for model responses...' : (phaseLabel || 'Orchestrating...');
      return <span className="text-slate-500 italic">{label}</span>;
    }

    return <span className="text-slate-500 italic">Send a prompt to see the synthesis.</span>;
  };

  const isWorking = orchestratorStatus === 'responding';
  const activeColor = isWorking ? '#fbbf24' : moderatorModel.color;
  const githubModels = availableModels.filter(m => m.type === 'github');
  const selfHostedModels = availableModels.filter(m => m.type === 'self-hosted');

  return (
    <div
      data-card
      className="absolute z-20 transition-all duration-700 ease-out cursor-pointer"
      style={{
        opacity: 1,
        transform: orchestratorTransform,
        left: '50%',
        top: mode === 'analyze' ? `calc(50% + ${layoutRadius}px - 64px)` : '50%',
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (moderatorId) {
          setSelectedCardIds(new Set([moderatorId]));
          lastSelectedCardRef.current = moderatorId;
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (showOrchestratorMenu) {
          setShowOrchestratorMenu(false);
          setMenuPosition(null);
        } else {
          setMenuPosition({ x: e.clientX, y: e.clientY });
          setShowOrchestratorMenu(true);
        }
      }}
      onMouseEnter={() => setHoveredCard('moderator')}
      onMouseLeave={() => setHoveredCard(null)}
    >
      <div className="relative flex items-center justify-center" style={{ width: `${CIRCLE_CARD_SIZE}px`, height: `${CIRCLE_CARD_SIZE}px` }}>
        <div
          className="absolute inset-0 rounded-full animate-pulse"
          style={{
            background: `radial-gradient(circle, ${activeColor}20 0%, transparent 70%)`,
            transform: 'scale(2.2)',
            filter: 'blur(18px)'
          }}
        />

        <div
          className="relative rounded-full flex items-center justify-center transition-all duration-300"
          style={{
            width: `${CIRCLE_CARD_SIZE}px`,
            height: `${CIRCLE_CARD_SIZE}px`,
            background: isWorking
              ? 'linear-gradient(135deg, rgba(251, 191, 36, 0.08), rgba(15, 23, 42, 0.9))'
              : 'rgba(15, 23, 42, 0.9)',
            backdropFilter: 'blur(16px)',
            border: `2px solid ${activeColor}${isWorking ? '99' : '60'}`,
            boxShadow: `0 0 36px ${activeColor}${isWorking ? '40' : '28'}, inset 0 1px 1px rgba(255,255,255,0.1)`
          }}
        >
          <div
            className="absolute inset-[-4px] rounded-full"
            style={{
              background: `conic-gradient(from 0deg, transparent, ${activeColor}60, transparent)`,
              animation: 'spin 4s linear infinite'
            }}
          />
          <div className="absolute inset-[2px] rounded-full" style={{ background: 'rgba(15, 23, 42, 0.96)' }} />

          <div className="relative text-center z-10 flex flex-col items-center gap-1.5 px-3">
            <div className="text-[7px] tracking-[0.32em] text-slate-400 uppercase">{orchestratorStatusLabel}</div>
            <div className="text-[10px] font-semibold text-slate-100 leading-tight">
              {moderatorModel.name}
            </div>
            <StatusIndicator
              state={orchestratorStatus}
              color={activeColor}
              size={12}
            />
          </div>
        </div>
      </div>

      <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 w-max max-w-[200px]" style={{ top: 'calc(100% + 12px)' }}>
        <span className="text-[10px] text-slate-500">{orchestratorPhaseLabel}</span>
      </div>

      {hoveredCard === 'moderator' && !showOrchestratorMenu && (
        <div
          data-card
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 w-80 max-w-[calc(100vw-2rem)] p-4 rounded-xl z-[200] transition-all duration-300"
          style={{
            background: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(16px)',
            border: `1px solid ${activeColor}40`,
            boxShadow: `0 20px 40px rgba(0,0,0,0.5), 0 0 30px ${activeColor}20`
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="text-xs text-slate-400 uppercase tracking-wider">Orchestrator</div>
            <span className="text-xs text-slate-500">·</span>
            <span className="text-xs font-medium text-slate-300">{moderatorModel.name}</span>
            {isWorking && (
              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                Working
              </span>
            )}
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            {renderModeratorContent()}
          </p>
        </div>
      )}

      {showOrchestratorMenu && menuPosition && createPortal(
        <div
          ref={orchestratorMenuRef}
          className="w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden"
          style={{
            position: 'fixed',
            top: `${menuPosition.y}px`,
            left: `${menuPosition.x}px`,
            transform: 'translateY(-50%)',
            zIndex: 9999,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {orchestratorAutoMode ? (
            <>
              <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-700/50">
                Auto Mode: {orchestratorAutoScope === 'self-hosted' ? 'SELF-HOSTED' : orchestratorAutoScope.toUpperCase()}
              </div>
              {(['all', 'self-hosted', 'api'] as OrchestratorAutoScope[]).map(scope => (
                <button
                  key={scope}
                  onClick={() => {
                    setOrchestratorAutoScope(scope);
                    setShowOrchestratorMenu(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-xs font-medium transition-colors ${orchestratorAutoScope === scope
                    ? 'bg-yellow-500/20 text-yellow-300'
                    : 'text-slate-300 hover:bg-slate-700/50'
                    }`}
                >
                  {scope === 'all' && 'All'}
                  {scope === 'self-hosted' && 'Self-hosted'}
                  {scope === 'api' && 'API'}
                  <span className="text-[10px] text-slate-500 ml-1">
                    {scope === 'all' && '(self-hosted → API)'}
                    {scope === 'self-hosted' && '(no quota)'}
                    {scope === 'api' && '(cloud only)'}
                  </span>
                </button>
              ))}
              <div className="border-t border-slate-700">
                <button
                  onClick={() => {
                    setOrchestratorAutoMode(false);
                    setShowOrchestratorMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-medium text-slate-400 hover:bg-slate-700/50 transition-colors"
                >
                  Manual Mode
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-700/50">
                Select Orchestrator
              </div>
              {githubModels.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[9px] uppercase tracking-wider text-slate-600 font-semibold">
                    GitHub Models
                  </div>
                  {githubModels.map(model => (
                    <button
                      key={model.id}
                      onClick={() => {
                        setModerator(model.id);
                        setShowOrchestratorMenu(false);
                      }}
                      className={`w-full px-4 py-2 text-left text-xs font-medium transition-colors ${moderatorId === model.id
                        ? 'bg-blue-500/20 text-blue-300'
                        : 'text-slate-300 hover:bg-slate-700/50'
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{model.name}</span>
                        {moderatorId === model.id && (
                          <span className="text-blue-400">✓</span>
                        )}
                      </div>
                    </button>
                  ))}
                </>
              )}
              {selfHostedModels.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[9px] uppercase tracking-wider text-slate-600 font-semibold border-t border-slate-700/50 mt-1">
                    Self-Hosted Models
                  </div>
                  {selfHostedModels.map(model => (
                    <button
                      key={model.id}
                      onClick={() => {
                        setModerator(model.id);
                        setShowOrchestratorMenu(false);
                      }}
                      className={`w-full px-4 py-2 text-left text-xs font-medium transition-colors ${moderatorId === model.id
                        ? 'bg-blue-500/20 text-blue-300'
                        : 'text-slate-300 hover:bg-slate-700/50'
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{model.name}</span>
                        {moderatorId === model.id && (
                          <span className="text-blue-400">✓</span>
                        )}
                      </div>
                    </button>
                  ))}
                </>
              )}
              <div className="border-t border-slate-700">
                <button
                  onClick={() => {
                    setOrchestratorAutoMode(true);
                    setShowOrchestratorMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-medium text-yellow-400 hover:bg-slate-700/50 transition-colors flex items-center gap-2"
                >
                  <Zap size={12} />
                  <span>Enable Auto Mode</span>
                </button>
              </div>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
