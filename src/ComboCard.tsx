import { useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { comboLore } from './comboLore';
import ComboBack from './ComboBack';
import RaceGlyph from './RaceGlyph';
import type { UnlockedComboEntry } from './types';
import type { Gender } from './rebornCombos';
import { pathHasGenderSplit, pathsByKey } from './rebornCombos';

interface Props {
	comboKey: string;
	entry: UnlockedComboEntry | null;
	isIlluminating?: boolean;
	onExpand: (comboKey: string) => void;
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
	onExpand,
}: Props): JSX.Element {
	const [r1, r2] = comboKey.split('_').map(Number);
	const lore = comboLore[comboKey];
	const path = pathsByKey[comboKey];
	const isUnlocked = entry !== null;

	const [flipped, setFlipped] = useState(false);
	const [gender, setGender] = useState<Gender>('male');

	const pathLabel = `${RACE_NAMES[r1]} → ${RACE_NAMES[r2]}`;

	const paneStyle = {
		'--pane-color': `var(--pane-${comboKey})`,
	} as CSSProperties;

	const tileClass = ['combo-tile', flipped ? 'is-flipped' : ''].filter(Boolean).join(' ');

	const frontClass = [
		'combo-card',
		'combo-face',
		'combo-face-front',
		isUnlocked ? 'unlocked' : 'locked',
		isIlluminating ? 'is-illuminating' : '',
	]
		.filter(Boolean)
		.join(' ');

	const toggleFlip = (): void => setFlipped((f) => !f);

	const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
		// Only act when the tile itself holds focus, so the gender buttons keep their own keys.
		if (e.target !== e.currentTarget) return;
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			toggleFlip();
		}
	};

	return (
		<div
			className={tileClass}
			style={paneStyle}
			role="button"
			tabIndex={0}
			aria-pressed={flipped}
			aria-label={
				flipped
					? `${pathLabel} path bonuses. Activate to return.`
					: `${pathLabel} path. Activate to reveal its bonuses.`
			}
			onClick={toggleFlip}
			onKeyDown={onKeyDown}
		>
			<div className="combo-tile-inner">
				<div className={frontClass} aria-hidden={flipped}>
					<span className="flip-hint" aria-hidden="true">
						⤾
					</span>
					{isUnlocked && lore ? (
						<>
							<div className="card-discoverer-label">First walked by</div>
							<div className="card-discoverer-name">{entry.discovererName}</div>
							<div className="card-name">{lore.name}</div>
							<div className="card-path">{pathLabel}</div>
							<p className="card-lore">{lore.flavourText}</p>
							<div className="card-date">{formatDate(entry.unlockedAt)}</div>
						</>
					) : (
						<>
							<RaceGlyph race={r2} className="card-glyph" />
							<div className="card-path locked-path">{pathLabel}</div>
						</>
					)}
				</div>

				<div className="combo-card combo-face combo-face-back" aria-hidden={!flipped}>
					<button
						type="button"
						className="expand-btn"
						tabIndex={flipped ? 0 : -1}
						aria-label={`Enlarge ${pathLabel} bonuses`}
						onClick={(e) => {
							e.stopPropagation();
							onExpand(comboKey);
						}}
					>
						<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
							<path d="M9 3H4a1 1 0 0 0-1 1v5" />
							<path d="M15 3h5a1 1 0 0 1 1 1v5" />
							<path d="M15 21h5a1 1 0 0 0 1-1v-5" />
							<path d="M9 21H4a1 1 0 0 1-1-1v-5" />
						</svg>
					</button>
					<ComboBack
						path={path}
						pathLabel={pathLabel}
						gender={gender}
						onGenderChange={setGender}
						showGenderToggle={pathHasGenderSplit(path)}
						active={flipped}
					/>
				</div>
			</div>
		</div>
	);
}
