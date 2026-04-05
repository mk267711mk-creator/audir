import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Youtube, Upload, Headphones, Loader2 } from 'lucide-react';
import { getVideos, getVideoProgress } from '../../services/db';
import { seedDefaultVideos } from '../../services/seeds';
import type { Video, Difficulty } from '../../types';
import VideoCard from './VideoCard';
import AddYouTube from '../AddVideo/AddYouTube';
import UploadVideo from '../AddVideo/UploadVideo';
import DifficultyPicker from '../Player/DifficultyPicker';

export default function HomePage() {
  const { t } = useTranslation();
  const [videos, setVideos] = useState<Video[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [modal, setModal] = useState<'youtube' | 'upload' | null>(null);
  const [seedStatus, setSeedStatus] = useState('');

  const load = () => setVideos(getVideos());

  useEffect(() => {
    load();

    // Seed default videos on first launch (runs once)
    if (!localStorage.getItem('audir_seeded_v6')) {
      seedDefaultVideos((msg) => setSeedStatus(msg))
        .then(() => { load(); setSeedStatus(''); })
        .catch(() => setSeedStatus(''));
    }
  }, []);

  const videosWithProgress = videos.map(v => ({ ...v, ...getVideoProgress(v.id) }));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <h1 className="text-xl font-bold text-white flex-1">{t('all_videos')}</h1>
        <DifficultyPicker value={difficulty} onChange={setDifficulty} />
      </div>

      {/* Add buttons */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <button
          onClick={() => setModal('youtube')}
          className="flex items-center justify-center gap-2 py-3 px-4 bg-red-600/20 active:bg-red-600/50 border border-red-500/40 text-red-400 rounded-2xl text-sm font-medium transition-colors"
        >
          <Youtube className="w-5 h-5 shrink-0" />
          <span>{t('add_youtube')}</span>
        </button>
        <button
          onClick={() => setModal('upload')}
          className="flex items-center justify-center gap-2 py-3 px-4 bg-blue-600/20 active:bg-blue-600/50 border border-blue-500/40 text-blue-400 rounded-2xl text-sm font-medium transition-colors"
        >
          <Upload className="w-5 h-5 shrink-0" />
          <span>{t('upload_video')}</span>
        </button>
      </div>

      {/* Seed loading indicator */}
      {seedStatus ? (
        <div className="flex items-center gap-3 px-4 py-3 bg-blue-500/10 border border-blue-500/20 rounded-2xl mb-4">
          <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
          <p className="text-blue-300 text-sm">{seedStatus}</p>
        </div>
      ) : null}

      {/* Video list or empty state */}
      {videosWithProgress.length === 0 && !seedStatus ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-24 h-24 bg-blue-600/20 rounded-3xl flex items-center justify-center mb-5 border border-blue-500/30">
            <Headphones className="w-12 h-12 text-blue-400" />
          </div>
          <p className="text-white font-semibold text-lg mb-2">{t('no_videos')}</p>
          <div className="flex flex-col gap-3 w-full max-w-xs mt-4">
            <button
              onClick={() => setModal('youtube')}
              className="flex items-center justify-center gap-3 py-4 bg-red-600 active:bg-red-700 text-white rounded-2xl font-semibold"
            >
              <Youtube className="w-5 h-5" />
              {t('add_youtube')}
            </button>
            <button
              onClick={() => setModal('upload')}
              className="flex items-center justify-center gap-3 py-4 bg-blue-600 active:bg-blue-700 text-white rounded-2xl font-semibold"
            >
              <Upload className="w-5 h-5" />
              {t('upload_video')}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {videosWithProgress.map(v => (
            <VideoCard key={v.id} video={v} difficulty={difficulty} onDelete={load} />
          ))}
        </div>
      )}

      {modal === 'youtube' && <AddYouTube onClose={() => setModal(null)} onAdded={load} />}
      {modal === 'upload' && <UploadVideo onClose={() => setModal(null)} onAdded={load} />}
    </div>
  );
}
