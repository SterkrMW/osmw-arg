import humanIcon from './assets/human.png';
import centIcon from './assets/cent.png';
import mageIcon from './assets/mage.png';
import borgIcon from './assets/borg.png';

interface Props {
	race: number;
	className?: string;
}

const RACE_ICONS: Record<number, string> = {
	0: humanIcon,
	1: centIcon,
	2: mageIcon,
	3: borgIcon,
};

const RACE_NAMES: Record<number, string> = {
	0: 'Human',
	1: 'Centaur',
	2: 'Mage',
	3: 'Borg',
};

export default function RaceGlyph({ race, className }: Props): JSX.Element | null {
	const src = RACE_ICONS[race];
	if (!src) return null;

	return <img src={src} alt={RACE_NAMES[race] ?? ''} className={className} aria-hidden />;
}
