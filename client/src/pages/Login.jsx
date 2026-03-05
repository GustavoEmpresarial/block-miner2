import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/auth';
import { Cpu, Mail, Lock, AlertCircle, Loader2, ChevronRight, Eye, EyeOff } from 'lucide-react';

export default function Login() {
    const { t } = useTranslation();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const { login, error, isLoading, isAuthenticated } = useAuthStore();

    useEffect(() => {
        if (isAuthenticated) {
            navigate('/dashboard');
        }
    }, [isAuthenticated, navigate]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const result = await login(email, password);
        if (result.success) {
            navigate('/dashboard');
        }
    };

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6 relative overflow-hidden">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] animate-pulse"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px] animate-pulse delay-700"></div>

            <div className="w-full max-w-[440px] relative z-10">
                <div className="text-center mb-10 animate-in fade-in slide-in-from-top-4 duration-700">
                    <div className="inline-flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 bg-gradient-to-tr from-primary to-blue-600 rounded-2xl flex items-center justify-center shadow-xl shadow-primary/20 overflow-hidden">
                            <img src="/icon.png" alt="Logo" className="w-7 h-7 object-contain" />
                        </div>
                        <span className="font-black text-3xl tracking-tighter text-white">BLOCK<span className="text-primary">MINER</span></span>
                    </div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">{t('auth.login.title')}</h1>
                    <p className="text-gray-500 font-medium mt-1">{t('auth.login.subtitle')}</p>
                </div>

                <div className="bg-surface/50 backdrop-blur-xl border border-gray-800/50 rounded-[2.5rem] p-10 shadow-2xl animate-in fade-in zoom-in-95 duration-700 delay-200">
                    {error && (
                        <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3 animate-in shake duration-500">
                            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                            <p className="text-red-400 text-xs font-bold leading-relaxed">{error}</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1" htmlFor="email">
                                {t('auth.login.email_label')}
                            </label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Mail className="h-5 w-5 text-gray-600 group-focus-within:text-primary transition-colors" />
                                </div>
                                <input
                                    id="email"
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="block w-full pl-12 pr-4 py-4 border border-gray-800 rounded-2xl bg-background/50 text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/50 transition-all font-medium text-sm"
                                    placeholder="exemplo@email.com"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between items-center px-1">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest" htmlFor="password">
                                    {t('auth.login.password_label')}
                                </label>
                                <Link to="/forgot-password" size="sm" className="text-[10px] font-bold text-primary hover:text-white transition-colors uppercase tracking-widest">
                                    {t('auth.login.forgot_password')}
                                </Link>
                            </div>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-gray-600 group-focus-within:text-primary transition-colors" />
                                </div>
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="block w-full pl-12 pr-12 py-4 border border-gray-800 rounded-2xl bg-background/50 text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/50 transition-all font-medium text-sm"
                                    placeholder="••••••••"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-600 hover:text-gray-400 transition-colors"
                                >
                                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full flex justify-center items-center gap-2 py-4 px-6 bg-primary hover:bg-primary-hover text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-primary/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed group"
                        >
                            {isLoading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <>
                                    {t('auth.login.submit')}
                                    <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-10 text-center">
                        <p className="text-gray-500 text-xs font-medium">
                            {t('auth.login.no_account')}{' '}
                            <Link to="/register" className="text-primary hover:text-white font-black transition-colors ml-1 uppercase tracking-widest">
                                {t('auth.login.register_now')}
                            </Link>
                        </p>
                    </div>
                </div>

                <div className="mt-8 text-center animate-in fade-in duration-1000 delay-500">
                    <Link to="/" className="text-gray-600 hover:text-gray-400 text-xs font-bold uppercase tracking-[0.2em] transition-colors">
                        {t('common.back')}
                    </Link>
                </div>
            </div>
        </div>
    );
}
