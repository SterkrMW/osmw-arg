import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import ComboBack from './ComboBack';
import { comboLore } from './comboLore';
import type { Gender } from './rebornCombos';
import { pathHasGenderSplit, pathsByKey } from './rebornCombos';

interface Props {
	comboKey: string;
	onClose: () => void;
	showChartValues: boolean;
}

const RACE_NAMES = ['Human', 'Centaur', 'Mage', 'Borg'];

export default function ComboModal({ comboKey, onClose, showChartValues }: Props): JSX.Element {
	const [r1, r2] = comboKey.split('_').map(Number);
	const path = pathsByKey[comboKey];
	const lore = comboLore[comboKey];
	const pathLabel = `${RACE_NAMES[r1]} → ${RACE_NAMES[r2]}`;

	const [gender, setGender] = useState<Gender>('male');
	const closeRef = useRef<HTMLButtonElement>(null);
	const dialogRef = useRef<HTMLDivElement>(null);
	const onCloseRef = useRef(onClose);

	useEffect(() => {
		onCloseRef.current = onClose;
	}, [onClose]);

	useEffect(() => {
		const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		closeRef.current?.focus();
		const onKey = (e: KeyboardEvent): void => {
			if (e.key === 'Escape') {
				e.preventDefault();
				onCloseRef.current();
				return;
			}
			if (e.key !== 'Tab' || !dialogRef.current) return;
			const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
				'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
			)).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			if (!first || !last) return;
			const focusOutside = !dialogRef.current.contains(document.activeElement);
			if (focusOutside || (e.shiftKey && document.activeElement === first) || (!e.shiftKey && document.activeElement === last)) {
				e.preventDefault();
				(e.shiftKey ? last : first).focus();
			}
		};
		document.addEventListener('keydown', onKey);
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.removeEventListener('keydown', onKey);
			document.body.style.overflow = prevOverflow;
			if (previousFocus?.isConnected) previousFocus.focus();
		};
	}, []);

	const paneStyle = { '--pane-color': `var(--pane-${comboKey})` } as CSSProperties;

	return (
		<div
			ref={dialogRef}
			className="combo-modal"
			role="dialog"
			aria-modal="true"
			aria-label={`${lore?.name ?? pathLabel} — path bonuses`}
			onClick={onClose}
		>
			<div className="combo-modal-card" style={paneStyle} onClick={(e) => e.stopPropagation()}>
				<button
					ref={closeRef}
					type="button"
					className="modal-close"
					aria-label="Close bonuses"
					onClick={onClose}
				>
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
					showChartValues={showChartValues}
				/>
			</div>
		</div>
	);
}
