import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import GenderToggle from './GenderToggle';
import RaceGlyph from './RaceGlyph';
import PlannerResults, { PathComparison } from './PlannerResults';
import { calculatePath, RACE_NAMES } from './planner';
import type { PathSelection, Race } from './planner';
import { copyAToB, makePlannerUrl, toggleComparison } from './plannerState';
import type { PlannerDraft } from './plannerState';

interface Props {
	draft: PlannerDraft;
	onDraftChange: (draft: PlannerDraft) => void;
}

const STAGES = [
	{ key: 'origin', label: 'Born', hint: 'Your original life' },
	{ key: 'first', label: 'First rebirth', hint: 'Your second life' },
	{ key: 'final', label: 'Second rebirth', hint: 'Your final race' },
] as const;

function PathEditor({ id, selection, onChange }: {
	id: 'a' | 'b';
	selection: PathSelection;
	onChange: (selection: PathSelection) => void;
}): JSX.Element {
	return (
		<fieldset className="planner-stages">
			<legend className="visually-hidden">Path {id.toUpperCase()}: race and gender of each life</legend>
			{STAGES.map(({ key, label, hint }, index) => {
				const life = selection[key];
				const controlId = `path-${id}-${key}`;
				return (
					<div className="planner-stage" key={key} style={{ '--stage-color': `var(--race-${life.race})` } as CSSProperties}>
						<div className="planner-stage-heading">
							<span className="planner-stage-number" aria-hidden="true">{index + 1}</span>
							<div>
								<label className="stage-step" htmlFor={controlId}>{label}</label>
								<span className="stage-hint">{hint}</span>
							</div>
						</div>
						<div className="stage-field">
							<span className="stage-race">
								<RaceGlyph race={life.race} className="stage-glyph" />
								<select id={controlId} className="stage-select" value={life.race}
									aria-label={`Path ${id.toUpperCase()} ${label.toLowerCase()} race`}
									onChange={(event) => onChange({ ...selection, [key]: { ...life, race: Number(event.target.value) as Race } })}>
									{RACE_NAMES.map((name, race) => <option key={name} value={race}>{name}</option>)}
								</select>
								<span className="stage-caret" aria-hidden="true">▾</span>
							</span>
							<GenderToggle gender={life.gender}
								onChange={(gender) => onChange({ ...selection, [key]: { ...life, gender } })}
								label={`Path ${id.toUpperCase()} ${label.toLowerCase()} gender`} />
						</div>
					</div>
				);
			})}
		</fieldset>
	);
}

export default function RebornBuilder({ draft, onDraftChange }: Props): JSX.Element {
	const resultA = useMemo(() => calculatePath(draft.a), [draft.a]);
	const resultB = useMemo(() => draft.b ? calculatePath(draft.b) : null, [draft.b]);
	const [shareMessage, setShareMessage] = useState('');
	const [fallbackUrl, setFallbackUrl] = useState('');
	const shareInput = useRef<HTMLInputElement>(null);
	const shareAttempt = useRef(0);
	const currentDraft = useRef(draft);
	currentDraft.current = draft;
	const comparing = draft.comparing && draft.b !== null && resultB !== null;

	useEffect(() => {
		shareAttempt.current += 1;
		setShareMessage('');
		setFallbackUrl('');
	}, [draft]);
	useEffect(() => () => { shareAttempt.current += 1; }, []);
	useEffect(() => {
		if (fallbackUrl) { shareInput.current?.focus(); shareInput.current?.select(); }
	}, [fallbackUrl]);

	const copyLink = async (): Promise<void> => {
		const attempt = ++shareAttempt.current;
		const url = makePlannerUrl(window.location.href, draft);
		try {
			await navigator.clipboard.writeText(url);
			if (attempt !== shareAttempt.current || currentDraft.current !== draft) return;
			setFallbackUrl('');
			setShareMessage(comparing ? 'Comparison link copied.' : 'Path link copied.');
		} catch {
			if (attempt !== shareAttempt.current || currentDraft.current !== draft) return;
			setFallbackUrl(url);
			setShareMessage('Select and copy the link below.');
		}
	};

	return (
		<div className={`reborn-planner${comparing ? ' is-comparing' : ''}`}>
			<div className="planner-toolbar">
				<div className="planner-actions">
					<button type="button" className="planner-button planner-button-primary" aria-expanded={comparing} onClick={() => onDraftChange(toggleComparison(draft))}>
						{comparing ? 'Close comparison' : 'Compare another path'}
					</button>
					<button type="button" className="planner-button" onClick={() => void copyLink()}>
						{comparing ? 'Copy comparison link' : 'Copy path link'}
					</button>
				</div>
				<p className="planner-help">Your draft is remembered on this device when browser storage is available.</p>
				<p className="planner-share-status" role="status">{shareMessage}</p>
				{fallbackUrl && <input ref={shareInput} className="planner-share-link" aria-label="Link to share" readOnly value={fallbackUrl} onFocus={(event) => event.currentTarget.select()} />}
			</div>

			<div className="planner-paths">
				<section className="planner-path" id="path-a" aria-labelledby="path-a-title">
					<div className="planner-editor">
						<div className="planner-path-heading"><h2 id="path-a-title">Path A</h2><span className="planner-path-caption">{comparing ? 'Your reference path' : 'Trace your three lives'}</span></div>
						<PathEditor id="a" selection={draft.a} onChange={(a) => onDraftChange({ ...draft, a })} />
					</div>
					<PlannerResults id="a" selection={draft.a} result={resultA} showValues={draft.showChartValues} />
				</section>
				{comparing && draft.b && resultB && <section className="planner-path" id="path-b" aria-labelledby="path-b-title">
					<div className="planner-editor">
						<div className="planner-path-heading"><h2 id="path-b-title">Path B</h2><button type="button" className="planner-text-button" onClick={() => onDraftChange(copyAToB(draft))}>Copy A to B</button></div>
						<PathEditor id="b" selection={draft.b} onChange={(b) => onDraftChange({ ...draft, b })} />
					</div>
					<PlannerResults id="b" selection={draft.b} result={resultB} showValues={draft.showChartValues} />
				</section>}
			</div>

			{comparing && resultB && <PathComparison a={resultA} b={resultB} />}
			<p className="planner-footnote">Final gender is kept with your path but does not change these bonuses. Growth rates describe how your stats grow; level, allocated points, equipment and other bonuses determine your final stats.</p>
		</div>
	);
}
