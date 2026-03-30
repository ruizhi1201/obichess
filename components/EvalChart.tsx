'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
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
  winPercent: number;
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

// Custom dot that shows classification color on notable moves
const ClassificationDot = (props: {
  cx?: number;
  cy?: number;
  payload?: ChartDataPoint;
  currentIndex?: number;
}) => {
  const { cx, cy, payload, currentIndex } = props;
  if (cx === undefined || cy === undefined || !payload) return null;

  const isActive = payload.index === currentIndex;
  const dotColor = classificationDotColor(payload.classification);
  const showDot = dotColor !== 'transparent' || isActive;

  if (!showDot) return null;

  const color = isActive ? '#f59e0b' : dotColor;
  const r = isActive ? 5 : 4;

  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill={color}
      stroke="#18181b"
      strokeWidth={1.5}
    />
  );
};

// Custom tooltip
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

  // Build chart data — one point per move, using winPercentAfter
  const data: ChartDataPoint[] = moves.map((m, i) => {
    const winPercent = m.winPercentAfter ?? 50;
    const cp = m.evalAfter ?? 0;
    const moveNum = Math.floor(i / 2) + 1;
    const label = m.color === 'w' ? `${moveNum}.` : `${moveNum}...`;
    return {
      index: i,
      label,
      winPercent,
      cp,
      mate: m.mate ?? null,
      classification: m.classification,
      san: m.san,
    };
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleClick = (data: any) => {
    const point = data?.activePayload?.[0]?.payload as ChartDataPoint | undefined;
    if (point) onSelectMove(point.index);
  };

  return (
    <div className="w-full bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
      {/* Player name labels */}
      {(whiteName || blackName) && (
        <div className="flex items-center justify-between px-3 pt-2 pb-0">
          <span className="text-[10px] text-white font-semibold tracking-wide">
            ♔ {whiteName ?? 'White'}
          </span>
          <span className="text-[10px] text-zinc-500 font-semibold tracking-wide">
            ♚ {blackName ?? 'Black'}
          </span>
        </div>
      )}

      <div className="px-3 pb-2 pt-2">
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart
            data={data}
            margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
            onClick={handleClick}
            style={{ cursor: 'pointer' }}
          >
            <defs>
              {/* White advantage fill — bright white above 50% */}
              <linearGradient id="evalWhiteGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ffffff" stopOpacity={0.55} />
                <stop offset="50%" stopColor="#ffffff" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#ffffff" stopOpacity={0.1} />
              </linearGradient>
              {/* Black advantage fill — dark below 50% */}
              <linearGradient id="evalBlackGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#18181b" stopOpacity={0.1} />
                <stop offset="100%" stopColor="#09090b" stopOpacity={0.7} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#27272a"
              vertical={false}
            />

            <XAxis
              dataKey="index"
              tick={false}
              axisLine={{ stroke: '#3f3f46' }}
              tickLine={false}
            />

            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tick={{ fill: '#52525b', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}%`}
            />

            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: '#52525b', strokeDasharray: '4 2' }}
            />

            {/* 50% reference line */}
            <ReferenceLine
              y={50}
              stroke="#71717a"
              strokeDasharray="4 2"
              strokeWidth={1}
            />

            {/* White advantage area (above 50) */}
            <Area
              type="monotone"
              dataKey="winPercent"
              stroke="#d4d4d8"
              strokeWidth={2}
              fill="url(#evalWhiteGradient)"
              dot={<ClassificationDot currentIndex={currentIndex} />}
              activeDot={false}
              isAnimationActive={false}
              baseValue={50}
            />
          </AreaChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-1 text-[10px] text-zinc-600">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Best</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />Inaccuracy</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />Mistake</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Blunder</span>
        </div>
      </div>
    </div>
  );
}
