import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Play, Youtube, Upload, CheckCircle, Trash2, Music } from 'lucide-react';
import type { Video, Difficulty } from '../../types';
import { deleteVideo, type VideoProgress } from '../../services/db';
import clsx from 'clsx';

type Props = {
  video: Video & Partial<VideoProgress>;
  difficulty: Difficulty;
  onDelete?: () => void;
};

const difficultyColor: Record<Difficulty, string> = {
  easy: 'bg-green-500/20 text-green-400 border-green-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  hard: 'bg-red-500/20 text-red-400 border-red-500/30',
};

export default function VideoCard({ video, difficulty, onDelete }: Props) {
  const { t } = useTranslation();

  const totalEx = video[`exercises_${difficulty}` as keyof Video] as number || 0;
  const accuracy = video.total_exercises
    ? Math.round(((video.correct_answers ?? 0) / video.total_exercises) * 100)
    : 0;

  return (
    <div className="bg-slate-800 rounded-2xl overflow-hidden border border-white/10 hover:border-blue-500/50 transition-all group">
      <div className="relative aspect-video bg-slate-700">
        {video.thumbnail ? (
          <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            {video.source === 'audio'
              ? <Music className="w-10 h-10 text-purple-500" />
              : <Upload className="w-10 h-10 text-slate-500" />
            }
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <div className="w-14 h-14 bg-blue-500 rounded-full flex items-center justify-center">
            <Play className="w-6 h-6 text-white ml-1" />
          </div>
        </div>
        {video.completed && (
          <div className="absolute top-2 right-2"><CheckCircle className="w-6 h-6 text-green-400" /></div>
        )}
        <div className="absolute bottom-2 left-2">
          {video.source === 'youtube'
            ? <Youtube className="w-5 h-5 text-red-400" />
            : video.source === 'audio'
              ? <Music className="w-5 h-5 text-purple-400" />
              : <Upload className="w-5 h-5 text-blue-400" />}
        </div>
      </div>

      <div className="p-4">
        <h3 className="text-white font-semibold text-sm leading-tight mb-3 line-clamp-2">{video.title}</h3>

        <div className="flex items-center gap-2 mb-3">
          <span className={clsx('text-xs px-2 py-0.5 rounded-full border', difficultyColor[difficulty])}>
            {t(difficulty)}
          </span>
          <span className="text-slate-400 text-xs">{totalEx} {t('tasks')}</span>
        </div>

        {(video.total_exercises ?? 0) > 0 && (
          <div className="mb-3">
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>{t('accuracy')}</span><span>{accuracy}%</span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${accuracy}%` }} />
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Link
            to={`/play/${video.id}?difficulty=${difficulty}`}
            className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <Play className="w-4 h-4" />
            {video.completed ? t('try_again') : t('tap_to_start')}
          </Link>
          <button
            onClick={() => { deleteVideo(video.id); onDelete?.(); }}
            className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
