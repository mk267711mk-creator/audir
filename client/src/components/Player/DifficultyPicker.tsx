import { useTranslation } from 'react-i18next';
import type { Difficulty } from '../../types';
import clsx from 'clsx';

interface Props {
  value: Difficulty;
  onChange: (d: Difficulty) => void;
}

const items: { key: Difficulty; color: string }[] = [
  { key: 'easy', color: 'bg-green-500/20 text-green-400 border-green-500/30 data-[active=true]:bg-green-500 data-[active=true]:text-white' },
  { key: 'medium', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30 data-[active=true]:bg-yellow-500 data-[active=true]:text-white' },
  { key: 'hard', color: 'bg-red-500/20 text-red-400 border-red-500/30 data-[active=true]:bg-red-500 data-[active=true]:text-white' },
];

export default function DifficultyPicker({ value, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-1">
      {items.map(({ key, color }) => (
        <button
          key={key}
          data-active={value === key}
          onClick={() => onChange(key)}
          className={clsx('text-xs px-2 py-1 rounded-lg border transition-all', color)}
        >
          {t(key)}
        </button>
      ))}
    </div>
  );
}
