import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Headphones, Home, BarChart2, LogOut, Globe, ChevronDown, Info, X, Youtube, Upload, Music, Mic } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { updateLang } from '../../services/auth';

function AboutModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const features = [
    { icon: <Youtube className="w-3.5 h-3.5" />, text: t('about_feature_yt'), color: 'text-red-400' },
    { icon: <Upload className="w-3.5 h-3.5" />, text: t('about_feature_video'), color: 'text-blue-400' },
    { icon: <Music className="w-3.5 h-3.5" />, text: t('about_feature_audio'), color: 'text-purple-400' },
    { icon: <Mic className="w-3.5 h-3.5" />, text: t('about_feature_whisper'), color: 'text-pink-400' },
  ];
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-sm border border-white/10 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center">
              <Headphones className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg leading-none">Audir</h2>
              <p className="text-slate-400 text-xs mt-0.5">v1.0.5</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-slate-300 text-sm leading-relaxed mb-5">{t('about_desc')}</p>

        <div className="space-y-2 mb-5">
          <p className="text-slate-500 text-xs uppercase tracking-wider font-medium mb-2">{t('about_features')}</p>
          {features.map((item, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <span className={item.color}>{item.icon}</span>
              <span className="text-slate-300 text-sm">{item.text}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-white/10 pt-4 flex items-center justify-between">
          <span className="text-slate-500 text-xs">{t('about_languages')}: EN · ES · UK · RU</span>
          <span className="text-slate-500 text-xs">© 2025 Audir</span>
        </div>
      </div>
    </div>
  );
}

const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'uk', label: 'Українська', flag: '🇺🇦' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const [langOpen, setLangOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLang = LANGUAGES.find(l => i18n.language.startsWith(l.code)) ?? LANGUAGES[0];

  const handleLangChange = (code: string) => {
    i18n.changeLanguage(code);
    if (user) updateLang(user.id, code);
    setLangOpen(false);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const navItem = (to: string, icon: React.ReactNode, label: string) => (
    <Link
      to={to}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        location.pathname === to
          ? 'bg-blue-600 text-white'
          : 'text-slate-300 hover:text-white hover:bg-white/10'
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <header className="bg-slate-800/80 backdrop-blur border-b border-white/10 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                <Headphones className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-white text-lg hidden sm:block">Audir</span>
            </Link>
            <nav className="flex items-center gap-1">
              {navItem('/', <Home className="w-4 h-4" />, t('all_videos'))}
              {navItem('/dashboard', <BarChart2 className="w-4 h-4" />, t('dashboard'))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            {/* Language dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setLangOpen(v => !v)}
                className="flex items-center gap-1.5 text-slate-300 hover:text-white text-sm px-2 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
              >
                <Globe className="w-4 h-4" />
                <span>{currentLang.flag} {currentLang.code.toUpperCase()}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {langOpen && (
                <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-white/10 rounded-xl shadow-xl overflow-hidden z-50 min-w-[160px]">
                  {LANGUAGES.map(lang => (
                    <button
                      key={lang.code}
                      onClick={() => handleLangChange(lang.code)}
                      className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left transition-colors ${
                        currentLang.code === lang.code
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <span>{lang.flag}</span>
                      <span>{lang.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span className="text-slate-400 text-sm hidden sm:block">{user?.username}</span>
            <button
              onClick={() => setAboutOpen(true)}
              className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors"
              title="О программе"
            >
              <Info className="w-4 h-4" />
            </button>
            <button
              onClick={logout}
              className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors"
              title={t('logout')}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">{children}</main>
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
    </div>
  );
}
