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
} from './rebornCombos';

const RACE_NAMES = ['Human', 'Centaur', 'Mage', 'Borg'];

interface StageProps {
	id: string;
	label: string;
	hint: string;
	race: number;
	onRaceChange: (value: number) => void;
	gender: Gender;
	onGenderChange: (gender: Gender) => void;
}

function RaceStage({
	id,
	label,
	hint,
	race,
	onRaceChange,
	gender,
	onGenderChange,
}: StageProps): JSX.Element {
	const handle = (e: ChangeEvent<HTMLSelectElement>): void => onRaceChange(Number(e.target.value));
	const stageStyle = { '--stage-color': `var(--race-${race})` } as CSSProperties;
	return (
		<div className="stage" style={stageStyle}>
			<label className="stage-step" htmlFor={id}>
				{label}
			</label>
			<span className="stage-hint">{hint}</span>
			<div className="stage-field">
				<span className="stage-race">
					<RaceGlyph race={race} className="stage-glyph" />
					<select
						id={id}
						className="stage-select"
						value={race}
						aria-label={`${label} race`}
						onChange={handle}
					>
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
				<GenderToggle gender={gender} onChange={onGenderChange} label={`${label} gender`} />
			</div>
		</div>
	);
}

export default function RebornBuilder(): JSX.Element {
	// X → Y → Z : origin, first-reborn, second-reborn (final) race, each with a
	// gender. Origin gender feeds tier-1, first-reborn gender feeds tier-2; the
	// final gender is appearance only and changes no bonus.
	const [origin, setOrigin] = useState(0);
	const [first, setFirst] = useState(0);
	const [second, setSecond] = useState(0);
	const [originGender, setOriginGender] = useState<Gender>('male');
	const [firstGender, setFirstGender] = useState<Gender>('male');
	const [finalGender, setFinalGender] = useState<Gender>('male');

	const path = useMemo(
		() => buildSecondReborn(origin, originGender, first, firstGender, second),
		[origin, originGender, first, firstGender, second],
	);

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
					race={origin}
					onRaceChange={setOrigin}
					gender={originGender}
					onGenderChange={setOriginGender}
				/>
				<span className="builder-arrow" aria-hidden="true">
					→
				</span>
				<RaceStage
					id="stage-first"
					label="First rebirth"
					hint="Becomes"
					race={first}
					onRaceChange={setFirst}
					gender={firstGender}
					onGenderChange={setFirstGender}
				/>
				<span className="builder-arrow" aria-hidden="true">
					→
				</span>
				<RaceStage
					id="stage-second"
					label="Second rebirth"
					hint="Ends as"
					race={second}
					onRaceChange={setSecond}
					gender={finalGender}
					onGenderChange={setFinalGender}
				/>
			</div>

			<div className="builder-result">
				<div className="combo-modal-card builder-card" style={paneStyle}>
					<div className="builder-card-header">
						<div className="builder-card-title">{pathLabel}</div>
					</div>
					<ComboBack
						path={path}
						pathLabel="Bonuses after both rebirths"
						gender="male"
						onGenderChange={() => undefined}
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
