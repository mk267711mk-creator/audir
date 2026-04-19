import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Music, FileText, Mic, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { parseSRT, parseVTT } from '../../services/youtube';
import type { SubtitleSegment } from '../../services/youtube';
import { generateExercises } from '../../services/quiz';
import { saveVideo, saveExercises } from '../../services/db';
import { saveFile } from '../../services/fileStorage';
import type { Video, Difficulty } from '../../types';

interface Props { onClose: () => void; onAdded: () => void; }

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string) || '';

const AUDIO_LANGS = [
  { code: 'en', label: '🇬🇧 English' },
  { code: 'es', label: '🇪🇸 Español' },
  { code: 'uk', label: '🇺🇦 Українська' },
  { code: 'ru', label: '🇷🇺 Русский' },
];

export default function UploadAudio({ onClose, onAdded }: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [subtitleFile, setSubtitleFile] = useState<File | null>(null);
  const [extractedSegments, setExtractedSegments] = useState<SubtitleSegment[] | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeStatus, setTranscribeStatus] = useState('');
  const [whisperAvailable, setWhisperAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [audioLang, setAudioLang] = useState('en');

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/transcribe/check`)
      .then(r => r.json()).then(d => setWhisperAvailable(d.available)).catch(() => {});
  }, []);

  const handleTranscribe = async () => {
    if (!audioFile) return;
    setTranscribing(true);
    setTranscribeStatus(t('audio_uploading'));
    setExtractedSegments(null);
    try {
      const formData = new FormData();
      formData.append('audio', audioFile);
      formData.append('lang', audioLang);

      setTranscribeStatus(t('sub_transcribing'));
      const resp = await fetch(`${BACKEND_URL}/api/transcribe`, { method: 'POST', body: formData });

      const text = await resp.text();
      const lines = text.trim().split('\n');
      const data = JSON.parse(lines[lines.length - 1]);

      if (data.error) throw new Error(data.error);
      setExtractedSegments(data.segments);
      toast.success(t('sub_transcribed', { count: data.segments.length }));
    } catch (e: any) {
      toast.error(e.message || t('error'));
    } finally {
      setTranscribing(false);
      setTranscribeStatus('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!audioFile) return;
    setLoading(true);
    try {
      let segments: SubtitleSegment[] = [];

      if (extractedSegments) {
        segments = extractedSegments;
      } else if (subtitleFile) {
        const subtitleText = await subtitleFile.text();
        const ext = subtitleFile.name.split('.').pop()?.toLowerCase();
        segments = ext === 'vtt' ? parseVTT(subtitleText) : parseSRT(subtitleText);
      } else {
        throw new Error(t('audio_no_subtitles'));
      }

      if (!segments.length) throw new Error(t('error'));

      const id = crypto.randomUUID();
      await saveFile(id, audioFile);
      const audioUrl = URL.createObjectURL(audioFile);

      const video: Video = {
        id,
        title: title || audioFile.name.replace(/\.[^.]+$/, ''),
        source: 'audio',
        file_path: audioUrl,
        language: audioLang,
        exercises_easy: 0,
        exercises_medium: 0,
        exercises_hard: 0,
      };

      for (const diff of DIFFICULTIES) {
        const exs = generateExercises(segments, diff, id);
        saveExercises(id, diff, exs);
        (video as any)[`exercises_${diff}`] = exs.length;
      }

      saveVideo(video);
      toast.success(t('success'));
      onAdded();
      onClose();
    } catch (err: any) {
      toast.error(err.message || t('error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3">
      <div className="bg-slate-800 rounded-2xl p-4 w-full max-w-md border border-white/10" style={{ maxHeight: 'calc(100vh - 24px)', overflowY: 'auto' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Music className="w-4 h-4 text-purple-400" />
            <h2 className="text-white font-semibold text-sm">{t('upload_audio')}</h2>
          </div>
          <button onClick={onClose} disabled={transcribing} className="text-slate-400 hover:text-white disabled:opacity-40"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Title */}
          <input type="text" value={title} onChange={e => setTitle(e.target.value)}
            placeholder={t('video_title')}
            className="w-full px-3 py-2 bg-slate-700 border border-white/10 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-purple-400 transition-colors" />

          {/* Audio file */}
          <label className="flex items-center gap-3 px-3 py-2 bg-slate-700 border border-white/10 rounded-xl cursor-pointer hover:border-purple-400 transition-colors">
            <Music className="w-4 h-4 text-purple-400 shrink-0" />
            <span className="text-sm text-slate-300 truncate">
              {audioFile ? audioFile.name : t('audio_file_hint')}
            </span>
            <input
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.aac,.opus,.wma"
              onChange={e => { setAudioFile(e.target.files?.[0] || null); setExtractedSegments(null); }}
              className="hidden"
              required
            />
          </label>

          {/* Language */}
          <div>
            <label className="text-slate-400 text-xs mb-1 block">{t('video_language')}</label>
            <div className="grid grid-cols-2 gap-1.5">
              {AUDIO_LANGS.map(l => (
                <button key={l.code} type="button" onClick={() => setAudioLang(l.code)} disabled={transcribing}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40 ${audioLang === l.code ? 'bg-purple-600 border-purple-500 text-white' : 'bg-slate-700 border-white/10 text-slate-300 hover:border-white/30'}`}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* Subtitle sources */}
          <div>
            <label className="text-slate-400 text-xs mb-1 block">{t('subtitle_file')}</label>
            <div className="space-y-1.5">

              {/* Manual SRT/VTT */}
              <label className={`flex items-center gap-3 px-3 py-2 bg-slate-700 border rounded-xl transition-colors ${transcribing ? 'opacity-40 pointer-events-none' : 'cursor-pointer hover:border-purple-400'} ${subtitleFile && !extractedSegments ? 'border-purple-400' : 'border-white/10'}`}>
                <FileText className="w-4 h-4 text-green-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{subtitleFile && !extractedSegments ? subtitleFile.name : t('sub_manual')}</p>
                  <p className="text-xs text-slate-400">{t('sub_manual_desc')}</p>
                </div>
                {subtitleFile && !extractedSegments && <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />}
                <input type="file" accept=".srt,.vtt" onChange={e => { setSubtitleFile(e.target.files?.[0] || null); setExtractedSegments(null); }} className="hidden" />
              </label>

              {/* Whisper AI */}
              {whisperAvailable && (
                <button type="button" onClick={handleTranscribe} disabled={!audioFile || transcribing}
                  className={`w-full flex items-center gap-3 px-3 py-2 border rounded-xl transition-colors disabled:opacity-50 text-left ${extractedSegments ? 'bg-green-500/10 border-green-500/40' : transcribing ? 'bg-pink-500/10 border-pink-500/40' : 'bg-slate-700 border-white/10 hover:border-purple-400'}`}>
                  {extractedSegments
                    ? <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                    : <Mic className="w-4 h-4 text-pink-400 shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${extractedSegments ? 'text-green-400' : 'text-white'}`}>
                      {extractedSegments
                        ? t('sub_transcribed', { count: extractedSegments.length })
                        : transcribing ? (transcribeStatus || t('sub_transcribing')) : t('sub_whisper')}
                    </p>
                    <p className="text-xs text-slate-400">{t('sub_whisper_audio_desc')}</p>
                  </div>
                  {transcribing && <div className="w-3 h-3 border-2 border-pink-400 border-t-transparent rounded-full animate-spin shrink-0" />}
                </button>
              )}

              {!whisperAvailable && (
                <p className="text-slate-500 text-xs px-1">{t('audio_whisper_hint')}</p>
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={transcribing}
              className="flex-1 py-2 border border-white/20 text-slate-300 hover:text-white disabled:opacity-40 rounded-xl text-sm transition-colors">{t('cancel')}</button>
            <button type="submit" disabled={loading || transcribing}
              className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition-colors">
              {loading ? t('uploading') : t('upload')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
