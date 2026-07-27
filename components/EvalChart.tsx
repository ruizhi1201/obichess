'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { type AnalyzedMove, formatEval } from '@/lib/chess-utils';

interface EvalChartProps {
  moves: AnalyzedMove[];
  currentIndex: number;
  onSelectMove: (index: number) => void;
  whiteName?: string;
  blackName?: string;
}

interface ChartDataPoint {
  index: number;
  label: string;
  /** White's win percentage (0–100). 50 = equal, >50 = White better, <50 = Black better */
  winPercent: number;
  /** Data clipped to show only White advantage (>50 → value, ≤50 → 50) */
  whiteArea: number;
  /** Data clipped to show only Black advantage (<50 → value, ≥50 → 50) */
  blackArea: number;
  cp: number;
  mate: number | null;
  classification?: string;
  san: string;
}

function classificationDotColor(classification?: string): string {
  switch (classification) {
    case 'blunder':    return '#ef4444';
    case 'mistake':    return '#f97316';
    case 'inaccuracy': return '#fbbf24';
    case 'best':       return '#22c55e';
    case 'good':       return '#86efac';
    default:           return 'transparent';
  }
}

const CustomTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartDataPoint }>;
}) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;

  const evalStr = d.mate != null
    ? (d.mate > 0 ? `M${d.mate}` : `-M${Math.abs(d.mate)}`)
    : formatEval(d.cp);

  const classLabel: Record<string, string> = {
    best:       '✓ Best',
    good:       '✓ Good',
    inaccuracy: '?! Inaccuracy',
    mistake:    '? Mistake',
    blunder:    '?? Blunder',
  };

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="font-bold text-zinc-100 mb-0.5">{d.label} {d.san}</div>
      <div className="text-zinc-400">Eval: <span className="text-zinc-200 font-mono">{evalStr}</span></div>
      <div className="text-zinc-400">Win%: <span className="text-zinc-200">{d.winPercent.toFixed(1)}%</span></div>
      {d.classification && d.classification !== 'good' && (
        <div style={{ color: classificationDotColor(d.classification) }} className="font-semibold mt-0.5">
          {classLabel[d.classification] ?? d.classification}
        </div>
      )}
    </div>
  );
};

export default function EvalChart({ moves, currentIndex, onSelectMove, whiteName, blackName }: EvalChartProps) {
  if (!moves.length) return null;

  // Build chart data — each point is winPercentAfter from White's perspective
  // We split into two series: whiteArea (values ≥ 50) and blackArea (values ≤ 50)
  // This creates the two-tone Lichess-style chart
  const data: ChartDataPoint[] = moves.map((m, i) => {
    const winPercent = m.winPercentAfter ?? 50;
    const whiteArea = winPercent >= 50 ? winPercent : 50;
    const blackArea = winPercent <= 50 ? winPercent : 50;
    const cp = m.evalAfter ?? 0;
    const moveNum = Math.floor(i / 2) + 1;
    const label = m.color === 'w' ? `${moveNum}.` : `${moveNum}...`;
    return {
      index: i,
      label,
      winPercent,
      whiteArea,
      blackArea,
      cp,
      mate: m.mate ?? null,
      classification: m.classification,
      san: m.san,
    };
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleClick = (chartData: any) => {
    const point = chartData?.activePayload?.[0]?.payload as ChartDataPoint | undefined;
    if (point) onSelectMove(point.index);
  };

  return (
    <div className="w-full bg-[#1a1a1a] rounded overflow-hidden">
      {/* Player names */}
      <div className="flex justify-between px-2 pt-1 text-[10px]">
        <span className="text-zinc-300">♔ {whiteName || 'White'}</span>
        <span className="text-zinc-300">♚ {blackName || 'Black'}</span>
      </div>

      <ResponsiveContainer width="100%" height={100}>
        <AreaChart
          data={data}
          margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
          onClick={handleClick}
          style={{ cursor: 'pointer' }}
        >
          <defs>
            {/* White advantage gradient (above 50%) */}
            <linearGradient id="whiteAdv" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity={0.95} />
              <stop offset="100%" stopColor="#d4d4d4" stopOpacity={0.3} />
            </linearGradient>
            {/* Black advantage gradient (below 50%) */}
            <linearGradient id="blackAdv" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#1a1a1a" stopOpacity={0.95} />
              <stop offset="100%" stopColor="#52525b" stopOpacity={0.4} />
            </linearGradient>
          </defs>

          <YAxis domain={[0, 100]} hide />
          <XAxis dataKey="index" hide />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ stroke: '#666', strokeWidth: 1 }}
          />
          <ReferenceLine y={50} stroke="#555" strokeWidth={1} />

          {/* White advantage area (above 50% line) */}
          <Area
            type="monotone"
            dataKey="whiteArea"
            stroke="#bbbbbb"
            strokeWidth={1}
            fill="url(#whiteAdv)"
            baseValue={50}
            isAnimationActive={false}
            dot={false}
          />

          {/* Black advantage area (below 50% line) */}
          <Area
            type="monotone"
            dataKey="blackArea"
            stroke="#666666"
            strokeWidth={1}
            fill="url(#blackAdv)"
            baseValue={50}
            isAnimationActive={false}
            dot={false}
          />

          {/* Current position indicator */}
          {data[currentIndex] && (
            <ReferenceLine
              x={currentIndex}
              stroke="#fbbf24"
              strokeWidth={2}
              strokeDasharray="3 3"
            />
          )}
        </AreaChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex items-center gap-3 px-2 pb-1 text-[9px] text-zinc-500">
        <span><span style={{ color: '#22c55e' }}>●</span> Best</span>
        <span><span style={{ color: '#fbbf24' }}>●</span> Inaccuracy</span>
        <span><span style={{ color: '#f97316' }}>●</span> Mistake</span>
        <span><span style={{ color: '#ef4444' }}>●</span> Blunder</span>
      </div>
    </div>
  );
}