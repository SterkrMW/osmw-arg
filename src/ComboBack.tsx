import type { MouseEvent } from 'react';
import StarMeter from './StarMeter';
import StatRadar from './StatRadar';
import type { Gender, RebornPath, StatKey } from './rebornCombos';
import {
	MAX_DAMAGE_BONUS,
	MAX_EFFECT_AFFINITY,
	resistanceLabel,
	resolveGendered,
	STAT_KEYS,
	toStars,
} from './rebornCombos';

interface Props {
	path: RebornPath;
	pathLabel: string;
	gender: Gender;
	onGenderChange: (gender: Gender) => void;
	showGenderToggle: boolean;
	/** true while this face is the one on show (drives tab order). */
	active: boolean;
	/** Star-scale ceilings — overridden by the second-rebirth builder. */
	maxEffectAffinity?: number;
	maxDamageBonus?: number;
}

function formatResist(value: number): string {
	return value > 0 ? `+${value}` : `${value}`;
}

export default function ComboBack({
	path,
	pathLabel,
	gender,
	onGenderChange,
	showGenderToggle,
	active,
	maxEffectAffinity = MAX_EFFECT_AFFINITY,
	maxDamageBonus = MAX_DAMAGE_BONUS,
}: Props): JSX.Element {
	const stats = STAT_KEYS.reduce<Record<StatKey, number>>(
		(acc, key) => {
			acc[key] = resolveGendered(path.relativeStats[key], gender);
			return acc;
		},
		{} as Record<StatKey, number>,
	);

	const resistances = Object.entries(path.resistances)
		.map(([key, raw]) => ({ key, value: resolveGendered(raw, gender) }))
		.filter((r) => r.value !== 0);

	const tab = active ? 0 : -1;

	const pickGender = (next: Gender) => (e: MouseEvent<HTMLButtonElement>): void => {
		e.stopPropagation();
		onGenderChange(next);
	};

	return (
		<div className="combo-back-body">
			<div className="back-header">
				<div className="back-path">{pathLabel}</div>
				{showGenderToggle && (
					<div className="gender-toggle" role="group" aria-label="Bonus values by gender">
						<button
							type="button"
							tabIndex={tab}
							className={gender === 'male' ? 'is-active' : ''}
							aria-pressed={gender === 'male'}
							aria-label="Show male bonuses"
							onClick={pickGender('male')}
						>
							♂
						</button>
						<button
							type="button"
							tabIndex={tab}
							className={gender === 'female' ? 'is-active' : ''}
							aria-pressed={gender === 'female'}
							aria-label="Show female bonuses"
							onClick={pickGender('female')}
						>
							♀
						</button>
					</div>
				)}
			</div>

			<StatRadar values={stats} />

			<div className="back-meters">
				<StarMeter
					label="Effect Affinity"
					stars={toStars(path.effectAffinity, maxEffectAffinity)}
				/>
				<StarMeter
					label="Damage Bonus"
					stars={toStars(path.damageBonusPercent, maxDamageBonus)}
				/>
			</div>

			<div className="back-resists">
				<div className="back-resists-title">Resistances</div>
				{resistances.length > 0 ? (
					<ul className="resist-list">
						{resistances.map((r) => (
							<li key={r.key} className="resist-item">
								<span className="resist-name">{resistanceLabel(r.key)}</span>
								<span
									className={r.value < 0 ? 'resist-val resist-val-neg' : 'resist-val'}
								>
									{formatResist(r.value)}
								</span>
							</li>
						))}
					</ul>
				) : (
					<p className="resist-empty">No resistance changes</p>
				)}
			</div>
		</div>
	);
}
