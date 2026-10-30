import { useEffect, useMemo, useState } from 'react';
import { GROWTH_DECIMALS, RACE_NAMES } from './planner';
import type { PathSelection, Race } from './planner';
import { FINDER_METRICS, metricValue, searchPaths } from './pathFinder';
import type { FinderSettings, MetricId, MinimumRequirement } from './pathFinder';

interface Props {
	a: PathSelection;
	settings: FinderSettings;
	onSettingsChange: (settings: FinderSettings) => void;
	onUseCandidate: (selection: PathSelection) => void;
}

type Metric = typeof FINDER_METRICS[number];
interface SearchSnapshot {
	goal: Metric;
	matches: ReturnType<typeof searchPaths>['matches'];
	requirements: MinimumRequirement[];
}

function routeLabel(path: PathSelection): string {
	return [path.origin, path.first, path.final]
		.map((life) => `${RACE_NAMES[life.race]} ${life.gender}`).join(' → ');
}

function formatMetric(value: number, unit: Metric['unit'], delta = false): string {
	const decimals = unit === 'growth' ? GROWTH_DECIMALS : 0;
	const clean = Math.abs(value) < 0.5 * 10 ** -decimals ? 0 : value;
	const amount = delta
		? `${clean > 0 ? '+' : clean < 0 ? '−' : ''}${Math.abs(clean).toFixed(decimals)}`
		: clean.toFixed(decimals);
	return `${amount}${unit === 'points' ? ' points' : unit === 'percent' ? (delta ? ' pp' : '%') : ''}`;
}

function MetricOptions({ available = FINDER_METRICS }: { available?: readonly Metric[] }): JSX.Element {
	const groups = [...new Set(available.map((metric) => metric.group))];
	return <>{groups.map((group) => <optgroup key={group} label={group}>
		{available.filter((metric) => metric.group === group).map((metric) => <option key={metric.id} value={metric.id}>{metric.label}</option>)}
	</optgroup>)}</>;
}

export default function PathFinderPanel({ a, settings, onSettingsChange, onUseCandidate }: Props): JSX.Element {
	const search = useMemo(() => searchPaths(a, settings), [a, settings]);
	const [lastValid, setLastValid] = useState<SearchSnapshot | null>(null);
	const [visibleCount, setVisibleCount] = useState(10);
	const goal = FINDER_METRICS.find((metric) => metric.id === settings.goal);
	const current = useMemo<SearchSnapshot | null>(() => search.status === 'ready' && goal ? {
		goal,
		matches: search.matches,
		requirements: settings.requirements,
	} : null, [search, goal, settings.requirements]);
	const filterKey = JSON.stringify([a, settings.goal, settings.finalRace, settings.pins, settings.requirements]);

	useEffect(() => { if (current) setLastValid(current); }, [current]);
	useEffect(() => { setVisibleCount(10); }, [filterKey]);

	const paused = search.status === 'invalid';
	const snapshot = current ?? (paused ? lastValid : null);
	const usedMetrics = new Set(settings.requirements.map((requirement) => requirement.metric));
	const unusedMetrics = FINDER_METRICS.filter((metric) => !usedMetrics.has(metric.id));
	const updateRequirement = (index: number, requirement: MinimumRequirement): void => {
		onSettingsChange({
			...settings,
			requirements: settings.requirements.map((existing, i) => i === index ? requirement : existing),
		});
	};
	const addRequirement = (): void => {
		const next = unusedMetrics.find((metric) => metric.id === settings.goal) ?? unusedMetrics[0];
		if (next) onSettingsChange({ ...settings, requirements: [...settings.requirements, { metric: next.id, value: '' }] });
	};
	const applyCandidate = (key: string): void => {
		// Read the current search, never the retained snapshot. Invalid edits must
		// not permit an old recommendation to replace the comparison draft.
		if (search.status !== 'ready') return;
		const candidate = search.matches.find((match) => match.key === key);
		if (candidate) onUseCandidate(candidate.selection);
	};
	const visibleMatches = snapshot?.matches.slice(0, visibleCount) ?? [];

	return (
		<section className="path-finder" aria-labelledby="finder-title">
			<h2 id="finder-title"><button type="button" className="finder-toggle" aria-expanded={settings.open}
				aria-controls="finder-panel" onClick={() => onSettingsChange({ ...settings, open: !settings.open })}>
				<span>Find paths</span><span className="finder-toggle-symbol" aria-hidden="true">{settings.open ? '−' : '+'}</span>
			</button></h2>
			<div id="finder-panel" hidden={!settings.open}>
				<p className="finder-intro">Choose the growth or bonus that matters most. Results keep your pinned Path A lives; only choosing a result changes Path B.</p>
				<div className="finder-controls">
					<div className="finder-field">
						<label htmlFor="finder-goal">Main goal</label>
						<select id="finder-goal" value={settings.goal ?? ''} onChange={(event) => onSettingsChange({ ...settings, goal: event.target.value === '' ? null : event.target.value as MetricId })}>
							<option value="">Choose a growth or bonus</option><MetricOptions />
						</select>
					</div>
					<div className="finder-field">
						<label htmlFor="finder-final-race">Final race</label>
						<select id="finder-final-race" value={settings.pins.final ? 'same-as-a' : settings.finalRace}
							disabled={settings.pins.final} aria-describedby={settings.pins.final ? 'finder-final-pin-note' : undefined}
							onChange={(event) => {
								const value = event.target.value;
								onSettingsChange({ ...settings, finalRace: value === 'same-as-a' || value === 'any' ? value : Number(value) as Race });
							}}>
							<option value="same-as-a">Same as Path A ({RACE_NAMES[a.final.race]})</option>
							<option value="any">Any race</option>
							{RACE_NAMES.map((name, race) => <option key={name} value={race}>{name}</option>)}
						</select>
						{settings.pins.final && <p id="finder-final-pin-note" className="finder-field-note">Your final life is pinned. Unpin it in Path A to change this filter.</p>}
					</div>
				</div>

				<fieldset className="finder-requirements">
					<legend>Minimum requirements <span>optional</span></legend>
					<p className="finder-field-note">Keep a minimum in another metric while exploring your priority. Blank values do not filter results.</p>
					{settings.requirements.map((requirement, index) => {
						const metric = FINDER_METRICS.find((item) => item.id === requirement.metric)!;
						const inputId = `finder-minimum-${requirement.metric}`;
						const errorId = `finder-minimum-error-${requirement.metric}`;
						const unitId = `finder-minimum-unit-${requirement.metric}`;
						const error = search.errors[requirement.metric];
						return <div className="finder-requirement" key={index}>
							<div className="finder-field">
								<label className="visually-hidden" htmlFor={`${inputId}-metric`}>Minimum metric {index + 1}</label>
								<select id={`${inputId}-metric`} value={requirement.metric} onChange={(event) => updateRequirement(index, { metric: event.target.value as MetricId, value: '' })}>
									<MetricOptions available={FINDER_METRICS.filter((item) => item.id === requirement.metric || !usedMetrics.has(item.id))} />
								</select>
							</div>
							<div className="finder-minimum-value">
								<label className="visually-hidden" htmlFor={inputId}>Minimum {metric.label}</label>
								<input id={inputId} type="text" inputMode="decimal" autoComplete="off" value={requirement.value}
									placeholder="No minimum" aria-invalid={Boolean(error)} aria-describedby={error ? `${unitId} ${errorId}` : unitId}
									onChange={(event) => updateRequirement(index, { ...requirement, value: event.target.value })} />
								<span className="finder-input-unit" id={unitId}>{metric.unit === 'growth' ? 'growth' : metric.unit === 'percent' ? '%' : 'points'}</span>
							</div>
							<button type="button" className="finder-remove" aria-label={`Remove minimum ${metric.label}`}
								onClick={() => onSettingsChange({ ...settings, requirements: settings.requirements.filter((_, i) => i !== index) })}>Remove</button>
							{error && <p className="finder-field-error" id={errorId}>{error}</p>}
						</div>;
					})}
					<button type="button" className="finder-add" disabled={unusedMetrics.length === 0} onClick={addRequirement}>Add minimum requirement</button>
				</fieldset>

				{search.status === 'idle' && <p className="finder-empty" role="status">Choose a main goal to see matching paths.</p>}
				{paused && <p className="finder-paused" role="status">Fix the highlighted minimum requirements to update the results.{lastValid ? ' Previous valid results are shown below and cannot be used until the search is valid.' : ''}</p>}
				{snapshot && <div className={`finder-results${paused ? ' is-paused' : ''}`}>
					{snapshot.matches.length === 0 ? <p className="finder-empty" role="status">{paused ? 'The previous valid search had no matching paths.' : 'No paths meet these choices. Lower a minimum, change the final race, or unpin a life in Path A.'}</p> : <>
						<p className="finder-results-count" role="status">{paused ? 'Previous results: ' : ''}Showing {visibleMatches.length} of {snapshot.matches.length} matching paths, ordered by {snapshot.goal.label}.</p>
						<p className="finder-ranking-note">Highest {snapshot.goal.label} first. Ties have the same priority value; compare the other bonuses before choosing. Final gender follows Path A and does not affect the results.</p>
						<ol className="finder-result-list">
							{visibleMatches.map((match) => <li key={match.key}><article className="finder-result">
								<div className="finder-result-main">
									<div><p className="finder-result-route">{routeLabel(match.selection)}</p>
										{(match.isCurrent || match.tied) && <div className="finder-result-badges">{match.isCurrent && <span>{paused ? 'Previous Path A' : 'Path A'}</span>}{match.tied && <span>Tied</span>}</div>}
									</div>
									<div className="finder-result-score"><span className="finder-result-goal">{formatMetric(match.goalValue, snapshot.goal.unit)}</span><span className="finder-result-delta">{formatMetric(match.delta, snapshot.goal.unit, true)} {paused ? 'vs previous A' : 'vs A'}</span></div>
								</div>
								{snapshot.requirements.length > 0 && <dl className="finder-result-requirements">
									{snapshot.requirements.map((requirement) => {
										const metric = FINDER_METRICS.find((item) => item.id === requirement.metric)!;
										return <div key={metric.id}><dt>{metric.label}</dt><dd>{formatMetric(metricValue(match.result, metric.id), metric.unit)}</dd></div>;
									})}
								</dl>}
								<button type="button" className="finder-use" disabled={paused}
									aria-label={`Use as Path B: ${routeLabel(match.selection)}`} onClick={() => applyCandidate(match.key)}>Use as Path B</button>
							</article></li>)}
						</ol>
						{visibleMatches.length < snapshot.matches.length && <button type="button" className="finder-more" onClick={() => setVisibleCount((count) => count + 10)}>Show more paths</button>}
					</>}
				</div>}
			</div>
		</section>
	);
}
