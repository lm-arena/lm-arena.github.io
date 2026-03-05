import { useState, useEffect, useRef } from 'react';
import { Mode } from '../types';

interface HeaderProps {
  mode: Mode;
  setMode: (mode: Mode) => void;
  setHoveredCard: (hovered: string | null) => void;
  clearSelection: () => void;
  showDock: boolean;
  setShowDock: (show: boolean) => void;
  onOpenSettings: () => void;
  gestureButtonSlot?: React.ReactNode;
  isAuthenticated?: boolean;
}

// Icons for each mode
const ModeIcons: Record<Mode, React.ReactNode> = {
  chat: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  compare: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
    </svg>
  ),
  analyze: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  debate: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
    </svg>
  ),
};

const MODES: { value: Mode; label: string }[] = [
  { value: 'chat', label: 'Chat' },
  { value: 'compare', label: 'Compare' },
  { value: 'analyze', label: 'Analyze' },
  { value: 'debate', label: 'Debate' }
];

export default function Header({
  mode,
  setMode,
  setHoveredCard,
  clearSelection,
  showDock,
  setShowDock,
  onOpenSettings,
  gestureButtonSlot,
  isAuthenticated,
}: HeaderProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const [isLargeScreen, setIsLargeScreen] = useState(true);
  const trackRef = useRef<HTMLDivElement>(null);
  const [sliderWidth, setSliderWidth] = useState<number | null>(null);
  const [sliderLeft, setSliderLeft] = useState<number>(0);

  const currentModeIndex = MODES.findIndex(m => m.value === mode);
  const safeIndex = currentModeIndex === -1 ? 0 : currentModeIndex;
  const currentModeLabel = MODES[safeIndex].label;

  // Track window size for responsive slider calculation
  useEffect(() => {
    const checkSize = () => {
      setIsLargeScreen(window.innerWidth >= 1024);
    };
    checkSize();
    window.addEventListener('resize', checkSize);
    return () => window.removeEventListener('resize', checkSize);
  }, []);

  // Calculate slider position based on actual button widths
  useEffect(() => {
    if (!trackRef.current) return;

    const updateSliderPosition = () => {
      const track = trackRef.current;
      if (!track) return;

      const buttons = track.querySelectorAll('button[role="radio"]');
      if (buttons.length === 0 || safeIndex >= buttons.length) return;

      const activeButton = buttons[safeIndex] as HTMLElement;
      const buttonRect = activeButton.getBoundingClientRect();
      const trackRect = track.getBoundingClientRect();

      const buttonWidth = buttonRect.width;
      const buttonLeft = buttonRect.left;
      const trackLeft = trackRect.left;

      // Calculate position relative to track (buttons are already positioned accounting for track padding)
      setSliderWidth(buttonWidth);
      setSliderLeft(buttonLeft - trackLeft);
    };

    // Small delay to ensure DOM is updated
    const timeoutId = setTimeout(updateSliderPosition, 0);

    // Update on resize
    const resizeObserver = new ResizeObserver(() => {
      setTimeout(updateSliderPosition, 0);
    });
    resizeObserver.observe(trackRef.current);

    // Also listen to window resize for breakpoint changes
    window.addEventListener('resize', updateSliderPosition);

    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateSliderPosition);
    };
  }, [mode, isLargeScreen, safeIndex]);

  // Close mobile menu on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    }
    if (isMobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMobileMenuOpen]);

  const handleModeSelect = (newMode: Mode) => {
    setMode(newMode);
    setHoveredCard(null);
    clearSelection();
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="fixed top-0 left-0 right-0 flex items-center justify-between mb-2 px-3 sm:px-6 pt-4 sm:pt-6 z-50 pointer-events-none transition-all duration-300">
      {/* Left: Gesture */}
      <div className="flex items-center gap-2 w-auto pointer-events-auto z-20">
        {gestureButtonSlot}
      </div>

      {/* Center: Desktop Unified Title & Mode Toggle - centered within the dotted background area */}
      <div className="hidden md:block absolute left-1/2 -translate-x-1/2 pointer-events-auto z-20">
        <div className="relative">
          <div className="flex items-center p-1.5 rounded-xl border border-slate-700/40 header-shell">
            {/* Menu Icon */}
            <button
              onClick={() => setShowDock(!showDock)}
              className="px-2 sm:px-3 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
              title="Toggle Model Dock"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Divider */}
            <div className="w-px h-5 bg-slate-700/50 mx-0.5 sm:mx-1"></div>

            {/* Mode Toggle Track */}
            <div
              ref={trackRef}
              className="relative flex p-1 rounded-lg bg-black/20 mode-track"
              role="radiogroup"
              aria-label="Mode selection"
              data-gesture-mode-track="true"
            >
              {/* Sliding indicator */}
              <div
                className="absolute top-1 bottom-1 rounded-md transition-all duration-300 ease-out mode-slider"
                style={{
                  width: sliderWidth !== null ? `${sliderWidth}px` : `calc((100% - 8px) / ${MODES.length})`,
                  left: sliderWidth !== null ? `${sliderLeft}px` : `calc(4px + (100% - 8px) * ${safeIndex} / ${MODES.length})`
                }}
              />
              {MODES.map(m => (
                <button
                  key={m.value}
                  tabIndex={-1}
                  onClick={() => handleModeSelect(m.value)}
                  role="radio"
                  aria-checked={mode === m.value}
                  aria-label={m.label}
                  title={m.label}
                  className={`relative z-10 py-2 sm:py-1.5 px-3 text-[11px] sm:text-xs font-medium transition-colors duration-200 min-h-[44px] sm:min-h-0 active:scale-95 focus:outline-none focus-visible:outline-none flex-1 flex items-center justify-center text-center ${mode === m.value
                    ? 'text-white'
                    : 'text-slate-400 hover:text-slate-200'
                    }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Center: Mobile Mode Dropdown */}
      <div className="flex md:hidden flex-1 justify-center pointer-events-auto relative z-20">
        <div className="relative" ref={mobileMenuRef}>
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/90 border border-slate-700/50 text-slate-200 font-medium text-sm backdrop-blur-md shadow-lg active:scale-95 transition-all"
          >
            <span className="font-bold text-slate-400 hidden xs:inline">Arena</span>
            <span className="font-bold hidden xs:inline text-slate-600">/</span>
            <span>{currentModeLabel}</span>
            <svg
              className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isMobileMenuOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Mobile Dropdown Menu */}
          {isMobileMenuOpen && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 py-1 rounded-xl bg-slate-800 border border-slate-700 shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100 origin-top">
              {MODES.map(m => (
                <button
                  key={m.value}
                  onClick={() => handleModeSelect(m.value)}
                  className={`px-4 py-3 text-sm text-left w-full transition-colors flex items-center gap-3 ${mode === m.value
                    ? 'bg-blue-500/10 text-blue-400'
                    : 'text-slate-300 hover:bg-slate-700/50'
                    }`}
                >
                  <span className="flex-shrink-0">{ModeIcons[m.value]}</span>
                  <span className="flex-1">{m.label}</span>
                  {mode === m.value && (
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: Admin + Settings */}
      <div className="flex items-center gap-2 w-auto justify-end pointer-events-auto z-20">
        {isAuthenticated && (
          <a
            href="/admin.html"
            className="min-w-[42px] min-h-[42px] w-[42px] h-[42px] rounded-full bg-slate-800/50 flex items-center justify-center border border-slate-700/50 hover:border-slate-600 transition-colors"
            title="Admin"
          >
            <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2a5 5 0 1 0 0 10A5 5 0 0 0 12 2z" />
              <path d="M19 21a7 7 0 1 0-14 0" />
            </svg>
          </a>
        )}
        <button
          onClick={onOpenSettings}
          className="min-w-[42px] min-h-[42px] w-[42px] h-[42px] rounded-full bg-slate-800/50 flex items-center justify-center border border-slate-700/50 hover:border-slate-600 transition-colors active:scale-95 focus:outline-none focus-visible:outline-none"
          title="Settings"
        >
          <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
