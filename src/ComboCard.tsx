import { comboLore } from './comboLore';
import type { UnlockedComboEntry } from './types';
import lockedIcon from './assets/locked.svg';

interface Props {
	comboKey: string;
	entry: UnlockedComboEntry | null;
}

const RACE_NAMES = ['Human', 'Centaur', 'Mage', 'Borg'];

function formatDate(ts: number): string {
	return new Date(ts).toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});
}

export default function ComboCard({ comboKey, entry }: Props): JSX.Element {
	const [r1, r2] = comboKey.split('_').map(Number);
	const lore = comboLore[comboKey];
	const isUnlocked = entry !== null;

	return (
		<div className={`combo-card ${isUnlocked ? 'unlocked' : 'locked'}`}>
			{isUnlocked && lore ? (
				<>
					<div className="card-name">{lore.name}</div>
					<div className="card-path">
						{RACE_NAMES[r1]} → {RACE_NAMES[r2]}
					</div>
					<p className="card-lore">{lore.flavourText}</p>
					<div className="card-discoverer">
						First discovered by <strong>{entry.discovererName}</strong>
						<span className="card-date"> · {formatDate(entry.unlockedAt)}</span>
					</div>
				</>
			) : (
				<>
					<img className="card-lock" src={lockedIcon} alt="Locked" />
					<div className="card-path locked-path">
						{RACE_NAMES[r1]} → {RACE_NAMES[r2]}
					</div>
					<div className="card-undiscovered">Undiscovered</div>
				</>
			)}
		</div>
	);
}
