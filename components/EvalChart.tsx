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

// ── Constants (matches Lichess) ───────────────────────

/** Lichess winning chances formula */
const MULTIPLIER = -0.00368208;
function cpToWinningChances(cp: number): number {
  const clamped = Math.min(Math.max(-1000, cp), 1000);
  return 2 / (1 + Math.exp(MULTIPLIER * clamped)) - 1;
}

function mateToWinningChances(mate: number): number {
  const cp = (21 - Math.min(10, Math.abs(mate))) * 100;
  return cpToWinningChances(mate > 0 ? cp : -cp);
}

/** Lichess chart domain — symmetric around 0 */
const Y_MAX = 1.05;
const Y_MIN = -1.05;

// ── Props ─────────────────────────────────────────────

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
  /** White's winning chances: +1 = White wins, -1 = Black wins, 0 = equal */
  winningChances: number;
  /** Only values >= 0 (for white-area fill above center) */
  whiteArea: number;
  /** Only values <= 0 (for black-area fill below center) */
  blackArea: number;
  cp: number;
  mate: number | null;
  classification?: string;
  san: string;
}

// ── Helpers ───────────────────────────────────────────

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
    best:       'Best',
    good:       'Good',
    inaccuracy: 'Inaccuracy',
    mistake:    'Mistake',
    blunder:    'Blunder',
  };

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="font-bold text-zinc-100 mb-0.5">{d.label} {d.san}</div>
      <div className="text-zinc-400">
        Eval: <span className="text-zinc-200 font-mono">{evalStr}</span>
      </div>
      {d.classification && d.classification !== 'good' && (
        <div style={{ color: classificationDotColor(d.classification) }} className="font-semibold mt-0.5">
          {classLabel[d.classification] ?? d.classification}
        </div>
      )}
    </div>
  );
};

// ── Component ─────────────────────────────────────────

export default function EvalChart({ moves, currentIndex, onSelectMove, whiteName, blackName }: EvalChartProps) {
  if (!moves.length) return null;

  // Build one data point per half-move (like Lichess: mainline.slice(1))
  // Each point represents the evaluation AFTER that move was played,
  // always from White's perspective
  const data: ChartDataPoint[] = moves.map((m, i) => {
    const moveNum = Math.floor(i / 2) + 1;
    const label = m.color === 'w' ? `${moveNum}.` : `${moveNum}...`;

    // Compute winning chances (White's perspective)
    let winningChances: number;
    if (m.mate != null) {
      winningChances = mateToWinningChances(m.mate);
    } else {
      const cp = m.evalAfter ?? 0;
      winningChances = cpToWinningChances(cp);
    }

    // Split into two series for two-tone fill
    // whiteArea: values >= 0 → fills above center (White advantage)
    // blackArea: values <= 0 → fills below center (Black advantage)
    const whiteArea = winningChances >= 0 ? winningChances : 0;
    const blackArea = winningChances <= 0 ? winningChances : 0;

    return {
      index: i,
      label,
      winningChances,
      whiteArea,
      blackArea,
      cp: m.evalAfter ?? 0,
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

  const inRange = currentIndex >= 0 && currentIndex < data.length;

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
          margin={{ top: 2, right: 0, left: 0, bottom: 0 }}
          onClick={handleClick}
          style={{ cursor: 'pointer' }}
        >
          <defs>
            <linearGradient id="whiteFillGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity={0.8} />
              <stop offset="100%" stopColor="#ffffff" stopOpacity={0.15} />
            </linearGradient>
            <linearGradient id="blackFillGrad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#000000" stopOpacity={1} />
              <stop offset="100%" stopColor="#000000" stopOpacity={0.15} />
            </linearGradient>
          </defs>

          {/* Y-axis: symmetric ±1.05 like Lichess, hidden ticks */}
          <YAxis domain={[Y_MIN, Y_MAX]} hide />
          <XAxis dataKey="index" hide />

          <Tooltip
            content={<CustomTooltip />}
            cursor={{ stroke: '#666', strokeWidth: 1 }}
          />

          {/* Center line at y=0 (equal position) */}
          <ReferenceLine y={0} stroke="#555" strokeWidth={1} />

          {/* White advantage fill (above center) — baseValue=0, only draws when whiteArea > 0 */}
          <Area
            type="monotone"
            dataKey="whiteArea"
            stroke="#bbbbbb"
            strokeWidth={0.5}
            fill="url(#whiteFillGrad)"
            baseValue={0}
            isAnimationActive={false}
            dot={false}
          />

          {/* Black advantage fill (below center) — baseValue=0, only draws when blackArea < 0 */}
          <Area
            type="monotone"
            dataKey="blackArea"
            stroke="#666666"
            strokeWidth={0.5}
            fill="url(#blackFillGrad)"
            baseValue={0}
            isAnimationActive={false}
            dot={false}
          />

          {/* Current position indicator (orange dashed line) */}
          {inRange && (
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