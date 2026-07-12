import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import ComboBack from './ComboBack';
import { comboLore } from './comboLore';
import type { Gender } from './rebornCombos';
import { pathHasGenderSplit, pathsByKey } from './rebornCombos';

interface Props {
	comboKey: string;
	onClose: () => void;
}

const RACE_NAMES = ['Human', 'Centaur', 'Mage', 'Borg'];

export default function ComboModal({ comboKey, onClose }: Props): JSX.Element {
	const [r1, r2] = comboKey.split('_').map(Number);
	const path = pathsByKey[comboKey];
	const lore = comboLore[comboKey];
	const pathLabel = `${RACE_NAMES[r1]} → ${RACE_NAMES[r2]}`;

	const [gender, setGender] = useState<Gender>('male');
	const closeRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		closeRef.current?.focus();
		const onKey = (e: KeyboardEvent): void => {
			if (e.key === 'Escape') onClose();
		};
		document.addEventListener('keydown', onKey);
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.removeEventListener('keydown', onKey);
			document.body.style.overflow = prevOverflow;
		};
	}, [onClose]);

	const paneStyle = { '--pane-color': `var(--pane-${comboKey})` } as CSSProperties;

	return (
		<div
			className="combo-modal"
			role="dialog"
			aria-modal="true"
			aria-label={`${lore?.name ?? pathLabel} — path bonuses`}
			onClick={onClose}
		>
			<div className="combo-modal-card" style={paneStyle} onClick={(e) => e.stopPropagation()}>
				<button ref={closeRef} type="button" className="modal-close" aria-label="Close" onClick={onClose}>
					×
				</button>
				{lore && <div className="modal-title">{lore.name}</div>}
				<ComboBack
					path={path}
					pathLabel={pathLabel}
					gender={gender}
					onGenderChange={setGender}
					showGenderToggle={pathHasGenderSplit(path)}
					active={true}
				/>
			</div>
		</div>
	);
}
