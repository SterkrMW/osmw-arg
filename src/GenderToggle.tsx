import type { MouseEvent } from 'react';
import type { Gender } from './rebornCombos';

interface Props {
	gender: Gender;
	onChange: (gender: Gender) => void;
	/** When false, buttons leave the tab order (hidden face / inactive panel). */
	active?: boolean;
}

export default function GenderToggle({
	gender,
	onChange,
	active = true,
}: Props): JSX.Element {
	const tab = active ? 0 : -1;

	const pick = (next: Gender) => (e: MouseEvent<HTMLButtonElement>): void => {
		e.stopPropagation();
		onChange(next);
	};

	return (
		<div className="gender-toggle" role="group" aria-label="Bonus values by gender">
			<button
				type="button"
				tabIndex={tab}
				className={gender === 'male' ? 'is-active' : ''}
				aria-pressed={gender === 'male'}
				aria-label="Show male bonuses"
				onClick={pick('male')}
			>
				♂
			</button>
			<button
				type="button"
				tabIndex={tab}
				className={gender === 'female' ? 'is-active' : ''}
				aria-pressed={gender === 'female'}
				aria-label="Show female bonuses"
				onClick={pick('female')}
			>
				♀
			</button>
		</div>
	);
}
