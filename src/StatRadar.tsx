import type { CSSProperties } from 'react';
import type { StatKey } from './rebornCombos';
import { STAT_BASELINE, STAT_LABELS, STAT_MAX } from './rebornCombos';

interface Props {
	values: Record<StatKey, number>;
	showValues?: boolean;
	labels?: Record<StatKey, string>;
	/** Fixed axis ceilings shared by all paths in the same view. */
	maxima?: Record<StatKey, number>;
	baseline?: Record<StatKey, number>;
	title?: string;
	baselineLabel?: string;
	showScale?: boolean;
	decimals?: number;
}

// ── Geometry ─────────────────────────────────────────────────────────────────
const CX = 140;
const CY = 105;
const R = 60;

interface Axis {
	key: StatKey;
	angle: number; // degrees; -90 = up
	anchor: 'middle' | 'start' | 'end';
	lx: number;
	ly: number;
}

const AXES: Axis[] = [
	{ key: 'strength', angle: -90, anchor: 'middle', lx: CX, ly: 18 },
	{ key: 'intelligence', angle: 0, anchor: 'start', lx: CX + R + 8, ly: CY - 6 },
	{ key: 'agility', angle: 90, anchor: 'middle', lx: CX, ly: CY + R + 20 },
	{ key: 'stamina', angle: 180, anchor: 'end', lx: CX - R - 8, ly: CY - 6 },
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
const INDEX_MAXIMA: Record<StatKey, number> = {
	strength: STAT_MAX,
	intelligence: STAT_MAX,
	agility: STAT_MAX,
	stamina: STAT_MAX,
};
const INDEX_BASELINE: Record<StatKey, number> = {
	strength: STAT_BASELINE,
	intelligence: STAT_BASELINE,
	agility: STAT_BASELINE,
	stamina: STAT_BASELINE,
};

export default function StatRadar({
	values,
	showValues = true,
	labels = STAT_LABELS,
	maxima = INDEX_MAXIMA,
	baseline = INDEX_BASELINE,
	title = 'Rebirth bonus index',
	baselineLabel = 'Index baseline (1.000)',
	showScale = false,
	decimals = 3,
}: Props): JSX.Element {
	const polygon = AXES.map((a) => point(clamp01(values[a.key] / maxima[a.key]), a.angle).join(',')).join(
		' ',
	);
	const baselinePolygon = AXES.map((a) =>
		point(clamp01(baseline[a.key] / maxima[a.key]), a.angle).join(','),
	).join(' ');
	const description = AXES.map(
		({ key }) => `${labels[key]}: ${values[key].toFixed(decimals)}; scale 0 to ${maxima[key]}; baseline ${baseline[key].toFixed(decimals)}`,
	).join('. ');

	return (
		<figure className="stat-radar-figure">
			<figcaption className="stat-radar-title">{title}</figcaption>
			<svg
				className="stat-radar"
				viewBox="0 0 280 220"
				role="img"
				aria-label={`${title}. ${description}. Dashed outline: ${baselineLabel}.`}
				style={{ color: 'var(--pane-color)' } as CSSProperties}
			>
				{RINGS.map((frac) => (
					<polygon key={frac} className="radar-ring" points={ring(frac)} />
				))}
				{AXES.map((axis) => {
					const [x, y] = point(1, axis.angle);
					return <line key={axis.key} className="radar-axis" x1={CX} y1={CY} x2={x} y2={y} />;
				})}
				<polygon className="radar-shape" points={polygon} />
				<polygon className="radar-ring radar-ring-baseline" points={baselinePolygon} />
				{AXES.map((axis) => {
					const [x, y] = point(clamp01(values[axis.key] / maxima[axis.key]), axis.angle);
					return <circle key={axis.key} className="radar-dot" cx={x} cy={y} r={2.5} />;
				})}
				{AXES.map((axis) => (
					<text key={axis.key} x={axis.lx} y={axis.ly} textAnchor={axis.anchor}>
						<tspan className="radar-label-name">{labels[axis.key]}</tspan>
						{showValues && (
							<tspan className="radar-label-val" x={axis.lx} dy={16}>
								{values[axis.key].toFixed(decimals)}
							</tspan>
						)}
					</text>
				))}
			</svg>
			{showScale && (
				<>
					<p className="radar-scale">
						Axis scales: {AXES.map(({ key }) => `${labels[key]} 0–${maxima[key]}`).join(' · ')}
					</p>
					<p className="radar-baseline-note">Dashed outline: {baselineLabel.toLowerCase()}.</p>
				</>
			)}
		</figure>
	);
}
