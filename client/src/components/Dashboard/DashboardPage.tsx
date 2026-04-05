import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Zap, Flame, Trophy, Target, Star } from 'lucide-react';
import { getDashboardData } from '../../services/db';

const BADGE_META: Record<string, { icon: string; label: string }> = {
  first_100: { icon: '⚡', label: 'badge_first_100' },
  xp_1000: { icon: '🏆', label: 'badge_xp_1000' },
  streak_3: { icon: '🔥', label: 'badge_streak_3' },
  streak_7: { icon: '⚔️', label: 'badge_streak_7' },
  streak_30: { icon: '👑', label: 'badge_streak_30' },
};

const LEVEL_XP = [0, 100, 300, 700, 1500, 3000, Infinity];

export default function DashboardPage() {
  const { t } = useTranslation();
  const [data, setData] = useState(() => getDashboardData());

  useEffect(() => { setData(getDashboardData()); }, []);

  const { stats, videoProgress } = data;

  if (!stats.total_xp && !videoProgress.length) {
    return <div className="text-slate-400 text-center py-20">No activity yet. Start playing!</div>;
  }

  const lvl = stats.level;
  const xpInLevel = stats.total_xp - LEVEL_XP[lvl - 1];
  const xpForNext = LEVEL_XP[lvl] - LEVEL_XP[lvl - 1];
  const lvlProgress = Math.min(100, Math.round((xpInLevel / xpForNext) * 100));

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-white">{t('dashboard')}</h1>

      <div className="bg-gradient-to-br from-blue-900 to-blue-800 rounded-2xl p-6 border border-blue-700">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-blue-300 text-sm">{t('level')} {stats.level}</p>
            <h2 className="text-2xl font-bold text-white">{t(`level_${stats.levelTitle?.toLowerCase()}`)}</h2>
          </div>
          <div className="text-4xl font-black text-blue-400">{stats.level}</div>
        </div>
        <div className="h-2 bg-blue-950 rounded-full overflow-hidden">
          <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${lvlProgress}%` }} />
        </div>
        <p className="text-blue-300 text-xs mt-1">{xpInLevel} / {xpForNext} XP to next level</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard icon={<Zap className="w-5 h-5 text-yellow-400" />} value={stats.total_xp} label={t('total_xp')} color="bg-yellow-500/10" />
        <StatCard icon={<Flame className="w-5 h-5 text-orange-400" />} value={stats.current_streak} label={t('streak')} sub={t('days')} color="bg-orange-500/10" />
        <StatCard icon={<Trophy className="w-5 h-5 text-purple-400" />} value={stats.longest_streak} label="Best" sub={t('days')} color="bg-purple-500/10" />
      </div>

      {stats.badges.length > 0 && (
        <div className="bg-slate-800 rounded-2xl p-5 border border-white/10">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <Star className="w-4 h-4 text-yellow-400" />{t('badges')}
          </h3>
          <div className="flex flex-wrap gap-3">
            {stats.badges.map(badge => {
              const meta = BADGE_META[badge];
              return (
                <div key={badge} className="flex items-center gap-2 bg-slate-700 px-3 py-2 rounded-xl">
                  <span className="text-xl">{meta?.icon || '🏅'}</span>
                  <span className="text-sm text-white">{t(meta?.label || badge)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {videoProgress.length > 0 && (
        <div className="bg-slate-800 rounded-2xl p-5 border border-white/10">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <Target className="w-4 h-4 text-blue-400" />{t('recent_activity')}
          </h3>
          <div className="space-y-3">
            {videoProgress.filter(v => v.total_exercises > 0).map(vp => {
              const acc = vp.total_exercises > 0 ? Math.round((vp.correct_answers / vp.total_exercises) * 100) : 0;
              return (
                <div key={vp.id} className="flex items-center gap-3">
                  {vp.thumbnail && <img src={vp.thumbnail} alt="" className="w-12 h-8 object-cover rounded-lg shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm truncate">{vp.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${acc}%` }} />
                      </div>
                      <span className="text-xs text-slate-400">{acc}%</span>
                    </div>
                  </div>
                  <span className="text-yellow-400 text-sm font-medium shrink-0">+{vp.xp} XP</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, value, label, sub, color }: {
  icon: React.ReactNode; value: number; label: string; sub?: string; color: string;
}) {
  return (
    <div className={`${color} rounded-2xl p-4 border border-white/10 text-center`}>
      <div className="flex justify-center mb-2">{icon}</div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </div>
  );
}
