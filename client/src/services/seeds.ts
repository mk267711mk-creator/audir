import { getVideoById, saveVideo, saveExercises } from './db';
import { fetchYouTubeTranscript, getYouTubeThumbnail } from './youtube';
import { generateExercises } from './quiz';
import type { Video, Difficulty } from '../types';

const SEEDED_KEY = 'audir_seeded_v6';
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

const SEED_VIDEOS = [
  {
    // BBC Learning English — globally available, has CC
    id: 'WcP0jbMfliI',
    title: 'BBC Learning English: 6 Minute English – The Power of Kindness',
    url: 'https://www.youtube.com/watch?v=WcP0jbMfliI',
  },
  {
    // BBC Ideas — globally available, has CC
    id: 'eIho2S0ZahI',
    title: 'BBC Ideas: How to be more confident',
    url: 'https://www.youtube.com/watch?v=eIho2S0ZahI',
  },
  {
    // BBC News — globally available, has CC
    id: 'bZ3CD2bnxPk',
    title: 'BBC News: How to sleep better',
    url: 'https://www.youtube.com/watch?v=bZ3CD2bnxPk',
  },
];

export async function seedDefaultVideos(
  onProgress?: (msg: string) => void
): Promise<void> {
  if (localStorage.getItem(SEEDED_KEY)) return;

  for (const seed of SEED_VIDEOS) {
    if (getVideoById(seed.id)) continue;

    try {
      onProgress?.(`Loading "${seed.title}"...`);
      const segments = await fetchYouTubeTranscript(seed.id);
      if (!segments.length) continue;

      const video: Video = {
        id: seed.id,
        title: seed.title,
        source: 'youtube',
        url: seed.url,
        thumbnail: getYouTubeThumbnail(seed.id),
        language: 'en',
        exercises_easy: 0,
        exercises_medium: 0,
        exercises_hard: 0,
      };

      for (const diff of DIFFICULTIES) {
        const exs = generateExercises(segments, diff, seed.id);
        saveExercises(seed.id, diff, exs);
        (video as any)[`exercises_${diff}`] = exs.length;
      }

      saveVideo(video);
    } catch (e) {
      console.warn(`Seed failed for ${seed.id}:`, e);
    }
  }

  localStorage.setItem(SEEDED_KEY, '1');
}
