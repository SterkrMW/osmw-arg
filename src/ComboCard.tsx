import { comboLore } from './comboLore';
import type { CSSProperties } from 'react';
import type { UnlockedComboEntry } from './types';
import RaceGlyph from './RaceGlyph';

interface Props {
	comboKey: string;
	entry: UnlockedComboEntry | null;
	isIlluminating?: boolean;
}

const RACE_NAMES = ['Human', 'Centaur', 'Mage', 'Borg'];

function formatDate(ts: number): string {
	return new Date(ts).toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});
}

export default function ComboCard({
	comboKey,
	entry,
	isIlluminating = false,
}: Props): JSX.Element {
	const [r1, r2] = comboKey.split('_').map(Number);
	const lore = comboLore[comboKey];
	const isUnlocked = entry !== null;

	const paneStyle = {
		'--pane-color': `var(--pane-${comboKey})`,
	} as CSSProperties;

	const className = [
		'combo-card',
		isUnlocked ? 'unlocked' : 'locked',
		isIlluminating ? 'is-illuminating' : '',
	]
		.filter(Boolean)
		.join(' ');

	return (
		<div className={className} style={paneStyle}>
			{isUnlocked && lore ? (
				<>
					<div className="card-discoverer-label">First walked by</div>
					<div className="card-discoverer-name">{entry.discovererName}</div>
					<div className="card-name">{lore.name}</div>
					<div className="card-path">
						{RACE_NAMES[r1]} → {RACE_NAMES[r2]}
					</div>
					<p className="card-lore">{lore.flavourText}</p>
					<div className="card-date">{formatDate(entry.unlockedAt)}</div>
				</>
			) : (
				<>
					<RaceGlyph race={r2} className="card-glyph" />
					<div className="card-path locked-path">
						{RACE_NAMES[r1]} → {RACE_NAMES[r2]}
					</div>
				</>
			)}
		</div>
	);
}
