import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ComboGrid from './ComboGrid';
import type { UnlockedComboEntry } from './types';

export type UnlockedMap = Record<string, UnlockedComboEntry>;

type Status = 'loading' | 'ready' | 'error';

const TOTAL_PATHS = 16;
const ILLUMINATE_DURATION_MS = 2400;
const ILLUMINATE_STAGGER_MS = 500;

function formatRelative(seconds: number): string {
	if (seconds < 5) return 'updated just now';
	if (seconds < 60) return `updated ${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	return `updated ${minutes}m ago`;
}

function subtitleFor(count: number): string {
	if (count === 0) return 'the wall awaits its first discovery';
	if (count === TOTAL_PATHS) return 'the wall is complete';
	return `${count} of ${TOTAL_PATHS} paths discovered`;
}

export default function App(): JSX.Element {
	const [unlocked, setUnlocked] = useState<UnlockedMap>({});
	const [status, setStatus] = useState<Status>('loading');
	const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
	const [now, setNow] = useState(() => Date.now());
	const [illuminating, setIlluminating] = useState<Set<string>>(() => new Set());

	const knownKeysRef = useRef<Set<string>>(new Set());
	const isFirstFetchRef = useRef(true);

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
					Each soul in MythWar may be reborn twice, choosing a new race at each turning.
					Sixteen paths run between the four races. The first to walk each earns a pane
					of this window forever.
				</p>
			</header>
			<ComboGrid unlocked={unlocked} illuminating={illuminating} />
		</div>
	);
}
