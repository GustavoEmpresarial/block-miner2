import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore, api } from '../store/auth';
import { Cpu, Mail, Lock, AlertCircle, Loader2, ChevronRight, Eye, EyeOff, ShieldCheck, KeyRound, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export default function Login() {
    const { t } = useTranslation();
        const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    
    // Recovery & 2FA state
    const [requires2FA, setRequires2FA] = useState(false);
    const [twoFactorToken, setTwoFactorToken] = useState('');
    const [localError, setLocalError] = useState('');
    const [showResetHint, setShowResetHint] = useState(false);
    
    // Legacy Reset States
    const [showLegacyReset, setShowLegacyReset] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isResetting, setIsResetting] = useState(false);

    const navigate = useNavigate();
    const { login, error, isLoading, isAuthenticated, checkSession } = useAuthStore();

    useEffect(() => {
        if (isAuthenticated) {
            navigate('/dashboard');
        }
    }, [isAuthenticated, navigate]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLocalError('');
        setShowResetHint(false);
        
        try {
            const res = await api.post('/auth/login', {
                identifier,
                password,
                twoFactorToken: requires2FA ? twoFactorToken : undefined
            });

            if (res.data.require2FA) {
                setRequires2FA(true);
                return;
            }

            if (res.data.needsLegacyReset) {
                setShowLegacyReset(true);
                return;
            }

            if (res.data.ok) {
                await checkSession();
                navigate('/dashboard');
            }
        } catch (err) {
            if (err.response?.data?.require2FA) {
                setRequires2FA(true);
            } else if (err.response?.data?.needsLegacyReset) {
                setShowLegacyReset(true);
            } else {
                const fieldError = err.response?.data?.errors?.[0]?.message;
                const code = err.response?.data?.code;

                const errorByCode = {
                    IDENTIFIER_NOT_FOUND: t('auth.login.errors.identifier_not_found'),
                    INVALID_CREDENTIALS: t('auth.login.errors.invalid_credentials'),
                    INVALID_2FA: t('auth.login.errors.invalid_2fa'),
                    LOGIN_FAILED: t('auth.login.errors.login_failed')
                };

                if (code === 'IDENTIFIER_NOT_FOUND' || code === 'INVALID_CREDENTIALS') {
                    setShowResetHint(true);
                }
                setLocalError(fieldError || errorByCode[code] || err.response?.data?.message || t('auth.login.errors.login_failed'));
            }
        }
    };

    const handleLegacyReset = async (e) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) return toast.error("As senhas não coincidem.");
        if (newPassword.length < 8) return toast.error("A senha deve ter pelo menos 8 caracteres.");

        try {
            setIsResetting(true);
            const res = await api.post('/auth/legacy-password-reset', { identifier, newPassword });
            if (res.data.ok) {
                toast.success(res.data.message);
                setShowLegacyReset(false);
                setPassword(newPassword); // Preenche a nova senha para o usuário logar
            }
        } catch (err) {
            toast.error(err.response?.data?.message || "Erro ao atualizar senha.");
        } finally {
            setIsResetting(false);
        }
    };

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6 relative overflow-hidden">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] animate-pulse"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px] animate-pulse delay-700"></div>

            {/* Modal de Reset de Migração */}
            {showLegacyReset && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/90 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-surface border border-primary/30 rounded-[2.5rem] p-10 max-w-md w-full shadow-2xl shadow-primary/10">
                        <div className="text-center space-y-6">
                            <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto">
                                <KeyRound className="w-10 h-10 text-primary" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter">Migração de Conta</h2>
                                <p className="text-gray-400 text-sm mt-2 leading-relaxed">
                                    Identificamos que sua conta é veterana. Para concluir sua migração com segurança, defina uma <span className="text-white font-bold">nova senha</span> de acesso.
                                </p>
                            </div>

                            <form onSubmit={handleLegacyReset} className="space-y-4 text-left">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Nova Senha</label>
                                    <input 
                                        type="password" 
                                        required
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="w-full bg-background border border-gray-800 rounded-2xl py-4 px-6 text-sm font-bold text-white focus:outline-none focus:border-primary/50 transition-all"
                                        placeholder="No mínimo 8 caracteres"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Confirmar Senha</label>
                                    <input 
                                        type="password" 
                                        required
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="w-full bg-background border border-gray-800 rounded-2xl py-4 px-6 text-sm font-bold text-white focus:outline-none focus:border-primary/50 transition-all"
                                        placeholder="Repita a nova senha"
                                    />
                                </div>
                                <button 
                                    type="submit"
                                    disabled={isResetting}
                                    className="w-full py-4 bg-primary text-slate-950 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                                >
                                    {isResetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                    Atualizar e Entrar
                                </button>
                                <button 
                                    type="button"
                                    onClick={() => setShowLegacyReset(false)}
                                    className="w-full text-center text-[10px] text-gray-600 font-bold uppercase tracking-widest mt-2"
                                >
                                    Cancelar
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}

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
                    {(error || localError) && (
                        <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3 animate-in shake duration-500">
                            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                            <p className="text-red-400 text-xs font-bold leading-relaxed">{localError || error}</p>
                        </div>
                    )}
                    {showResetHint && !requires2FA && (
                        <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl text-xs font-semibold text-blue-300 leading-relaxed">
                            We could not find your account details or password. Try resetting your password{" "}
                            <Link to="/forgot-password" className="underline hover:text-white transition-colors">
                                here
                            </Link>.
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {!requires2FA ? (
                            <>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1" htmlFor="identifier">
                        {t('auth.login.identifier_label')}
                                    </label>
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <Mail className="h-5 w-5 text-gray-600 group-focus-within:text-primary transition-colors" />
                                        </div>
                                        <input
                                            id="identifier"
                                            type="text"
                                            required
                                            value={identifier}
                                            onChange={(e) => setIdentifier(e.target.value)}
                                            className="block w-full pl-12 pr-4 py-4 border border-gray-800 rounded-2xl bg-background/50 text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/50 transition-all font-medium text-sm"
                            placeholder={t('auth.login.identifier_placeholder')}
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
                            </>
                        ) : (
                            <div className="space-y-4 animate-in fade-in zoom-in duration-300">
                                <div className="flex justify-center mb-6">
                                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                                        <ShieldCheck className="w-8 h-8 text-primary" />
                                    </div>
                                </div>
                                <div className="text-center mb-6">
                                    <h3 className="text-white font-bold text-lg">Autenticação 2FA</h3>
                                    <p className="text-sm text-gray-400 mt-1">Insira o código do seu Authenticator.</p>
                                </div>
                                <input
                                    type="text"
                                    required
                                    maxLength={6}
                                    value={twoFactorToken}
                                    onChange={(e) => setTwoFactorToken(e.target.value)}
                                    className="block w-full text-center tracking-[0.5em] font-mono text-2xl py-4 border border-gray-800 rounded-2xl bg-background/50 text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/50 transition-all font-medium"
                                    placeholder="000000"
                                />
                                <button type="button" onClick={() => setRequires2FA(false)} className="w-full text-center text-xs text-gray-500 hover:text-white transition-colors">
                                    Voltar
                                </button>
                            </div>
                        )}

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

                    {!requires2FA && (
                        <div className="mt-10 text-center">
                            <p className="text-gray-500 text-xs font-medium">
                                {t('auth.login.no_account')}{' '}
                                <Link to="/register" className="text-primary hover:text-white font-black transition-colors ml-1 uppercase tracking-widest">
                                    {t('auth.login.register_now')}
                                </Link>
                            </p>
                        </div>
                    )}
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
