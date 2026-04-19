import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, XCircle, ChevronRight, Zap, SkipForward, Languages, RotateCcw } from 'lucide-react';
import type { Exercise, AttemptResult } from '../../types';
import clsx from 'clsx';

interface Props {
  exercise: Exercise;
  result: AttemptResult | null;
  onAnswer: (answer: string) => void;
  onNext: (wasCorrect?: boolean) => void;
  onReplay: () => void;
  videoLang?: string;
  inline?: boolean;
}

async function translateText(text: string, fromLang: string, toLang: string): Promise<string> {
  // MyMemory uses 2-letter codes
  const from = fromLang.slice(0, 2);
  const to = toLang.slice(0, 2);
  if (from === to) return text;
  const res = await fetch(
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`
  );
  const data = await res.json();
  return data?.responseData?.translatedText ?? '';
}

function SubtitleHint({ exercise }: { exercise: Exercise }) {
  const words = exercise.subtitle_text.split(/\s+/);
  const displayWords = words.map((w, i) => {
    if (i === exercise.word_index) {
      return <span key={i} className="text-blue-300 font-bold border-b-2 border-blue-400 px-1">_____</span>;
    }
    return <span key={i}> {w}</span>;
  });
  return <p className="text-white text-lg leading-relaxed">{displayWords}</p>;
}

export default function QuizOverlay({ exercise, result, onAnswer, onNext, onReplay, videoLang = 'en', inline = false }: Props) {
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  const [translation, setTranslation] = useState('');
  const [translating, setTranslating] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);

  const uiLang = i18n.language.slice(0, 2);
  const canTranslate = uiLang !== videoLang.slice(0, 2);

  const handleSelect = (opt: string) => {
    if (result) return;
    setSelected(opt);
    onAnswer(opt);
  };

  const handleTranslate = async () => {
    if (showTranslation) {
      setShowTranslation(false);
      return;
    }
    if (translation) {
      setShowTranslation(true);
      return;
    }
    setTranslating(true);
    try {
      const tr = await translateText(exercise.subtitle_text, videoLang, uiLang);
      setTranslation(tr);
      setShowTranslation(true);
    } catch {
      setTranslation('(translation error)');
      setShowTranslation(true);
    } finally {
      setTranslating(false);
    }
  };

  const cols = exercise.options.length > 4 ? 3 : 2;

  return (
    <div className={inline
      ? "w-full bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 rounded-2xl animate-fade-in"
      : "absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 animate-fade-in"
    }>
      {/* Top controls: Replay + Skip */}
      <div className="absolute top-3 right-3 flex items-center gap-1">
        <button
          onClick={onReplay}
          className="flex items-center gap-1 text-slate-400 hover:text-blue-400 text-xs px-2 py-1 rounded-lg hover:bg-white/10 transition-colors"
          title="Listen again"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          {t('replay')}
        </button>
        <button
          onClick={() => onNext(true)}
          className="flex items-center gap-1 text-slate-400 hover:text-white text-xs px-2 py-1 rounded-lg hover:bg-white/10 transition-colors"
          title="Skip"
        >
          <SkipForward className="w-3.5 h-3.5" />
          {t('skip')}
        </button>
      </div>

      {/* Subtitle hint */}
      <div className="text-center mb-4 max-w-lg">
        <p className="text-slate-300 text-sm mb-2">{t('fill_blank')}</p>
        <SubtitleHint exercise={exercise} />

        {/* Translation */}
        {canTranslate && (
          <button
            onClick={handleTranslate}
            className="mt-2 flex items-center gap-1 text-slate-400 hover:text-blue-400 text-xs mx-auto transition-colors"
          >
            <Languages className="w-3.5 h-3.5" />
            {translating ? t('translating') : showTranslation ? t('hide_translation') : t('show_translation')}
          </button>
        )}
        {showTranslation && translation && (
          <p className="mt-1.5 text-yellow-300 text-sm italic">{translation}</p>
        )}
      </div>

      {/* Options */}
      <div className={clsx('grid gap-3 w-full max-w-sm mb-4', cols === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
        {exercise.options.map((opt) => {
          const isSelected = selected === opt;
          const isCorrect = opt.toLowerCase() === exercise.missing_word.toLowerCase();
          let style = 'bg-white/10 border-white/20 text-white hover:bg-white/20';

          if (result) {
            if (isCorrect) style = 'bg-green-500/30 border-green-400 text-green-300';
            else if (isSelected && !isCorrect) style = 'bg-red-500/30 border-red-400 text-red-300 animate-shake';
            else style = 'bg-white/5 border-white/10 text-slate-500';
          }

          return (
            <button
              key={opt}
              onClick={() => handleSelect(opt)}
              disabled={!!result}
              className={clsx(
                'px-4 py-3 rounded-xl border font-medium text-sm transition-all',
                style,
                !result && 'hover:scale-105 active:scale-95'
              )}
            >
              {opt}
              {result && isCorrect && <CheckCircle className="inline w-4 h-4 ml-2" />}
              {result && isSelected && !isCorrect && <XCircle className="inline w-4 h-4 ml-2" />}
            </button>
          );
        })}
      </div>

      {/* Result feedback */}
      {result && (
        <div className="animate-bounce-in text-center">
          {result.correct ? (
            <div className="flex items-center gap-2 text-green-400 font-semibold mb-3">
              <CheckCircle className="w-5 h-5" />
              {t('correct')}
              {result.xp_earned > 0 && (
                <span className="flex items-center gap-1 bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full text-sm">
                  <Zap className="w-3 h-3" />
                  +{result.xp_earned} XP
                </span>
              )}
            </div>
          ) : (
            <div className="text-center mb-3">
              <div className="flex items-center gap-2 text-red-400 font-semibold justify-center">
                <XCircle className="w-5 h-5" />
                {t('wrong')}
              </div>
              <p className="text-slate-400 text-sm mt-1">
                {t('right_answer')}: <span className="text-white font-medium">{result.correct_answer}</span>
              </p>
            </div>
          )}

          <button
            onClick={() => onNext(result?.correct ?? true)}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors"
          >
            {t('next')} <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
