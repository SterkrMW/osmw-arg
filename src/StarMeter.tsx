interface Props {
	label: string;
	/** 0–5, halves allowed. */
	stars: number;
}

const STARS = '★★★★★';

export default function StarMeter({ label, stars }: Props): JSX.Element {
	const pct = `${(stars / 5) * 100}%`;
	return (
		<div className="star-meter">
			<span className="star-meter-label">{label}</span>
			<span className="star-bar" role="img" aria-label={`${label}: ${stars} of 5 stars`}>
				<span className="star-track" aria-hidden="true">
					{STARS}
				</span>
				<span className="star-fill" aria-hidden="true" style={{ width: pct }}>
					{STARS}
				</span>
			</span>
		</div>
	);
}
