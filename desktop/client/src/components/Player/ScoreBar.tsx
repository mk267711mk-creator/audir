import { useTranslation } from 'react-i18next';
import { Zap, Target } from 'lucide-react';

interface Props {
  score: { correct: number; total: number; xp: number };
  total: number;
}

export default function ScoreBar({ score, total }: Props) {
  const { t } = useTranslation();
  const accuracy = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;

  return (
    <div className="flex items-center gap-4 mb-3 px-1">
      <div className="flex items-center gap-1.5 text-yellow-400">
        <Zap className="w-4 h-4" />
        <span className="font-bold">{score.xp} XP</span>
      </div>
      <div className="flex items-center gap-1.5 text-blue-400">
        <Target className="w-4 h-4" />
        <span className="text-sm">{score.correct}/{score.total}</span>
      </div>
      {score.total > 0 && (
        <span className="text-slate-400 text-sm">{accuracy}%</span>
      )}
      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all"
          style={{ width: `${total > 0 ? (score.total / total) * 100 : 0}%` }}
        />
      </div>
      <span className="text-slate-400 text-xs">{score.total}/{total}</span>
    </div>
  );
}
