// Parts of speech patterns for word selection by difficulty
const EASY_POS = /^[A-Z][a-z]{2,}$/; // Capitalized or longer nouns/adjectives
const STOP_WORDS = new Set([
  'the','a','an','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','shall','can',
  'to','of','in','for','on','with','at','by','from','up','about','into','then',
  'that','this','these','those','it','its','i','you','he','she','we','they',
  'and','but','or','nor','so','yet','both','either','neither','not','also',
  'just','very','too','more','most','than','as','if','when','where','how',
  'what','which','who','whom','whose','my','your','his','her','our','their',
]);

/**
 * Select target words from subtitles based on difficulty
 */
export function selectTargetWords(segments, difficulty) {
  const exercises = [];

  for (const seg of segments) {
    if (!seg.text || seg.duration < 1) continue;

    const words = seg.text.split(/\s+/).filter(w => w.length > 0);
    if (words.length < 4) continue;

    const candidates = [];

    for (let i = 0; i < words.length; i++) {
      const word = words[i].replace(/[^a-zA-Z']/g, '');
      if (!word || word.length < 2) continue;

      const wordLower = word.toLowerCase();
      if (STOP_WORDS.has(wordLower) && difficulty !== 'hard') continue;
      if (word.length < 3 && difficulty === 'easy') continue;

      candidates.push({ word, index: i, original: words[i] });
    }

    if (candidates.length === 0) continue;

    // Pick one candidate per segment
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    exercises.push({ segment: seg, target });
  }

  return exercises;
}

/**
 * Generate multiple choice options for a target word
 * Collects all words from all segments to build a word pool
 */
export function generateOptions(targetWord, allSegments, difficulty) {
  const wordPool = new Set();

  for (const seg of allSegments) {
    const words = seg.text.split(/\s+/);
    for (const w of words) {
      const clean = w.replace(/[^a-zA-Z']/g, '').toLowerCase();
      if (clean.length >= 2 && clean !== targetWord.toLowerCase()) {
        wordPool.add(clean);
      }
    }
  }

  // Filter distractors by similar length to make it realistic
  const targetLen = targetWord.length;
  let distractors = [...wordPool].filter(w => {
    const diff = Math.abs(w.length - targetLen);
    if (difficulty === 'easy') return diff <= 2;
    if (difficulty === 'medium') return diff <= 4;
    return true;
  });

  // Shuffle and pick 3 distractors
  distractors = shuffle(distractors).slice(0, 3);

  // If not enough distractors, fill with common words
  const fillers = ['something', 'everything', 'nothing', 'anything', 'probably', 'really', 'actually', 'usually'];
  while (distractors.length < 3) {
    const filler = fillers[distractors.length];
    if (filler && filler !== targetWord.toLowerCase()) distractors.push(filler);
    else break;
  }

  const options = shuffle([targetWord.toLowerCase(), ...distractors.slice(0, 3)]);
  return options;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * XP awarded per correct answer based on difficulty
 */
export const XP_MAP = { easy: 10, medium: 20, hard: 40 };

/**
 * Calculate user level from total XP
 */
export function calcLevel(xp) {
  if (xp < 100) return { level: 1, title: 'Beginner' };
  if (xp < 300) return { level: 2, title: 'Explorer' };
  if (xp < 700) return { level: 3, title: 'Listener' };
  if (xp < 1500) return { level: 4, title: 'Enthusiast' };
  if (xp < 3000) return { level: 5, title: 'Advanced' };
  return { level: 6, title: 'Master' };
}

/**
 * Check and award badges
 */
export function checkBadges(stats, existingBadges) {
  const badges = new Set(existingBadges);
  if (stats.total_xp >= 100 && !badges.has('first_100')) badges.add('first_100');
  if (stats.total_xp >= 1000 && !badges.has('xp_1000')) badges.add('xp_1000');
  if (stats.current_streak >= 3 && !badges.has('streak_3')) badges.add('streak_3');
  if (stats.current_streak >= 7 && !badges.has('streak_7')) badges.add('streak_7');
  if (stats.current_streak >= 30 && !badges.has('streak_30')) badges.add('streak_30');
  return [...badges];
}
