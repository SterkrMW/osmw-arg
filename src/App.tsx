import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ComboGrid from './ComboGrid';
import ComboModal from './ComboModal';
import RebornBuilder from './RebornBuilder';
import type { UnlockedComboEntry } from './types';
import { initializePlanner, makePlannerUrl, savePlannerDraft } from './plannerState';

export type UnlockedMap = Record<string, UnlockedComboEntry>;

type Status = 'loading' | 'ready' | 'error';
type Mode = 'wall' | 'builder';

const TOTAL_PATHS = 16;
const ILLUMINATE_DURATION_MS = 2400;
const ILLUMINATE_STAGGER_MS = 500;

function browserStorage(): Storage | null {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

function formatRelative(seconds: number): string {
	if (seconds < 5) return 'checked just now';
	if (seconds < 60) return `checked ${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	return `checked ${minutes}m ago`;
}

function subtitleFor(count: number): string {
	if (count === 0) return 'the wall awaits its first discovery';
	if (count === TOTAL_PATHS) return 'the wall is complete';
	return `${count} of ${TOTAL_PATHS} paths discovered`;
}

export default function App(): JSX.Element {
	const [initialPlanner] = useState(() => initializePlanner(window.location.href, browserStorage()));
	const [mode, setMode] = useState<Mode>(initialPlanner.mode);
	const [draft, setDraft] = useState(initialPlanner.draft);
	const draftRef = useRef(draft);
	const [plannerNotice, setPlannerNotice] = useState(initialPlanner.notice);
	const sharedUrlRef = useRef(initialPlanner.shared);
	const [unlocked, setUnlocked] = useState<UnlockedMap>({});
	const [status, setStatus] = useState<Status>('loading');
	const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
	const [now, setNow] = useState(() => Date.now());
	const [illuminating, setIlluminating] = useState<Set<string>>(() => new Set());
	const [expanded, setExpanded] = useState<string | null>(null);

	const knownKeysRef = useRef<Set<string>>(new Set());
	const isFirstFetchRef = useRef(true);

	useEffect(() => {
		draftRef.current = draft;
		savePlannerDraft(browserStorage(), draft);
		if (sharedUrlRef.current) {
			try {
				window.history.replaceState(null, '', makePlannerUrl(window.location.href, draft));
			} catch {
				// Embedded or restricted browsers can still edit and copy a fresh link.
			}
		}
	}, [draft]);

	useEffect(() => {
		const restoreLocation = (): void => {
			const restored = initializePlanner(window.location.href, null, draftRef.current);
			sharedUrlRef.current = restored.shared;
			setDraft(restored.draft);
			setMode(restored.mode);
			setPlannerNotice(restored.notice);
		};
		window.addEventListener('popstate', restoreLocation);
		return () => window.removeEventListener('popstate', restoreLocation);
	}, []);

	const changeMode = (nextMode: Mode): void => {
		setMode(nextMode);
		if (nextMode === 'wall') {
			sharedUrlRef.current = false;
			const url = new URL(window.location.href);
			if (url.searchParams.has('planner')) {
				for (const key of ['planner', 'a', 'b']) url.searchParams.delete(key);
				try { window.history.replaceState(null, '', url); } catch { /* Keep the in-memory view usable. */ }
			}
		}
	};

	const fetchUnlocked = useCallback(async (): Promise<void> => {
		try {
			const res = await fetch('/api/combos');
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = (await res.json()) as { unlocked: UnlockedMap };

			const newKeys = Object.keys(data.unlocked);
			const newlyAppeared = isFirstFetchRef.current
				? []
				: newKeys.filter((k) => !knownKeysRef.current.has(k));

			knownKeysRef.current = new Set(newKeys);
			isFirstFetchRef.current = false;

			setUnlocked(data.unlocked);
			setLastFetchedAt(Date.now());
			setStatus('ready');

			newlyAppeared.forEach((key, index) => {
				const startDelay = index * ILLUMINATE_STAGGER_MS;
				window.setTimeout(() => {
					setIlluminating((prev) => {
						const next = new Set(prev);
						next.add(key);
						return next;
					});
				}, startDelay);
				window.setTimeout(() => {
					setIlluminating((prev) => {
						const next = new Set(prev);
						next.delete(key);
						return next;
					});
				}, startDelay + ILLUMINATE_DURATION_MS);
			});
		} catch {
			setStatus((prev) => (prev === 'ready' ? 'ready' : 'error'));
		}
	}, []);

	useEffect(() => {
		void fetchUnlocked();
		const poll = setInterval(() => void fetchUnlocked(), 30_000);
		const tick = setInterval(() => setNow(Date.now()), 5_000);
		return () => {
			clearInterval(poll);
			clearInterval(tick);
		};
	}, [fetchUnlocked]);

	const discoveredCount = Object.keys(unlocked).length;

	const updatedLabel = useMemo(() => {
		if (lastFetchedAt === null) return null;
		return formatRelative(Math.floor((now - lastFetchedAt) / 1000));
	}, [now, lastFetchedAt]);

	const retry = (): void => {
		setStatus('loading');
		void fetchUnlocked();
	};

	return (
		<div className="app">
			<header>
				<h1>The Paths of Rebirth</h1>

				<div className="mode-toggle" role="group" aria-label="Choose a view">
					<button
						type="button"
						aria-pressed={mode === 'wall'}
						className={mode === 'wall' ? 'is-active' : ''}
						onClick={() => changeMode('wall')}
					>
						The Wall
					</button>
					<button
						type="button"
						aria-pressed={mode === 'builder'}
						className={mode === 'builder' ? 'is-active' : ''}
						onClick={() => changeMode('builder')}
					>
						Trace a Path
					</button>
				</div>

				<label className="chart-values-toggle">
					<input
						type="checkbox"
						checked={draft.showChartValues}
						onChange={(event) => {
							const checked = event.target.checked;
							setDraft((previous) => ({ ...previous, showChartValues: checked }));
						}}
					/>
					<span>Show chart values</span>
				</label>

				{mode === 'wall' ? (
					<>
						{status === 'ready' && (
							<p className="subtitle">
								{subtitleFor(discoveredCount)}
								{updatedLabel && (
									<>
										{' '}
										<span className="subtitle-meta">· {updatedLabel}</span>
									</>
								)}
							</p>
						)}
						{status === 'error' && (
							<p className="subtitle subtitle-error">
								The wall could not be reached.{' '}
								<button type="button" className="retry-button" onClick={retry}>
									Try again
								</button>
							</p>
						)}
						<p className="intro">
							Each soul in MythWar may be reborn twice, choosing a new race at each
							turning. Sixteen paths bind the four races — the first to walk each
							earns a pane forever. Turn a pane to read its path.
						</p>
					</>
				) : (
					<p className="intro">
						Choose the race and gender of each life to see your growth after both
						rebirths, then compare the paths ahead.
					</p>
				)}
			</header>
			{plannerNotice && mode === 'builder' && <p className="planner-notice" role="status">{plannerNotice}</p>}

			{mode === 'wall' ? (
				<>
					<ComboGrid
						unlocked={unlocked}
						illuminating={illuminating}
						onExpand={setExpanded}
						showChartValues={draft.showChartValues}
					/>
					{expanded && (
						<ComboModal comboKey={expanded} onClose={() => setExpanded(null)} showChartValues={draft.showChartValues} />
					)}
				</>
			) : (
				<RebornBuilder draft={draft} onDraftChange={setDraft} />
			)}
		</div>
	);
}
