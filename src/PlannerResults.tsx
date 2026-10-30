import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import StatRadar from './StatRadar';
import StarMeter from './StarMeter';
import { bonusLabel, buildComparisonRows, GROWTH_CEILINGS, GROWTH_DECIMALS, GROWTH_LABELS, MAX_PLANNER_AFFINITY, MAX_PLANNER_DAMAGE, RACE_NAMES, REBIRTH_GROWTH_PERCENT } from './planner';
import type { PathResult, PathSelection } from './planner';
import { STAT_KEYS, STAT_LABELS, toStars } from './rebornCombos';

function signed(value: number, decimals = 0): string {
	const clean = Math.abs(value) < 0.5 * 10 ** -decimals ? 0 : value;
	return `${clean > 0 ? '+' : clean < 0 ? '−' : ''}${Math.abs(clean).toFixed(decimals)}`;
}

function BonusBreakdown({ result }: { result: PathResult }): JSX.Element {
	const growthRows = [
		{ label: 'Final race base', values: result.baseGrowth, decimals: GROWTH_DECIMALS },
		{ label: `After both rebirths (+${REBIRTH_GROWTH_PERCENT}%)`, values: result.rebirthGrowth, decimals: GROWTH_DECIMALS },
		{ label: 'Race bonus', values: result.raceBonusPercent, decimals: 0, suffix: '%', sign: true },
		{ label: 'After race bonus', values: result.raceGrowth, decimals: GROWTH_DECIMALS },
		{ label: 'Flat growth bonuses', values: result.additiveGrowth, decimals: GROWTH_DECIMALS, sign: true },
		{ label: 'Resulting growth', values: result.growthRates, decimals: GROWTH_DECIMALS },
	];
	return (
		<details className="planner-breakdown">
			<summary>Why these bonuses?</summary>
			<div className="planner-breakdown-content">
				<table className="growth-breakdown-table">
					<caption>Growth calculation</caption>
					<thead><tr><th scope="col">Stage</th>{STAT_KEYS.map((key) => <th key={key} scope="col"><abbr title={GROWTH_LABELS[key]}>{STAT_LABELS[key]}</abbr></th>)}</tr></thead>
					<tbody>{growthRows.map((row) => <tr key={row.label}>
						<th scope="row">{row.label}</th>
						{STAT_KEYS.map((key) => <td key={key}>{row.sign ? signed(row.values[key], row.decimals) : row.values[key].toFixed(row.decimals)}{row.suffix ?? ''}</td>)}
					</tr>)}</tbody>
				</table>
				<p className="planner-small-note">The final race supplies the base growth. Apply the rebirth increase, then race bonuses, then flat growth bonuses, rounding to {GROWTH_DECIMALS} decimals after each calculation.</p>
				<h4 className="planner-breakdown-title">Where your bonuses come from</h4>
				<ol className="planner-sources">
					{result.sources.map((source) => {
						const contributions = [
							...STAT_KEYS.filter((key) => source.raceBonusPercent[key] !== 0).map((key) => `${STAT_LABELS[key]} race bonus ${signed(source.raceBonusPercent[key])}%`),
							...STAT_KEYS.filter((key) => source.additiveGrowth[key] !== 0).map((key) => `${STAT_LABELS[key]} growth ${signed(source.additiveGrowth[key], GROWTH_DECIMALS)}`),
							...Object.entries(source.resistances).filter(([, value]) => value !== 0).map(([key, value]) => `${bonusLabel(key)} ${signed(value)} points`),
							...(source.effectAffinity !== 0 ? [`Effect Affinity ${signed(source.effectAffinity)} points`] : []),
							...(source.damageBonusPercent !== 0 ? [`Damage Bonus ${signed(source.damageBonusPercent)}%`] : []),
						];
						return <li key={source.id}>
							<div className="planner-source-heading"><strong>{source.label}</strong>{!source.active && <span>Not active</span>}</div>
							{source.active ? (contributions.length > 0 ? <ul>{contributions.map((item) => <li key={item}>{item}</li>)}</ul> : <p>No additional bonuses.</p>) : <p>{source.id === 'secret-combo' ? 'No combo bonus for these earlier races.' : 'The races before and after this rebirth must match.'}</p>}
						</li>;
					})}
				</ol>
			</div>
		</details>
	);
}

export default function PlannerResults({ id, selection, result, showValues }: {
	id: 'a' | 'b'; selection: PathSelection; result: PathResult; showValues: boolean;
}): JSX.Element {
	const resistances = Object.entries(result.resistances).filter(([, value]) => value !== 0);
	const style = { '--pane-color': `var(--pane-${selection.first.race}_${selection.final.race})` } as CSSProperties;
	return (
		<div className="combo-modal-card planner-result" style={style}>
			<ol className="planner-life-summary" aria-label={`Path ${id.toUpperCase()} selected lives`}>
				{(['origin', 'first', 'final'] as const).map((key) => <li key={key}><span>{RACE_NAMES[selection[key].race]}</span> <span className="planner-life-gender">{selection[key].gender}</span></li>)}
			</ol>
			<StatRadar values={result.growthRates} showValues={showValues} labels={GROWTH_LABELS} maxima={GROWTH_CEILINGS} baseline={result.baseGrowth} title="Resulting growth rates" baselineLabel={`${RACE_NAMES[selection.final.race]} base growth`} decimals={GROWTH_DECIMALS} showScale />
			<div className="back-meters planner-meters">
				<StarMeter label="Effect Affinity" stars={toStars(result.effectAffinity, MAX_PLANNER_AFFINITY)} value={result.effectAffinity} unit="points" showValues={showValues} />
				<StarMeter label="Damage Bonus" stars={toStars(result.damageBonusPercent, MAX_PLANNER_DAMAGE)} value={result.damageBonusPercent} unit="percent" showValues={showValues} />
			</div>
			<p className="planner-small-note">Stars compare each bonus with the strongest available path. Effect Affinity is measured in points, not success chance. Damage Bonus increases damage-skill power; it excludes healing and Drain.</p>
			<div className="planner-resistances">
				<h3>Resistance and combat bonuses <span>points</span></h3>
				{resistances.length > 0 ? <dl className="planner-resistance-list">
					{resistances.map(([key, value]) => <div key={key}><dt>{bonusLabel(key)}</dt><dd className={value < 0 ? 'value-negative' : ''}>{signed(value)}</dd></div>)}
				</dl> : <p className="planner-small-note">No resistance changes.</p>}
			</div>
			<BonusBreakdown result={result} />
		</div>
	);
}

export function PathComparison({ a, b }: { a: PathResult; b: PathResult }): JSX.Element {
	const [differencesOnly, setDifferencesOnly] = useState(false);
	const allRows = useMemo(() => buildComparisonRows(a, b), [a, b]);
	const rows = differencesOnly ? allRows.filter((row) => row.delta !== 0) : allRows;
	const groups = [...new Set(rows.map((row) => row.group))];
	const formatValue = (value: number, unit: typeof allRows[number]['unit'], delta = false): string => {
		const decimals = unit === 'growth' ? GROWTH_DECIMALS : 0;
		const text = delta ? signed(value, decimals) : value.toFixed(decimals);
		return `${text}${unit === 'percent' ? (delta ? ' pp' : '%') : ''}`;
	};
	return (
		<section className="planner-comparison" aria-labelledby="comparison-title">
			<div className="planner-comparison-heading">
				<div><h2 id="comparison-title" tabIndex={-1}>Compare your paths</h2><p>Each difference is Path B minus Path A. Damage differences are percentage points (pp).</p></div>
				<label className="comparison-filter"><input type="checkbox" checked={differencesOnly} onChange={(event) => setDifferencesOnly(event.target.checked)} /> Show differences only</label>
			</div>
			{rows.length === 0 ? <p className="comparison-empty" role="status">These paths give the same growth rates and bonuses. Change a race or an earlier gender to explore another path.</p> : <table className="comparison-table">
				<caption className="visually-hidden">Growth rates and bonuses for Path A and Path B</caption>
				<thead><tr><th scope="col">Metric</th><th scope="col">Path A</th><th scope="col">Path B</th><th scope="col"><span aria-hidden="true">B − A</span><span className="visually-hidden">Difference: Path B minus Path A</span></th></tr></thead>
				{groups.map((group) => <tbody key={group}>
					<tr className="comparison-group"><th scope="rowgroup" colSpan={4}>{group}</th></tr>
					{rows.filter((row) => row.group === group).map((row) => <tr key={row.key}>
						<th scope="row">{row.label}{row.unit === 'points' && <span className="comparison-unit">points</span>}</th>
						<td>{formatValue(row.a, row.unit)}</td><td>{formatValue(row.b, row.unit)}</td>
						<td className={row.delta > 0 ? 'value-positive' : row.delta < 0 ? 'value-negative' : 'value-unchanged'}>{formatValue(row.delta, row.unit, true)}</td>
					</tr>)}
				</tbody>)}
			</table>}
		</section>
	);
}
