import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';
import { generateExercises } from './quiz.js';
import { fetchSubtitles } from './subtitles.js';

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('BOT_TOKEN не задан в .env');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// In-memory sessions: chatId -> { difficulty, lang, exercises, index, score }
const sessions = new Map();

function getSession(chatId) {
  return sessions.get(chatId) || { difficulty: 'medium', lang: 'en' };
}

function extractVideoId(text) {
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return null;
}

function buildExerciseText(ex, index, total) {
  const words = ex.subtitle_text.split(/\s+/);
  // Replace the target word with underscores, keep surrounding punctuation
  const raw = words[ex.word_index] || '';
  const blanked = raw.replace(
    new RegExp(ex.missing_word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
    '▢▢▢'
  );
  words[ex.word_index] = blanked;
  const displayText = words.join(' ');

  return `📚 *Упражнение ${index + 1}/${total}*\n\n"${displayText}"\n\nВыбери правильное слово:`;
}

async function sendExercise(ctx, chatId) {
  const session = sessions.get(chatId);
  if (!session || !session.exercises) return;

  const { exercises, index } = session;

  if (index >= exercises.length) {
    const { correct, total } = session.score;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    sessions.delete(chatId);
    return ctx.reply(
      `🎉 *Готово!*\n\n✅ Правильно: ${correct} из ${total}\n⭐ Точность: ${pct}%\n\nОтправь новую ссылку YouTube, чтобы продолжить.`,
      { parse_mode: 'Markdown' }
    );
  }

  const ex = exercises[index];
  const text = buildExerciseText(ex, index, exercises.length);

  const buttons = ex.options.map(opt => Markup.button.callback(opt, `ans:${opt}`));
  const perRow = ex.difficulty === 'hard' ? 3 : 2;
  const rows = [];
  for (let i = 0; i < buttons.length; i += perRow) {
    rows.push(buttons.slice(i, i + perRow));
  }

  await ctx.reply(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(rows),
  });
}

// /start
bot.start((ctx) => {
  ctx.reply(
    '👋 Привет! Я помогу тренировать восприятие иностранного языка на слух.\n\n' +
    'Отправь ссылку на YouTube видео с субтитрами — и я создам упражнения.\n\n' +
    '*Команды:*\n' +
    '/easy — лёгкий уровень\n' +
    '/medium — средний (по умолчанию)\n' +
    '/hard — сложный\n' +
    '/lang\\_en — английские субтитры (по умолчанию)\n' +
    '/lang\\_es — испанские\n' +
    '/lang\\_uk — украинские\n' +
    '/lang\\_ru — русские\n' +
    '/stop — остановить упражнение',
    { parse_mode: 'Markdown' }
  );
});

// Difficulty commands
bot.command('easy', (ctx) => {
  const s = getSession(ctx.chat.id);
  sessions.set(ctx.chat.id, { ...s, difficulty: 'easy' });
  ctx.reply('✅ Сложность: лёгкая (easy)');
});
bot.command('medium', (ctx) => {
  const s = getSession(ctx.chat.id);
  sessions.set(ctx.chat.id, { ...s, difficulty: 'medium' });
  ctx.reply('✅ Сложность: средняя (medium)');
});
bot.command('hard', (ctx) => {
  const s = getSession(ctx.chat.id);
  sessions.set(ctx.chat.id, { ...s, difficulty: 'hard' });
  ctx.reply('✅ Сложность: сложная (hard)');
});

// Language commands
bot.command('lang_en', (ctx) => {
  const s = getSession(ctx.chat.id);
  sessions.set(ctx.chat.id, { ...s, lang: 'en' });
  ctx.reply('✅ Язык субтитров: английский (en)');
});
bot.command('lang_es', (ctx) => {
  const s = getSession(ctx.chat.id);
  sessions.set(ctx.chat.id, { ...s, lang: 'es' });
  ctx.reply('✅ Язык субтитров: испанский (es)');
});
bot.command('lang_uk', (ctx) => {
  const s = getSession(ctx.chat.id);
  sessions.set(ctx.chat.id, { ...s, lang: 'uk' });
  ctx.reply('✅ Язык субтитров: украинский (uk)');
});
bot.command('lang_ru', (ctx) => {
  const s = getSession(ctx.chat.id);
  sessions.set(ctx.chat.id, { ...s, lang: 'ru' });
  ctx.reply('✅ Язык субтитров: русский (ru)');
});

// /stop
bot.command('stop', (ctx) => {
  const chatId = ctx.chat.id;
  const session = sessions.get(chatId);
  if (session && session.exercises) {
    sessions.delete(chatId);
    ctx.reply('Упражнение остановлено.');
  } else {
    // Keep difficulty/lang settings but clear exercises
    ctx.reply('Нет активного упражнения.');
  }
});

// Handle YouTube URLs
bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return; // ignore unknown commands

  const videoId = extractVideoId(text);
  if (!videoId) {
    // Only reply if it looks like they were trying to send a URL
    if (text.includes('youtube') || text.includes('youtu.be')) {
      ctx.reply('❌ Не удалось распознать ссылку YouTube. Пример:\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ');
    }
    return;
  }

  const s = getSession(ctx.chat.id);
  const { difficulty, lang } = s;

  const loadingMsg = await ctx.reply('⏳ Загружаю субтитры...');

  try {
    const { segments, lang: actualLang } = await fetchSubtitles(videoId, lang);

    const exercises = generateExercises(segments, difficulty, videoId);
    if (exercises.length === 0) {
      await ctx.deleteMessage(loadingMsg.message_id).catch(() => {});
      return ctx.reply('❌ Не удалось создать упражнения. Попробуй другое видео или другой язык субтитров.');
    }

    sessions.set(ctx.chat.id, {
      difficulty,
      lang,
      exercises,
      index: 0,
      score: { correct: 0, total: 0 },
    });

    await ctx.deleteMessage(loadingMsg.message_id).catch(() => {});

    const langNote = actualLang !== lang ? ` (загружены ${actualLang}, запрошены ${lang})` : '';
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    await ctx.reply(
      `✅ Загружено ${exercises.length} упражнений · сложность: ${difficulty}${langNote}\n\n🎬 Смотри видео параллельно:\n${videoUrl}\n\nНачинаем!`
    );

    await sendExercise(ctx, ctx.chat.id);
  } catch (e) {
    await ctx.deleteMessage(loadingMsg.message_id).catch(() => {});
    ctx.reply('❌ ' + e.message);
  }
});

// Handle answer button clicks
bot.action(/^ans:(.+)$/, async (ctx) => {
  const answer = ctx.match[1];
  const chatId = ctx.chat.id;
  const session = sessions.get(chatId);

  if (!session || !session.exercises) {
    await ctx.answerCbQuery('Нет активного упражнения');
    return;
  }

  const ex = session.exercises[session.index];
  if (!ex) {
    await ctx.answerCbQuery('');
    return;
  }

  const correct = answer.toLowerCase() === ex.missing_word.toLowerCase();
  session.score.total++;
  if (correct) session.score.correct++;
  session.index++;

  // Show popup notification
  await ctx.answerCbQuery(correct ? '✅ Правильно!' : `❌ Неверно! → ${ex.missing_word}`);

  // Edit the exercise message to reveal the answer
  const resultLine = correct
    ? `✅ *Правильно!* — \`${ex.missing_word}\``
    : `❌ *Неверно.* Правильный ответ: \`${ex.missing_word}\``;

  try {
    await ctx.editMessageText(
      `"${ex.subtitle_text}"\n\n${resultLine}`,
      { parse_mode: 'Markdown' }
    );
  } catch {}

  // Send next exercise
  await sendExercise(ctx, chatId);
});

bot.launch(() => console.log('Audir bot запущен'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
