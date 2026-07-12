import type { MouseEvent } from 'react';
import type { Gender } from './rebornCombos';

interface Props {
	gender: Gender;
	onChange: (gender: Gender) => void;
	/** When false, buttons leave the tab order (hidden face / inactive panel). */
	active?: boolean;
	/** Overrides the aria labels — e.g. per-stage in the builder. */
	label?: string;
}

export default function GenderToggle({
	gender,
	onChange,
	active = true,
	label,
}: Props): JSX.Element {
	const tab = active ? 0 : -1;
	const groupLabel = label ?? 'Bonus values by gender';
	const maleLabel = label ? `${label}: male` : 'Show male bonuses';
	const femaleLabel = label ? `${label}: female` : 'Show female bonuses';

	const pick = (next: Gender) => (e: MouseEvent<HTMLButtonElement>): void => {
		e.stopPropagation();
		onChange(next);
	};

	return (
		<div className="gender-toggle" role="group" aria-label={groupLabel}>
			<button
				type="button"
				tabIndex={tab}
				className={gender === 'male' ? 'is-active' : ''}
				aria-pressed={gender === 'male'}
				aria-label={maleLabel}
				onClick={pick('male')}
			>
				♂
			</button>
			<button
				type="button"
				tabIndex={tab}
				className={gender === 'female' ? 'is-active' : ''}
				aria-pressed={gender === 'female'}
				aria-label={femaleLabel}
				onClick={pick('female')}
			>
				♀
			</button>
		</div>
	);
}
