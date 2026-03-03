export interface ExecutionTimeData {
  startTime: number;
  firstTokenTime?: number;
  endTime?: number;
}

interface ExecutionTimeDisplayProps {
  times?: ExecutionTimeData;
  isFastestTTFT?: boolean;
  isFastestTotal?: boolean;
}

function formatTotalTime(totalSeconds: string | null, isStreaming: boolean): string {
  if (totalSeconds) return `${totalSeconds}s`;
  if (isStreaming) return '...';
  return '—';
}

export default function ExecutionTimeDisplay({ times, isFastestTTFT, isFastestTotal }: ExecutionTimeDisplayProps) {
  const hasStart = times?.startTime != null;
  const hasEnd = times?.endTime != null;
  const hasFirstToken = times?.firstTokenTime != null;

  const totalSeconds = hasStart && hasEnd
    ? ((times!.endTime! - times!.startTime) / 1000).toFixed(2)
    : null;

  const ttftSeconds = hasStart && hasFirstToken
    ? ((times!.firstTokenTime! - times!.startTime) / 1000).toFixed(2)
    : null;

  return (
    <div className="text-[10px] text-slate-500 flex items-center gap-2">
      <span
        className={isFastestTotal ? 'text-yellow-400/90 bg-yellow-500/10 px-1.5 py-0.5 rounded' : undefined}
        title={isFastestTotal ? 'Fastest' : undefined}
      >
        <span className={isFastestTotal ? undefined : 'text-slate-400'}>TIME</span>{' '}
        {formatTotalTime(totalSeconds, hasStart && !hasEnd)}
      </span>
      {ttftSeconds && (
        <span
          className={isFastestTTFT ? 'text-amber-400/90 bg-amber-500/10 px-1.5 py-0.5 rounded' : 'text-slate-600'}
          title={isFastestTTFT ? 'Fastest TTFT' : undefined}
        >
          TTFT {ttftSeconds}s
        </span>
      )}
    </div>
  );
}

