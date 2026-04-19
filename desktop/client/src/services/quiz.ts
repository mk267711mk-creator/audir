import type { SubtitleSegment } from './youtube';
import type { Exercise, Difficulty } from '../types';

// Words too basic to be useful for learning
const STOP_WORDS = new Set([
  'the','a','an','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','shall','can',
  'to','of','in','for','on','with','at','by','from','up','about','into','then',
  'that','this','these','those','it','its','i','you','he','she','we','they',
  'and','but','or','nor','so','yet','both','either','neither','not','also',
  'just','very','too','more','most','than','as','if','when','where','how',
  'what','which','who','whom','whose','my','your','his','her','our','their',
  'me','him','us','them','all','any','each','few','no','one','own','same',
  'here','there','now','then','than','so','such','while','after','before',
  'over','under','again','further','once','only','out','off','well','still',
  'its','it\'s','i\'m','you\'re','he\'s','she\'s','we\'re','they\'re',
  'i\'ve','you\'ve','we\'ve','they\'ve','i\'d','you\'d','he\'d','she\'d',
  'i\'ll','you\'ll','he\'ll','she\'ll','we\'ll','they\'ll','don\'t','doesn\'t',
  'didn\'t','won\'t','wouldn\'t','couldn\'t','shouldn\'t','isn\'t','aren\'t',
  'wasn\'t','weren\'t','haven\'t','hasn\'t','hadn\'t','oh','yeah','okay','ok',
  'um','uh','like','just','really','actually','basically','literally',
]);

// Very high-frequency English words — too easy to be useful
const TOO_COMMON = new Set([
  'said','say','says','say','know','think','get','go','come','make','take',
  'see','look','want','give','use','find','tell','ask','seem','feel','try',
  'leave','call','keep','let','begin','show','hear','play','run','move',
  'live','believe','hold','bring','happen','write','provide','sit','stand',
  'lose','pay','meet','include','continue','set','learn','change','lead',
  'understand','watch','follow','stop','create','speak','read','spend','grow',
  'open','walk','win','offer','remember','love','consider','appear','buy',
  'wait','serve','die','send','expect','build','stay','fall','cut','reach',
  'kill','remain','suggest','raise','pass','sell','require','report','decide',
  'pull','put','mean','turn','need','help','start','work','people','way',
  'time','year','day','man','woman','child','world','life','hand','part',
  'place','case','week','company','system','program','question','government',
  'number','night','point','home','water','room','mother','area','money',
  'story','fact','month','lot','right','study','book','eye','job','word',
  'business','issue','side','kind','head','house','service','friend','father',
  'power','hour','game','line','end','among','never','always','often','ever',
  'back','thing','things','nothing','something','everything','anything','good',
  'new','old','first','last','long','great','little','own','other','right',
  'high','small','large','next','early','young','important','public','private',
]);

// Words that signal useful vocabulary (collocations, phrases worth learning)
const VALUABLE_SUFFIXES = ['tion','sion','ment','ness','ity','ous','ful','less','ing','ive','ent','ant','ary','ory','ism','ist','ize','ise'];

function wordScore(word: string, freq: Map<string, number>, difficulty: Difficulty): number {
  const w = word.toLowerCase();
  const len = w.length;
  const count = freq.get(w) ?? 1;

  // Skip very short or very long words
  if (len < 3 || len > 15) return 0;

  // Skip stop words always
  if (STOP_WORDS.has(w)) return 0;

  // Skip proper nouns (capitalized but not at sentence start — hard to detect, use heuristic)
  if (/^[A-Z]/.test(word) && word !== word.toUpperCase()) return 0;

  // Skip pure numbers, abbreviations, URLs
  if (/^\d+$/.test(w) || /[^a-z']/i.test(w)) return 0;

  let score = 0;

  // Frequency in video: words that appear 2-5 times are ideal (relevant but not trivial)
  if (count === 1) score += 2;       // rare — potentially new vocab
  else if (count <= 3) score += 4;   // seen a few times — good for reinforcement
  else if (count <= 6) score += 3;
  else score += 1;                    // too frequent — probably too basic

  // Word length: medium-length words are more useful
  if (len >= 5 && len <= 9) score += 3;
  else if (len >= 4 && len <= 11) score += 2;
  else score += 1;

  // Valuable morphology (suffixes typical of learned vocabulary)
  if (VALUABLE_SUFFIXES.some(s => w.endsWith(s))) score += 2;

  // Penalize too-common words on easy/medium
  if (TOO_COMMON.has(w)) {
    if (difficulty === 'easy') score -= 3;
    else if (difficulty === 'medium') score -= 2;
    else score -= 1;
  }

  // On easy: prefer concrete, shorter words
  if (difficulty === 'easy' && len > 8) score -= 1;

  // On hard: prefer less common, longer vocabulary
  if (difficulty === 'hard') {
    if (len >= 7) score += 2;
    if (TOO_COMMON.has(w)) score -= 2;
  }

  return Math.max(0, score);
}

function buildFrequencyMap(segments: SubtitleSegment[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const seg of segments) {
    for (const w of seg.text.split(/\s+/)) {
      const clean = w.replace(/[^a-zA-Z']/g, '').toLowerCase();
      if (clean.length >= 3) freq.set(clean, (freq.get(clean) ?? 0) + 1);
    }
  }
  return freq;
}

// Clean up text from Whisper/yt-dlp artifacts
function cleanSegmentText(text: string): string {
  return text
    .replace(/\[.*?\]/g, '')      // remove [Music], [Applause] etc
    .replace(/\(.*?\)/g, '')      // remove (inaudible) etc
    .replace(/♪.*?♪/g, '')       // remove music notes
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Merge short subtitle segments into complete sentences
function mergeIntoSentences(segments: SubtitleSegment[]): SubtitleSegment[] {
  // Clean texts first
  const cleaned = segments
    .map(s => ({ ...s, text: cleanSegmentText(s.text) }))
    .filter(s => s.text.length > 0);

  const result: SubtitleSegment[] = [];
  let current: SubtitleSegment | null = null;

  for (const seg of cleaned) {
    if (!current) {
      current = { ...seg };
      continue;
    }

    const gap = seg.start - (current.start + current.duration);
    const combined: string = current.text.trimEnd() + ' ' + seg.text.trimStart();
    const endsWithPunctuation = /[.!?,;:]$/.test(current.text.trimEnd());
    const currentDuration = (current.start + current.duration) - current.start;
    const tooLong = combined.length > 180 || currentDuration > 10;
    const tooLongPause = gap > 1.5;

    if (!endsWithPunctuation && !tooLong && !tooLongPause) {
      // Merge segments
      current = {
        start: current.start,
        duration: (seg.start + seg.duration) - current.start,
        text: combined,
      };
    } else {
      if (current.text.length >= 10) result.push(current);
      current = { ...seg };
    }
  }
  if (current && current.text.length >= 10) result.push(current);
  return result;
}

export function generateExercises(
  segments: SubtitleSegment[],
  difficulty: Difficulty,
  videoId: string
): Exercise[] {
  // Merge segments into sentences first
  const merged = mergeIntoSentences(segments);
  const step = difficulty === 'easy' ? 2 : 1;
  const selected = merged.filter((_, i) => i % step === 0);

  // Build frequency map from ALL segments for scoring
  const freq = buildFrequencyMap(segments);

  const exercises: Exercise[] = [];

  for (const seg of selected) {
    if (!seg.text || seg.duration < 0.5) continue;

    const words = seg.text.split(/\s+/).filter(Boolean);
    if (words.length < 3) continue;

    // Score each candidate word
    const candidates: { word: string; index: number; score: number }[] = [];

    for (let i = 0; i < words.length; i++) {
      const word = words[i].replace(/[^a-zA-Z']/g, '');
      if (!word) continue;
      const score = wordScore(word, freq, difficulty);
      if (score > 0) candidates.push({ word, index: i, score });
    }

    if (!candidates.length) continue;

    // Pick the highest-scoring word (with small random tiebreak to add variety)
    candidates.sort((a, b) => (b.score + Math.random() * 0.5) - (a.score + Math.random() * 0.5));
    const target = candidates[0];

    const options = generateOptions(target.word, segments, freq, difficulty);

    exercises.push({
      id: crypto.randomUUID(),
      video_id: videoId,
      time_start: seg.start,
      time_end: seg.start + seg.duration,
      subtitle_text: seg.text,
      missing_word: target.word,
      word_index: target.index,
      options,
      difficulty,
    });
  }

  return exercises;
}

// Number of options per difficulty
export const OPTIONS_COUNT: Record<Difficulty, number> = { easy: 3, medium: 4, hard: 6 };

function generateOptions(
  targetWord: string,
  allSegments: SubtitleSegment[],
  freq: Map<string, number>,
  difficulty: Difficulty
): string[] {
  const count = OPTIONS_COUNT[difficulty] - 1;
  const targetLower = targetWord.toLowerCase();
  const targetLen = targetWord.length;

  // Build distractor pool from video vocabulary — words of similar type/length
  const pool: string[] = [];
  for (const [w, f] of freq.entries()) {
    if (w === targetLower) continue;
    if (STOP_WORDS.has(w)) continue;
    if (w.length < 3) continue;

    const lenDiff = Math.abs(w.length - targetLen);

    if (difficulty === 'easy' && lenDiff > 2) continue;
    if (difficulty === 'medium' && lenDiff > 5) continue;
    // hard: any length

    // Prefer words with similar frequency (same "level" of vocabulary)
    const targetFreq = freq.get(targetLower) ?? 1;
    const freqRatio = Math.abs(Math.log((f + 1) / (targetFreq + 1)));
    const similarFreq = freqRatio < 1.5;

    // Score distractor quality: similar length + similar frequency = good distractor
    const distScore = (similarFreq ? 2 : 0) + (lenDiff <= 2 ? 2 : lenDiff <= 4 ? 1 : 0);
    if (distScore > 0) pool.push(w);
  }

  // Sort by distractor quality and take top candidates before shuffling
  let distractors = shuffle(pool).slice(0, count * 3);
  distractors = shuffle(distractors).slice(0, count);

  // Fallback fillers if not enough candidates
  const fillers = ['consider','approach','provide','suggest','involve','require','reflect','achieve','maintain','develop'];
  while (distractors.length < count) {
    const f = fillers[distractors.length % fillers.length];
    if (f && f !== targetLower && !distractors.includes(f)) distractors.push(f);
    else break;
  }

  return shuffle([targetLower, ...distractors.slice(0, count)]);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const XP_MAP: Record<Difficulty, number> = { easy: 10, medium: 20, hard: 40 };

export function calcLevel(xp: number): { level: number; title: string } {
  if (xp < 100)  return { level: 1, title: 'Beginner' };
  if (xp < 300)  return { level: 2, title: 'Explorer' };
  if (xp < 700)  return { level: 3, title: 'Listener' };
  if (xp < 1500) return { level: 4, title: 'Enthusiast' };
  if (xp < 3000) return { level: 5, title: 'Advanced' };
  return { level: 6, title: 'Master' };
}
