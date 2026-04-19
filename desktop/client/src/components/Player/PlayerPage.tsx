import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Volume2, Play, Music } from 'lucide-react';
import toast from 'react-hot-toast';
import { getVideoById, getExercises, recordAttempt, markCompleted, addXp, saveVideo } from '../../services/db';
import { loadFile } from '../../services/fileStorage';
import type { Video, Exercise, AttemptResult, Difficulty } from '../../types';
import { XP_MAP } from '../../services/quiz';
import QuizOverlay from './QuizOverlay';
import SubtitleBar from './SubtitleBar';
import ScoreBar from './ScoreBar';
import DifficultyPicker from './DifficultyPicker';

declare global {
  interface Window { YT: any; onYouTubeIframeAPIReady: () => void; }
}

export default function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [video, setVideo] = useState<Video | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>(
    (searchParams.get('difficulty') as Difficulty) || 'medium'
  );
  const [started, setStarted] = useState(false);
  const [currentExercise, setCurrentExercise] = useState<Exercise | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0, xp: 0 });
  const [lastResult, setLastResult] = useState<AttemptResult | null>(null);
  const [currentSubtitle, setCurrentSubtitle] = useState('');
  const [needsTap, setNeedsTap] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const playerRef = useRef<any>(null);
  const playerDivRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  // Use refs for everything checkTime needs — avoids all stale-closure issues
  const exercisesRef = useRef<Exercise[]>([]);
  const exerciseIdxRef = useRef(0);
  const pausingRef = useRef(false);
  const difficultyRef = useRef<Difficulty>('medium');
  const isPlayingRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => { exercisesRef.current = exercises; }, [exercises]);
  useEffect(() => { difficultyRef.current = difficulty; }, [difficulty]);

  useEffect(() => {
    if (!id) return;
    const v = getVideoById(id);
    if (!v) { navigate('/'); return; }

    // For local files: blob URLs die on app restart — restore from IndexedDB
    if (v.source === 'upload' || v.source === 'audio') {
      loadFile(v.id).then(file => {
        if (file) {
          const freshUrl = URL.createObjectURL(file);
          const restored = { ...v, file_path: freshUrl };
          saveVideo(restored);
          setVideo(restored);
        } else {
          setVideo(v); // no file in IndexedDB (old upload), will fail to play
        }
      });
    } else {
      setVideo(v);
    }

    const exs = getExercises(id, difficulty);
    setExercises(exs);
    exercisesRef.current = exs;
    exerciseIdxRef.current = 0;
    setCurrentExercise(null);
    setLastResult(null);
    setScore({ correct: 0, total: 0, xp: 0 });
    setStarted(false);
    setNeedsTap(false);
  }, [id, difficulty]);

  // Single persistent polling loop — all logic via refs, zero closure issues
  const tick = useCallback(() => {
    if (pausingRef.current) return;

    const time = playerRef.current?.getCurrentTime?.()
      ?? videoRef.current?.currentTime
      ?? audioRef.current?.currentTime
      ?? 0;

    const exList = exercisesRef.current;
    const idx = exerciseIdxRef.current;
    if (idx >= exList.length) return;

    const ex = exList[idx];

    // Update subtitle bar
    const active = exList.find(e => time >= e.time_start - 0.3 && time <= e.time_end + 0.3);
    if (active) setCurrentSubtitle(active.subtitle_text);
    setCurrentTime(time);

    // Update duration for YouTube
    const dur = playerRef.current?.getDuration?.() ?? audioRef.current?.duration ?? 0;
    if (dur > 0) setDuration(dur);

    const triggerTime = ex.time_end + 1.5;

    if (time >= triggerTime) {
      pausingRef.current = true;
      exerciseIdxRef.current = idx + 1;
      playerRef.current?.pauseVideo?.();
      videoRef.current?.pause?.();
      audioRef.current?.pause?.();
      setCurrentExercise(ex);
    }
  }, []);

  const startInterval = useCallback(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(tick, 200);
  }, [tick]);

  // YouTube player setup
  useEffect(() => {
    if (!video || video.source !== 'youtube' || !started) return;

    const videoId = video.url?.match(/(?:v=|youtu\.be\/)([^&?]+)/)?.[1];
    if (!videoId) return;

    const initPlayer = () => {
      if (!playerDivRef.current) return;
      playerRef.current = new window.YT.Player(playerDivRef.current, {
        videoId,
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1, cc_load_policy: 0 },
        events: {
          onStateChange: (e: any) => {
            if (e.data === window.YT.PlayerState.PLAYING) {
              isPlayingRef.current = true;
              setNeedsTap(false);
              startInterval();
            } else {
              isPlayingRef.current = false;
            }
          },
        },
      });
    };

    if (window.YT?.Player) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const s = document.createElement('script');
        s.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(s);
      }
    }

    return () => {
      clearInterval(intervalRef.current);
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [video, started, startInterval]);

  // Local video tracking
  const handleVideoTimeUpdate = useCallback(() => {
    tick();
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      if (videoRef.current.duration) setDuration(videoRef.current.duration);
    }
  }, [tick]);
  const handleVideoPlay = useCallback(() => {
    setNeedsTap(false);
    startInterval();
  }, [startInterval]);

  const handleAudioTimeUpdate = useCallback(() => {
    tick();
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      if (audioRef.current.duration) setDuration(audioRef.current.duration);
    }
  }, [tick]);
  const handleAudioPlay = useCallback(() => {
    setNeedsTap(false);
    startInterval();
  }, [startInterval]);

  const tryResume = useCallback(() => {
    playerRef.current?.playVideo?.();
    videoRef.current?.play?.();
    audioRef.current?.play?.();
    setNeedsTap(false);
    pausingRef.current = false;
    startInterval();
  }, [startInterval]);

  const handleAnswer = useCallback((answer: string) => {
    if (!currentExercise || !id) return;
    const isCorrect = answer.toLowerCase() === currentExercise.missing_word.toLowerCase();
    const xpEarned = isCorrect ? XP_MAP[difficultyRef.current] : 0;

    recordAttempt(id, isCorrect, xpEarned);
    if (xpEarned > 0) {
      const { newBadges } = addXp(xpEarned, difficultyRef.current);
      newBadges.forEach(b => toast.success(`🏆 ${t(`badge_${b}`)}`));
    }

    setLastResult({
      correct: isCorrect,
      correct_answer: currentExercise.missing_word,
      xp_earned: xpEarned,
      new_badges: [],
    });
    setScore(s => ({ correct: s.correct + (isCorrect ? 1 : 0), total: s.total + 1, xp: s.xp + xpEarned }));
  }, [currentExercise, id, t]);

  const resumeVideo = useCallback((seekTo?: number) => {
    pausingRef.current = false;
    const player = playerRef.current;
    if (player?.playVideo) {
      if (seekTo !== undefined) player.seekTo(seekTo, true);
      player.playVideo();
      setTimeout(() => {
        if (!isPlayingRef.current && pausingRef.current === false) setNeedsTap(true);
      }, 800);
    } else if (videoRef.current) {
      if (seekTo !== undefined) videoRef.current.currentTime = seekTo;
      videoRef.current.play?.();
    } else if (audioRef.current) {
      if (seekTo !== undefined) audioRef.current.currentTime = seekTo;
      audioRef.current.play?.();
    }
    startInterval();
  }, [startInterval]);

  const seekToTime = useCallback((time: number) => {
    setCurrentExercise(null);
    setLastResult(null);
    pausingRef.current = false;
    const idx = exercisesRef.current.findIndex(e => e.time_end > time);
    exerciseIdxRef.current = idx === -1 ? exercisesRef.current.length : idx;
    resumeVideo(time);
  }, [resumeVideo]);

  const handleNext = useCallback((wasCorrect?: boolean) => {
    const exercise = exercisesRef.current[exerciseIdxRef.current - 1];

    // If wrong — rewind exactly to start of the phrase and repeat
    if (wasCorrect === false && exercise) {
      setCurrentExercise(null);
      setLastResult(null);
      exerciseIdxRef.current -= 1; // repeat this exercise
      resumeVideo(Math.max(0, exercise.time_start - 1.5));
      return;
    }

    setCurrentExercise(null);
    setLastResult(null);

    if (exerciseIdxRef.current >= exercisesRef.current.length) {
      setScore(s => {
        toast.success(`${t('well_done')} +${s.xp} XP`);
        return s;
      });
      if (id) markCompleted(id);
      return;
    }

    // Always jump to the start of the next exercise with 2s of context
    const nextExercise = exercisesRef.current[exerciseIdxRef.current];
    if (nextExercise) {
      resumeVideo(Math.max(0, nextExercise.time_start - 2));
    } else {
      resumeVideo();
    }
  }, [id, t, resumeVideo]);

  if (!video) return null;

  function formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-4">
        <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-white font-semibold flex-1 truncate">{video.title}</h1>
        <DifficultyPicker value={difficulty} onChange={(d) => { setDifficulty(d); setStarted(false); }} />
      </div>

      <ScoreBar score={score} total={exercises.length} />

      {video.source === 'audio' && (
        <>
          {/* <audio> always in DOM so playback position is preserved across quiz open/close */}
          {started && (
            <audio
              ref={audioRef}
              src={video.file_path}
              autoPlay
              onTimeUpdate={handleAudioTimeUpdate}
              onPlay={handleAudioPlay}
              className="hidden"
            />
          )}

          {/* Visual panel — hidden while quiz is showing */}
          {!currentExercise && (
            <div className="relative rounded-2xl bg-slate-900 border border-white/10 mb-3" style={{ minHeight: 180 }}>
              {!started ? (
                <div
                  className="flex flex-col items-center justify-center py-12 cursor-pointer group"
                  onClick={() => setStarted(true)}
                >
                  <div className="w-20 h-20 bg-purple-600/30 rounded-full flex items-center justify-center border border-purple-500/40 group-hover:scale-110 transition-transform mb-4">
                    <Music className="w-10 h-10 text-purple-400" />
                  </div>
                  <p className="text-white font-medium">{t('tap_to_start')}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 px-4 min-h-[160px]">
                  <div className="w-16 h-16 bg-purple-600/30 rounded-full flex items-center justify-center border border-purple-500/40 mb-4 animate-pulse">
                    <Music className="w-8 h-8 text-purple-400" />
                  </div>
                </div>
              )}
              {needsTap && (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 cursor-pointer rounded-2xl"
                  onClick={tryResume}
                >
                  <div className="w-16 h-16 bg-purple-600 rounded-full flex items-center justify-center mb-3">
                    <Play className="w-8 h-8 text-white ml-1" />
                  </div>
                  <p className="text-white font-medium">{t('tap_to_start')}</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Audio quiz — rendered as inline block so height is unconstrained */}
      {video.source === 'audio' && currentExercise && (
        <QuizOverlay
          exercise={currentExercise}
          result={lastResult}
          onAnswer={handleAnswer}
          onNext={handleNext}
          onReplay={() => {
            const ex = currentExercise;
            setCurrentExercise(null);
            setLastResult(null);
            exerciseIdxRef.current -= 1;
            resumeVideo(Math.max(0, ex.time_start - 1.5));
          }}
          videoLang={video.language || 'en'}
          inline
        />
      )}

      {video.source !== 'audio' && (
        /* ── Video player ── */
        <div className="relative rounded-2xl overflow-hidden bg-black mb-3" style={{ aspectRatio: '16/9', maxHeight: 'calc(100vh - 260px)' }}>
          {!started ? (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer group"
              style={video.thumbnail ? { backgroundImage: `url(${video.thumbnail})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}
              onClick={() => setStarted(true)}
            >
              <div className="absolute inset-0 bg-black/50" />
              <div className="relative w-20 h-20 bg-blue-500 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                <Volume2 className="w-8 h-8 text-white" />
              </div>
              <p className="relative mt-4 text-white font-medium">{t('tap_to_start')}</p>
            </div>
          ) : video.source === 'youtube' ? (
            <div ref={playerDivRef} className="w-full h-full" />
          ) : (
            <video
              ref={videoRef}
              src={video.file_path}
              className="w-full h-full"
              autoPlay
              onTimeUpdate={handleVideoTimeUpdate}
              onPlay={handleVideoPlay}
            />
          )}

          {needsTap && !currentExercise && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 cursor-pointer"
              onClick={tryResume}
            >
              <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mb-3">
                <Play className="w-8 h-8 text-white ml-1" />
              </div>
              <p className="text-white font-medium">{t('tap_to_start')}</p>
            </div>
          )}

          {currentExercise && (
            <QuizOverlay
              exercise={currentExercise}
              result={lastResult}
              onAnswer={handleAnswer}
              onNext={handleNext}
              onReplay={() => {
                const ex = currentExercise;
                setCurrentExercise(null);
                setLastResult(null);
                exerciseIdxRef.current -= 1;
                resumeVideo(Math.max(0, ex.time_start - 1.5));
              }}
              videoLang={video.language || 'en'}
            />
          )}
        </div>
      )}

      {/* Progress bar — click to seek */}
      {started && duration > 0 && (
        <div className="mb-2 px-1">
          <div
            className="relative h-2 bg-slate-700 rounded-full cursor-pointer group"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = (e.clientX - rect.left) / rect.width;
              seekToTime(ratio * duration);
            }}
          >
            <div
              className="h-full bg-blue-500 rounded-full transition-none"
              style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
            />
            {/* Exercise markers */}
            {exercises.map(ex => (
              <div
                key={ex.id}
                className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-yellow-400 opacity-70"
                style={{ left: `${(ex.time_start / duration) * 100}%` }}
              />
            ))}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`, transform: 'translate(-50%, -50%)' }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      )}

      <SubtitleBar text={currentExercise ? '' : currentSubtitle} exercise={currentExercise} defaultHidden={difficulty === 'hard'} />
    </div>
  );
}
