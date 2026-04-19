import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Upload, FileVideo, FileText, Wand2, CheckCircle, Mic } from 'lucide-react';
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

const VIDEO_LANGS = [
  { code: 'en', label: '🇬🇧 English' },
  { code: 'es', label: '🇪🇸 Español' },
  { code: 'uk', label: '🇺🇦 Українська' },
  { code: 'ru', label: '🇷🇺 Русский' },
];

export default function UploadVideo({ onClose, onAdded }: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [subtitleFile, setSubtitleFile] = useState<File | null>(null);
  const [extractedSegments, setExtractedSegments] = useState<SubtitleSegment[] | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeStatus, setTranscribeStatus] = useState('');
  const [ffmpegAvailable, setFfmpegAvailable] = useState(false);
  const [whisperAvailable, setWhisperAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [videoLang, setVideoLang] = useState('en');

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/extract-subs/check`)
      .then(r => r.json()).then(d => setFfmpegAvailable(d.available)).catch(() => {});
    fetch(`${BACKEND_URL}/api/transcribe/check`)
      .then(r => r.json()).then(d => setWhisperAvailable(d.available)).catch(() => {});
  }, []);

  const handleSubtitleFile = (f: File | null) => {
    setSubtitleFile(f);
    setExtractedSegments(null);
  };

  const handleExtract = async () => {
    if (!videoFile) return;
    setExtracting(true);
    setExtractedSegments(null);
    try {
      const formData = new FormData();
      formData.append('video', videoFile);
      const resp = await fetch(`${BACKEND_URL}/api/extract-subs`, { method: 'POST', body: formData });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Extraction failed');
      setExtractedSegments(data.segments);
      toast.success(`Found ${data.segments.length} subtitle segments`);
    } catch (e: any) {
      toast.error(e.message || 'Could not extract subtitles');
    } finally {
      setExtracting(false);
    }
  };

  const handleTranscribe = async () => {
    if (!videoFile) return;
    setTranscribing(true);
    setTranscribeStatus('Uploading video...');
    setExtractedSegments(null);
    try {
      const formData = new FormData();
      formData.append('video', videoFile);
      formData.append('lang', videoLang);

      setTranscribeStatus('Transcribing with Whisper AI (may take a few minutes)...');
      const resp = await fetch(`${BACKEND_URL}/api/transcribe`, { method: 'POST', body: formData });

      // Read streamed response
      const text = await resp.text();
      const lines = text.trim().split('\n');
      const lastLine = lines[lines.length - 1];
      const data = JSON.parse(lastLine);

      if (data.error) throw new Error(data.error);
      setExtractedSegments(data.segments);
      toast.success(`Transcribed ${data.segments.length} segments`);
    } catch (e: any) {
      toast.error(e.message || 'Transcription failed');
    } finally {
      setTranscribing(false);
      setTranscribeStatus('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoFile) return;
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
        throw new Error('Please provide subtitles or use AI transcription');
      }

      if (!segments.length) throw new Error('Could not parse subtitles');

      const id = crypto.randomUUID();
      await saveFile(id, videoFile);
      const videoUrl = URL.createObjectURL(videoFile);

      const video: Video = {
        id,
        title: title || videoFile.name,
        source: 'upload',
        file_path: videoUrl,
        language: videoLang,
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

  const busy = transcribing || extracting;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3">
      <div className="bg-slate-800 rounded-2xl p-4 w-full max-w-md border border-white/10" style={{ maxHeight: 'calc(100vh - 24px)', overflowY: 'auto' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-blue-400" />
            <h2 className="text-white font-semibold text-sm">{t('upload_video')}</h2>
          </div>
          <button onClick={onClose} disabled={busy} className="text-slate-400 hover:text-white disabled:opacity-40"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Title */}
          <input type="text" value={title} onChange={e => setTitle(e.target.value)}
            placeholder={t('video_title')}
            className="w-full px-3 py-2 bg-slate-700 border border-white/10 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-400 transition-colors" />

          {/* Video file */}
          <label className="flex items-center gap-3 px-3 py-2 bg-slate-700 border border-white/10 rounded-xl cursor-pointer hover:border-blue-400 transition-colors">
            <FileVideo className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="text-sm text-slate-300 truncate">{videoFile ? videoFile.name : 'MP4, MKV, WebM...'}</span>
            <input type="file" accept="video/*" onChange={e => { setVideoFile(e.target.files?.[0] || null); setExtractedSegments(null); }} className="hidden" required />
          </label>

          {/* Language */}
          <div>
            <label className="text-slate-400 text-xs mb-1 block">{t('video_language')}</label>
            <div className="grid grid-cols-2 gap-1.5">
              {VIDEO_LANGS.map(l => (
                <button key={l.code} type="button" onClick={() => setVideoLang(l.code)} disabled={busy}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40 ${videoLang === l.code ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-700 border-white/10 text-slate-300 hover:border-white/30'}`}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* Subtitle options */}
          <div>
            <label className="text-slate-400 text-xs mb-1 block">Subtitles</label>
            <div className="space-y-1.5">

              {/* Manual SRT/VTT */}
              <label className={`flex items-center gap-3 px-3 py-2 bg-slate-700 border rounded-xl transition-colors ${busy ? 'opacity-40 pointer-events-none' : 'cursor-pointer hover:border-blue-400'} ${subtitleFile && !extractedSegments ? 'border-blue-400' : 'border-white/10'}`}>
                <FileText className="w-4 h-4 text-green-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{subtitleFile && !extractedSegments ? subtitleFile.name : t('sub_manual')}</p>
                  <p className="text-xs text-slate-400">{t('sub_manual_desc')}</p>
                </div>
                {subtitleFile && !extractedSegments && <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />}
                <input type="file" accept=".srt,.vtt" onChange={e => handleSubtitleFile(e.target.files?.[0] || null)} className="hidden" />
              </label>

              {/* Extract embedded */}
              {ffmpegAvailable && (
                <button type="button" onClick={handleExtract} disabled={!videoFile || busy}
                  className={`w-full flex items-center gap-3 px-3 py-2 border rounded-xl transition-colors disabled:opacity-50 text-left ${extractedSegments && !transcribing ? 'bg-green-500/10 border-green-500/40' : 'bg-slate-700 border-white/10 hover:border-blue-400'}`}>
                  {extractedSegments && !transcribing ? <CheckCircle className="w-4 h-4 text-green-400 shrink-0" /> : <Wand2 className="w-4 h-4 text-purple-400 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${extractedSegments && !transcribing ? 'text-green-400' : 'text-white'}`}>
                      {extracting ? t('sub_extracting') : extractedSegments && !transcribing ? t('sub_extracted', { count: extractedSegments.length }) : t('sub_extract')}
                    </p>
                    <p className="text-xs text-slate-400">{t('sub_extract_desc')}</p>
                  </div>
                </button>
              )}

              {/* Whisper AI */}
              {whisperAvailable && (
                <button type="button" onClick={handleTranscribe} disabled={!videoFile || busy}
                  className={`w-full flex items-center gap-3 px-3 py-2 border rounded-xl transition-colors disabled:opacity-50 text-left ${transcribing ? 'bg-pink-500/10 border-pink-500/40' : 'bg-slate-700 border-white/10 hover:border-blue-400'}`}>
                  <Mic className="w-4 h-4 text-pink-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium">
                      {transcribing ? transcribeStatus || t('sub_transcribing') : t('sub_whisper')}
                    </p>
                    <p className="text-xs text-slate-400">{t('sub_whisper_desc')}</p>
                  </div>
                  {transcribing && <div className="w-3 h-3 border-2 border-pink-400 border-t-transparent rounded-full animate-spin shrink-0" />}
                </button>
              )}

              {!ffmpegAvailable && !whisperAvailable && (
                <p className="text-slate-500 text-xs px-1">{t('sub_manual_desc')}</p>
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={busy}
              className="flex-1 py-2 border border-white/20 text-slate-300 hover:text-white disabled:opacity-40 rounded-xl text-sm transition-colors">{t('cancel')}</button>
            <button type="submit" disabled={loading || busy}
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition-colors">
              {loading ? t('uploading') : t('upload')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
