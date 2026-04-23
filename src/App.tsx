import { useCallback, useEffect, useState } from 'react';
import ComboGrid from './ComboGrid';
import type { UnlockedComboEntry } from './types';

export type UnlockedMap = Record<string, UnlockedComboEntry>;

type Status = 'loading' | 'ready' | 'error';

export default function App(): JSX.Element {
	const [unlocked, setUnlocked] = useState<UnlockedMap>({});
	const [status, setStatus] = useState<Status>('loading');

	const fetchUnlocked = useCallback(async (): Promise<void> => {
		try {
			const res = await fetch('/api/combos');
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = (await res.json()) as { unlocked: UnlockedMap };
			setUnlocked(data.unlocked);
			setStatus('ready');
		} catch {
			setStatus((prev) => (prev === 'ready' ? 'ready' : 'error'));
		}
	}, []);

	useEffect(() => {
		void fetchUnlocked();
		const interval = setInterval(() => void fetchUnlocked(), 30_000);
		return () => clearInterval(interval);
	}, [fetchUnlocked]);

	const discoveredCount = Object.keys(unlocked).length;

	const retry = (): void => {
		setStatus('loading');
		void fetchUnlocked();
	};

	return (
		<div className="app">
			<header>
				<h1>The Paths of Rebirth</h1>
				{status === 'ready' && (
					<p className="subtitle">{discoveredCount} of 16 paths discovered</p>
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
			<ComboGrid unlocked={unlocked} />
		</div>
	);
}
