import { Fragment } from 'react';
import ComboCard from './ComboCard';
import type { UnlockedMap } from './App';

const RACE_NAMES = ['Human', 'Centaur', 'Mage', 'Borg'];

interface Props {
	unlocked: UnlockedMap;
}

export default function ComboGrid({ unlocked }: Props): JSX.Element {
	return (
		<div className="grid-wrapper">
			<div className="grid">
				{RACE_NAMES.map((_tier1Name, tier1) => (
					<Fragment key={tier1}>
						{RACE_NAMES.map((_tier2Name, tier2) => {
							const key = `${tier1}_${tier2}`;
							return <ComboCard key={key} comboKey={key} entry={unlocked[key] ?? null} />;
						})}
					</Fragment>
				))}
			</div>
		</div>
	);
}
