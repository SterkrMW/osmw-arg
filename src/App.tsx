import { useCallback, useEffect, useState } from 'react';
import ComboGrid from './ComboGrid';
import type { UnlockedComboEntry } from './types';

export type UnlockedMap = Record<string, UnlockedComboEntry>;

export default function App(): JSX.Element {
	const [unlocked, setUnlocked] = useState<UnlockedMap>({});
	const [loading, setLoading] = useState(true);

	const fetchUnlocked = useCallback(async (): Promise<void> => {
		try {
			const res = await fetch('/api/combos');
			const data = (await res.json()) as { unlocked: UnlockedMap };
			setUnlocked(data.unlocked);
		} catch {
			// silent — stale data is fine
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void fetchUnlocked();
		const interval = setInterval(() => void fetchUnlocked(), 30_000);
		return () => clearInterval(interval);
	}, [fetchUnlocked]);

	const discoveredCount = Object.keys(unlocked).length;

	return (
		<div className="app">
			<header>
				<h1>The Paths of Rebirth</h1>
				<p className="subtitle">
					{loading
						? 'Consulting the ancients…'
						: `${discoveredCount} of 16 paths discovered`}
				</p>
			</header>
			<ComboGrid unlocked={unlocked} />
		</div>
	);
}
