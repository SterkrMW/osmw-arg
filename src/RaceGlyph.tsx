interface Props {
	race: number;
	className?: string;
}

export default function RaceGlyph({ race, className }: Props): JSX.Element {
	const common = {
		className,
		viewBox: '0 0 32 32',
		xmlns: 'http://www.w3.org/2000/svg',
		'aria-hidden': true as const,
		focusable: false as const,
	};

	switch (race) {
		case 0:
			return (
				<svg {...common}>
					<path
						d="M16 4 C 12 10, 8 13, 8 19 a 8 8 0 0 0 16 0 C 24 13, 20 10, 16 4 Z"
						fill="currentColor"
					/>
				</svg>
			);
		case 1:
			return (
				<svg {...common}>
					<path
						d="M6 26 L 6 14 a 10 10 0 0 1 20 0 L 26 26 L 22 26 L 22 14 a 6 6 0 0 0 -12 0 L 10 26 Z"
						fill="currentColor"
					/>
				</svg>
			);
		case 2:
			return (
				<svg {...common}>
					<path
						d="M16 2 L 18.5 13.5 L 30 16 L 18.5 18.5 L 16 30 L 13.5 18.5 L 2 16 L 13.5 13.5 Z"
						fill="currentColor"
					/>
				</svg>
			);
		case 3:
			return (
				<svg {...common}>
					<path
						fillRule="evenodd"
						d="M16 3 L 27 9.5 L 27 22.5 L 16 29 L 5 22.5 L 5 9.5 Z M 16 9 L 11 12 L 11 20 L 16 23 L 21 20 L 21 12 Z"
						fill="currentColor"
					/>
				</svg>
			);
		default:
			return <svg {...common} />;
	}
}
