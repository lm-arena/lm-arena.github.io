import { useEffect, useState } from 'react';
import { BackgroundStyle } from '../types';
import { BG_STYLES } from '../constants';
import { connectGitHub, GitHubAuth } from '../utils/oauth';

type SettingsTab = 'appearance' | 'general';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  githubAuth: GitHubAuth | null;
  setGithubAuth: (auth: GitHubAuth | null) => void;
  bgStyle: BackgroundStyle;
  setBgStyle: (style: BackgroundStyle) => void;
  systemPrompt: string;
  setSystemPrompt: (prompt: string) => void;
  systemPromptEnabled: boolean;
  setSystemPromptEnabled: (enabled: boolean) => void;
}

// Display labels for background styles
const BG_LABELS: Record<BackgroundStyle, string> = {
  'dots-mesh': 'Dots Mesh',
  'dots': 'Dots',
  'dots-fade': 'Dots Fade',
  'grid': 'Grid',
  'mesh': 'Mesh',
  'animated-mesh': 'Animated',
  'none': 'Solid',
};

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'general',
    label: 'General',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
      </svg>
    ),
  },
];

export default function SettingsModal({
  open,
  onClose,
  githubAuth,
  setGithubAuth,
  bgStyle,
  setBgStyle,
  systemPrompt,
  setSystemPrompt,
  systemPromptEnabled,
  setSystemPromptEnabled,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [isConnecting, setIsConnecting] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setActiveTab('general');
      setOauthError(null);
    }
  }, [open]);

  const handleConnect = async () => {
    setIsConnecting(true);
    setOauthError(null);
    try {
      const auth = await connectGitHub();
      setGithubAuth(auth);
    } catch (err: any) {
      if (err.message !== 'OAuth flow cancelled') {
        setOauthError(err.message || 'Connection failed');
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    setGithubAuth(null);
  };

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-[120] flex items-center justify-center transition-all duration-200 ${activeTab === 'appearance' ? '' : 'bg-black/40 backdrop-blur-sm'}`}
      onClick={onClose}
    >
      <div
        className="w-[560px] max-w-[calc(100vw-2rem)] max-h-[90vh] overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/95 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/60 shrink-0">
          <h2 className="text-base font-semibold text-slate-100">Settings</h2>
          <button
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] w-10 h-10 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors active:scale-95"
            aria-label="Close settings"
          >
            <span className="text-2xl leading-none">×</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800/60 px-5 shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative ${activeTab === tab.id
                ? 'text-blue-400'
                : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              {tab.icon}
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t-full" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Appearance Tab */}
          {activeTab === 'appearance' && (
            <>
              {/* Background Style Section */}
              <div className="rounded-xl border border-slate-800/60 bg-slate-900/60 p-4">
                <h3 className="text-sm font-semibold text-slate-200 mb-1">Background Style</h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  Choose your preferred background pattern
                </p>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {BG_STYLES.map((style) => (
                    <button
                      key={style}
                      onClick={() => setBgStyle(style)}
                      className={`group flex flex-col items-center gap-1.5 p-2 rounded-lg transition-all ${bgStyle === style
                        ? 'bg-blue-500/20 border border-blue-500/50 ring-1 ring-blue-500/30'
                        : 'bg-slate-800/40 border border-slate-700/40 hover:bg-slate-800/60 hover:border-slate-600/50'
                        }`}
                      title={BG_LABELS[style]}
                    >
                      <div
                        className={`w-10 h-10 rounded-md overflow-hidden ${style === 'none' ? '' : `bg-${style}`
                          }`}
                        style={{ backgroundColor: '#0f172a' }}
                      />
                      <span
                        className={`text-[10px] font-medium truncate max-w-full ${bgStyle === style ? 'text-blue-300' : 'text-slate-400 group-hover:text-slate-300'
                          }`}
                      >
                        {BG_LABELS[style]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* General Tab */}
          {activeTab === 'general' && (
            <>
              {/* System Prompt Section */}
              <div className="rounded-xl border border-slate-800/60 bg-slate-900/60 p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-semibold text-slate-200">System Prompt</h3>
                  <button
                    onClick={() => setSystemPromptEnabled(!systemPromptEnabled)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${systemPromptEnabled ? 'bg-blue-500' : 'bg-slate-700'}`}
                    aria-checked={systemPromptEnabled}
                    role="switch"
                    aria-label="Enable system prompt"
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${systemPromptEnabled ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  Injected as the first message in every request. Disable for unmodified model behavior.
                </p>
                <textarea
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  disabled={!systemPromptEnabled}
                  placeholder="You are a helpful assistant..."
                  rows={5}
                  className={`w-full rounded-lg border px-3 py-2 text-sm font-mono resize-y transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500/50 ${systemPromptEnabled
                    ? 'bg-slate-800/60 border-slate-700/60 text-slate-200 placeholder-slate-500'
                    : 'bg-slate-800/30 border-slate-800/40 text-slate-500 placeholder-slate-600 cursor-not-allowed'
                  }`}
                />
              </div>

              {/* GitHub Connection Section */}
              <div className="rounded-xl border border-slate-800/60 bg-slate-900/60 p-4">
                <h3 className="text-sm font-semibold text-slate-200 mb-1">GitHub Connection</h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  Connect your GitHub account to use GitHub Models. Authentication required for API access.
                </p>

                {githubAuth ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                        <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm text-slate-200 font-medium">@{githubAuth.username}</p>
                        <p className="text-xs text-emerald-400">Connected</p>
                      </div>
                    </div>
                    <button
                      onClick={handleDisconnect}
                      className="px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg transition-colors"
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button
                      onClick={handleConnect}
                      disabled={isConnecting}
                      className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-sm font-medium text-white bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isConnecting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-slate-500 border-t-white rounded-full animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                          </svg>
                          Connect with GitHub
                        </>
                      )}
                    </button>
                    {oauthError && (
                      <p className="text-xs text-red-400">{oauthError}</p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
