import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Youtube } from 'lucide-react';
import toast from 'react-hot-toast';
import { extractYouTubeId, getYouTubeThumbnail, fetchYouTubeTranscript } from '../../services/youtube';
import { generateExercises } from '../../services/quiz';
import { saveVideo, saveExercises } from '../../services/db';
import type { Video, Difficulty } from '../../types';

interface Props { onClose: () => void; onAdded: () => void; }

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

const VIDEO_LANGS = [
  { code: 'en', label: '🇬🇧 English' },
  { code: 'es', label: '🇪🇸 Español' },
  { code: 'uk', label: '🇺🇦 Українська' },
  { code: 'ru', label: '🇷🇺 Русский' },
];

export default function AddYouTube({ onClose, onAdded }: Props) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [videoLang, setVideoLang] = useState('en');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [errorDetail, setErrorDetail] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorDetail('');
    const videoId = extractYouTubeId(url);
    if (!videoId) {
      if (url.includes('playlist') || url.includes('list=')) {
        toast.error('This is a playlist link. Please paste a link to a specific video.');
      } else {
        toast.error('Could not find a video ID. Please paste a direct YouTube video link.');
      }
      return;
    }

    setLoading(true);
    try {
      setStatus('Fetching subtitles...');
      const segments = await fetchYouTubeTranscript(videoId, videoLang);

      if (!segments.length) throw new Error('No subtitles found');

      setStatus('Generating exercises...');
      const actualLang = (segments as any).actualLang ?? videoLang;
      const video: Video = {
        id: videoId,
        title: title || `YouTube: ${videoId}`,
        source: 'youtube',
        url,
        thumbnail: getYouTubeThumbnail(videoId),
        language: actualLang,
        exercises_easy: 0,
        exercises_medium: 0,
        exercises_hard: 0,
      };

      for (const diff of DIFFICULTIES) {
        const exs = generateExercises(segments, diff, videoId);
        saveExercises(videoId, diff, exs);
        (video as any)[`exercises_${diff}`] = exs.length;
      }

      saveVideo(video);
      toast.success(t('success'));
      onAdded();
      onClose();
    } catch (err: any) {
      const msg = err.message || t('error');
      setErrorDetail(msg);
      toast.error('Subtitles not found');
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-md border border-white/10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Youtube className="w-5 h-5 text-red-400" />
            <h2 className="text-white font-semibold">{t('add_youtube')}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-slate-400 text-sm mb-1 block">{t('youtube_url')}</label>
            <input
              type="text"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://youtu.be/..."
              required
              className="w-full px-4 py-3 bg-slate-700 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-400 transition-colors text-sm"
            />
          </div>

          <div>
            <label className="text-slate-400 text-sm mb-1 block">{t('video_title')}</label>
            <input
              type="text" value={title} onChange={e => setTitle(e.target.value)}
              className="w-full px-4 py-3 bg-slate-700 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-400 transition-colors"
            />
          </div>

          <div>
            <label className="text-slate-400 text-sm mb-1 block">{t('video_language')}</label>
            <div className="grid grid-cols-2 gap-2">
              {VIDEO_LANGS.map(l => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setVideoLang(l.code)}
                  className={`py-2 px-3 rounded-xl text-sm font-medium border transition-colors ${
                    videoLang === l.code
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-slate-700 border-white/10 text-slate-300 hover:border-white/30'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {status && <p className="text-blue-400 text-sm text-center">{status}</p>}
          {errorDetail && (
            <div className="bg-red-900/30 border border-red-500/40 rounded-xl p-3">
              <p className="text-red-400 text-xs font-mono whitespace-pre-wrap break-all">{errorDetail}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 border border-white/20 text-slate-300 hover:text-white rounded-xl transition-colors">
              {t('cancel')}
            </button>
            <button type="submit" disabled={loading} className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors">
              {loading ? t('adding') : t('add_video')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
