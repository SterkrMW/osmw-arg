import { useMemo, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import ComboBack from './ComboBack';
import GenderToggle from './GenderToggle';
import RaceGlyph from './RaceGlyph';
import type { Gender } from './rebornCombos';
import {
	buildSecondReborn,
	MAX_DAMAGE_BONUS_2RB,
	MAX_EFFECT_AFFINITY_2RB,
	pathHasGenderSplit,
} from './rebornCombos';

const RACE_NAMES = ['Human', 'Centaur', 'Mage', 'Borg'];

interface StageProps {
	id: string;
	label: string;
	hint: string;
	value: number;
	onChange: (value: number) => void;
}

function RaceStage({ id, label, hint, value, onChange }: StageProps): JSX.Element {
	const handle = (e: ChangeEvent<HTMLSelectElement>): void => onChange(Number(e.target.value));
	const stageStyle = { '--stage-color': `var(--race-${value})` } as CSSProperties;
	return (
		<label className="stage" htmlFor={id} style={stageStyle}>
			<span className="stage-step">{label}</span>
			<span className="stage-hint">{hint}</span>
			<span className="stage-field">
				<RaceGlyph race={value} className="stage-glyph" />
				<select id={id} className="stage-select" value={value} onChange={handle}>
					{RACE_NAMES.map((name, index) => (
						<option key={name} value={index}>
							{name}
						</option>
					))}
				</select>
				<span className="stage-caret" aria-hidden="true">
					▾
				</span>
			</span>
		</label>
	);
}

export default function RebornBuilder(): JSX.Element {
	// X → Y → Z : origin race, first-reborn race, second-reborn (final) race.
	const [origin, setOrigin] = useState(0);
	const [first, setFirst] = useState(0);
	const [second, setSecond] = useState(0);
	const [gender, setGender] = useState<Gender>('male');

	const path = useMemo(
		() => buildSecondReborn(origin, first, second),
		[origin, first, second],
	);

	const showGender = pathHasGenderSplit(path);
	// Colour the card by first→second (Y→Z), matching the wall's pane mapping.
	const paneStyle = { '--pane-color': `var(--pane-${first}_${second})` } as CSSProperties;
	const pathLabel = `${RACE_NAMES[origin]} → ${RACE_NAMES[first]} → ${RACE_NAMES[second]}`;

	return (
		<div className="builder">
			<div className="builder-controls" role="group" aria-label="Path of three lives">
				<RaceStage
					id="stage-origin"
					label="Born"
					hint="First race"
					value={origin}
					onChange={setOrigin}
				/>
				<span className="builder-arrow" aria-hidden="true">
					→
				</span>
				<RaceStage
					id="stage-first"
					label="First rebirth"
					hint="Becomes"
					value={first}
					onChange={setFirst}
				/>
				<span className="builder-arrow" aria-hidden="true">
					→
				</span>
				<RaceStage
					id="stage-second"
					label="Second rebirth"
					hint="Ends as"
					value={second}
					onChange={setSecond}
				/>
			</div>

			<div className="builder-result">
				<div className="combo-modal-card builder-card" style={paneStyle}>
					<div className="builder-card-header">
						<div className="builder-card-title">{pathLabel}</div>
						{showGender && (
							<GenderToggle gender={gender} onChange={setGender} />
						)}
					</div>
					<ComboBack
						path={path}
						pathLabel="Bonuses after both rebirths"
						gender={gender}
						onGenderChange={setGender}
						showGenderToggle={false}
						active={true}
						maxEffectAffinity={MAX_EFFECT_AFFINITY_2RB}
						maxDamageBonus={MAX_DAMAGE_BONUS_2RB}
					/>
				</div>
			</div>
		</div>
	);
}
