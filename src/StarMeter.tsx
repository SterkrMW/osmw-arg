interface Props {
	label: string;
	/** 0–5, halves allowed. */
	stars: number;
	/** Raw bonus, independent of the rounded star rating. */
	value?: number;
	unit?: 'points' | 'percent';
	showValues?: boolean;
}

const STARS = '★★★★★';

export default function StarMeter({
	label,
	stars,
	value,
	unit = 'points',
	showValues = true,
}: Props): JSX.Element {
	const rating = Math.max(0, Math.min(5, stars));
	const pct = `${(rating / 5) * 100}%`;
	const amount = value === undefined
		? null
		: `${value > 0 ? '+' : ''}${value}${unit === 'percent' ? '%' : ' points'}`;
	return (
		<div className="star-meter">
			<span className="star-meter-label">{label}</span>
			<span className="star-meter-reading">
				<span
					className="star-bar"
					role="img"
					aria-label={`${label}: ${amount === null ? '' : `${amount}; `}${rating} of 5 stars (relative rating)`}
				>
					<span className="star-track" aria-hidden="true">{STARS}</span>
					<span className="star-fill" aria-hidden="true" style={{ width: pct }}>{STARS}</span>
				</span>
				{showValues && amount !== null && (
					<span className="star-meter-value" aria-hidden="true">{amount}</span>
				)}
			</span>
		</div>
	);
}
