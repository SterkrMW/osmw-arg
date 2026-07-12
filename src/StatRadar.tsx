import type { CSSProperties } from 'react';
import type { StatKey } from './rebornCombos';
import { STAT_BASELINE, STAT_LABELS, STAT_MAX } from './rebornCombos';

interface Props {
	/** Stat multipliers already resolved for the selected gender. */
	values: Record<StatKey, number>;
}

// ── Geometry ─────────────────────────────────────────────────────────────────
const CX = 120;
const CY = 100;
const R = 60;

interface Axis {
	key: StatKey;
	angle: number; // degrees; -90 = up
	anchor: 'middle' | 'start' | 'end';
	lx: number;
	ly: number;
}

const AXES: Axis[] = [
	{ key: 'strength', angle: -90, anchor: 'middle', lx: CX, ly: CY - R - 12 },
	{ key: 'intelligence', angle: 0, anchor: 'start', lx: CX + R + 8, ly: CY + 4 },
	{ key: 'agility', angle: 90, anchor: 'middle', lx: CX, ly: CY + R + 18 },
	{ key: 'stamina', angle: 180, anchor: 'end', lx: CX - R - 8, ly: CY + 4 },
];

function clamp01(n: number): number {
	return Math.max(0, Math.min(1, n));
}

function point(frac: number, angleDeg: number): [number, number] {
	const rad = (angleDeg * Math.PI) / 180;
	const rr = frac * R;
	return [CX + rr * Math.cos(rad), CY + rr * Math.sin(rad)];
}

/** Diamond (4-point ring) at a given fraction of the radius. */
function ring(frac: number): string {
	return AXES.map((a) => point(frac, a.angle).join(',')).join(' ');
}

const RINGS = [0.25, 0.5, 0.75, 1];
const BASELINE_FRAC = STAT_BASELINE / STAT_MAX; // 1.0 multiplier → 0.5 of the radius

export default function StatRadar({ values }: Props): JSX.Element {
	const polygon = AXES.map((a) => point(clamp01(values[a.key] / STAT_MAX), a.angle).join(',')).join(
		' ',
	);

	return (
		<svg
			className="stat-radar"
			viewBox="0 0 240 200"
			role="img"
			aria-label="Relative stats: strength, intelligence, agility and stamina, where the dashed ring is baseline."
			style={{ color: 'var(--pane-color)' } as CSSProperties}
		>
			{/* concentric guide rings */}
			{RINGS.map((frac) => (
				<polygon
					key={frac}
					className={frac === BASELINE_FRAC ? 'radar-ring radar-ring-baseline' : 'radar-ring'}
					points={ring(frac)}
				/>
			))}

			{/* axes from centre to each vertex */}
			{AXES.map((a) => {
				const [x, y] = point(1, a.angle);
				return <line key={a.key} className="radar-axis" x1={CX} y1={CY} x2={x} y2={y} />;
			})}

			{/* value polygon */}
			<polygon className="radar-shape" points={polygon} />

			{/* vertices */}
			{AXES.map((a) => {
				const [x, y] = point(clamp01(values[a.key] / STAT_MAX), a.angle);
				return <circle key={a.key} className="radar-dot" cx={x} cy={y} r={2.5} />;
			})}

			{/* axis labels */}
			{AXES.map((a) => (
				<text key={a.key} className="radar-label-name" x={a.lx} y={a.ly} textAnchor={a.anchor}>
					{STAT_LABELS[a.key]}
				</text>
			))}
		</svg>
	);
}
