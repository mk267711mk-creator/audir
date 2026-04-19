import { useState } from 'react';
import { EyeOff, Eye } from 'lucide-react';
import type { Exercise } from '../../types';

interface Props {
  text: string;
  exercise: Exercise | null;
  defaultHidden?: boolean;
}

export default function SubtitleBar({ text, exercise, defaultHidden = false }: Props) {
  const [hidden, setHidden] = useState(defaultHidden);

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-800/80 rounded-xl px-4 py-3 text-center min-h-12 border border-white/10">
        <p className="text-white text-sm leading-relaxed">
          {!hidden && !exercise ? text : ''}
        </p>
      </div>
      <button
        onClick={() => setHidden(h => !h)}
        className="text-slate-500 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors shrink-0"
        title={hidden ? 'Show subtitles' : 'Hide subtitles'}
      >
        {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}
