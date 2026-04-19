import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Headphones } from 'lucide-react';
import toast from 'react-hot-toast';
import { loginSimple } from '../../services/auth';
import { useAuthStore } from '../../store/authStore';

const LANGS = [
  { code: 'en', label: 'EN' },
  { code: 'uk', label: 'UA' },
  { code: 'es', label: 'ES' },
  { code: 'ru', label: 'RU' },
];

export default function AuthPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const setUser = useAuthStore(s => s.setUser);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await loginSimple(name);
      setUser(user);
      navigate('/');
    } catch (err: any) {
      toast.error(err.message || t('error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="fixed top-4 right-4 flex gap-1">
        {LANGS.map(l => (
          <button
            key={l.code}
            onClick={() => i18n.changeLanguage(l.code)}
            className={`text-sm px-3 py-1 rounded-full transition-colors ${i18n.language === l.code ? 'bg-blue-500 text-white' : 'bg-white/10 text-blue-300 hover:text-white'}`}
          >
            {l.label}
          </button>
        ))}
      </div>

      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-500 rounded-3xl mb-5 shadow-lg shadow-blue-500/30">
            <Headphones className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white tracking-tight">Audir</h1>
          <p className="text-blue-300 mt-2">{t('tagline')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            autoCapitalize="words"
            placeholder={t('your_name')}
            value={name}
            onChange={e => setName(e.target.value)}
            required
            autoFocus
            className="w-full px-5 py-4 bg-white/10 border border-white/20 rounded-2xl text-white text-lg placeholder-blue-300/60 focus:outline-none focus:border-blue-400 transition-colors text-center"
          />
          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full py-4 bg-blue-500 hover:bg-blue-400 active:bg-blue-600 disabled:opacity-40 text-white text-lg font-semibold rounded-2xl transition-colors shadow-lg shadow-blue-500/30"
          >
            {loading ? '...' : t('start')}
          </button>
        </form>
      </div>
    </div>
  );
}
