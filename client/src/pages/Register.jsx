import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/auth';
import { Cpu, Mail, Lock, User, AlertCircle, Loader2, ChevronRight, Eye, EyeOff, UserPlus } from 'lucide-react';

export default function Register() {
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        confirmPassword: '',
        refCode: searchParams.get('ref') || ''
    });
    const [showPassword, setShowPassword] = useState(false);
    const navigate = useNavigate();
    const { register, error, isLoading, isAuthenticated } = useAuthStore();

    useEffect(() => {
        if (isAuthenticated) {
            navigate('/dashboard');
        }
    }, [isAuthenticated, navigate]);

    const handleChange = (e) => {
        setFormData(prev => ({ ...prev, [e.target.id]: e.target.value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (formData.password !== formData.confirmPassword) {
            toast.error('Passwords do not match!');
            return;
        }

        const result = await register({
            username: formData.username,
            email: formData.email,
            password: formData.password,
            refCode: formData.refCode
        });

        if (result.success) {
            navigate('/dashboard');
        }
    };

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6 relative overflow-hidden">
            <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] animate-pulse"></div>
            <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px] animate-pulse delay-700"></div>

            <div className="w-full max-w-[480px] relative z-10">
                <div className="text-center mb-10 animate-in fade-in slide-in-from-top-4 duration-700">
                    <div className="inline-flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 bg-gradient-to-tr from-primary to-blue-600 rounded-2xl flex items-center justify-center shadow-xl shadow-primary/20 overflow-hidden">
                            <img src="/icon.png" alt="Logo" className="w-7 h-7 object-contain" />
                        </div>
                        <span className="font-black text-3xl tracking-tighter text-white">BLOCK<span className="text-primary">MINER</span></span>
                    </div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">{t('auth.register.title')}</h1>
                    <p className="text-gray-500 font-medium mt-1">{t('auth.register.subtitle')}</p>
                </div>

                <div className="bg-surface/50 backdrop-blur-xl border border-gray-800/50 rounded-[2.5rem] p-10 shadow-2xl animate-in fade-in zoom-in-95 duration-700 delay-200">
                    {error && (
                        <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                            <p className="text-red-400 text-xs font-bold leading-relaxed">{error}</p>
                        </div>
                    )}

                    {formData.refCode && (
                        <div className="mb-8 p-4 bg-primary/10 border border-primary/20 rounded-2xl flex items-center gap-3">
                            <UserPlus className="w-5 h-5 text-primary shrink-0" />
                            <p className="text-primary text-[11px] font-bold uppercase tracking-wider">
                                {t('auth.register.referral_msg', { code: formData.refCode })}
                            </p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1" htmlFor="username">
                                {t('auth.register.username_label')}
                            </label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <User className="h-5 w-5 text-gray-600 group-focus-within:text-primary transition-colors" />
                                </div>
                                <input
                                    id="username"
                                    type="text"
                                    required
                                    minLength={3}
                                    value={formData.username}
                                    onChange={handleChange}
                                    className="block w-full pl-12 pr-4 py-3.5 border border-gray-800 rounded-2xl bg-background/50 text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/50 transition-all font-medium text-sm"
                                    placeholder="Ex: minerador_pro"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1" htmlFor="email">
                                {t('auth.register.email_label')}
                            </label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Mail className="h-5 w-5 text-gray-600 group-focus-within:text-primary transition-colors" />
                                </div>
                                <input
                                    id="email"
                                    type="email"
                                    required
                                    value={formData.email}
                                    onChange={handleChange}
                                    className="block w-full pl-12 pr-4 py-3.5 border border-gray-800 rounded-2xl bg-background/50 text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/50 transition-all font-medium text-sm"
                                    placeholder="exemplo@email.com"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1" htmlFor="password">
                                    {t('auth.register.password_label')}
                                </label>
                                <div className="relative group">
                                    <input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        required
                                        minLength={6}
                                        value={formData.password}
                                        onChange={handleChange}
                                        className="block w-full px-4 py-3.5 border border-gray-800 rounded-2xl bg-background/50 text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/50 transition-all font-medium text-sm"
                                        placeholder="••••••"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1" htmlFor="confirmPassword">
                                    {t('auth.register.confirm_password_label')}
                                </label>
                                <div className="relative group">
                                    <input
                                        id="confirmPassword"
                                        type={showPassword ? 'text' : 'password'}
                                        required
                                        minLength={6}
                                        value={formData.confirmPassword}
                                        onChange={handleChange}
                                        className="block w-full px-4 py-3.5 border border-gray-800 rounded-2xl bg-background/50 text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/50 transition-all font-medium text-sm"
                                        placeholder="••••••"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between px-1">
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="flex items-center gap-2 text-[10px] font-bold text-gray-500 hover:text-primary transition-colors uppercase tracking-widest"
                            >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                {showPassword ? t('auth.register.hide_password') : t('auth.register.show_password')}
                            </button>
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
                                    {t('auth.register.submit')}
                                    <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-10 text-center">
                        <p className="text-gray-500 text-xs font-medium">
                            {t('auth.register.already_have_account')}{' '}
                            <Link to="/login" className="text-primary hover:text-white font-black transition-colors ml-1 uppercase tracking-widest">
                                {t('auth.register.login_now')}
                            </Link>
                        </p>
                    </div>
                </div>

                <div className="mt-8 text-center animate-in fade-in duration-1000 delay-500">
                    <p className="text-[10px] text-gray-600 font-bold uppercase tracking-[0.1em] max-w-[300px] mx-auto leading-relaxed">
                        {t('auth.register.terms_msg')}
                    </p>
                </div>
            </div>
        </div>
    );
}
