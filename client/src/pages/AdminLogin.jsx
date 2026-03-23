import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ShieldAlert, Lock, Mail, Loader2, ChevronRight, AlertCircle } from 'lucide-react';
import { api } from '../store/auth';

export default function AdminLogin() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        try {
            const res = await api.post('/admin/auth/login', {
                email,
                securityCode: password
            });
            if (res.data.ok) {
                // O token de admin geralmente é salvo em um cookie seguro pelo backend,
                // mas se o sistema usar localStorage para o token de admin, salvamos aqui.
                if (res.data.token) {
                    localStorage.setItem('adminToken', res.data.token);
                }
                navigate('/admin/dashboard');
            } else {
                setError(res.data.message || 'Falha na autenticação administrativa.');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Erro ao conectar com o servidor.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 relative overflow-hidden">
            {/* Dark administrative theme background */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-amber-500/5 rounded-full blur-[120px]"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-orange-600/5 rounded-full blur-[120px]"></div>

            <div className="w-full max-w-[400px] relative z-10">
                <div className="text-center mb-10">
                    <div className="inline-flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 bg-gradient-to-tr from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center shadow-xl shadow-amber-500/20">
                            <ShieldAlert className="text-white w-7 h-7" />
                        </div>
                        <span className="font-black text-2xl tracking-tighter text-white uppercase">Admin<span className="text-amber-500">Panel</span></span>
                    </div>
                    <h1 className="text-xl font-bold text-white tracking-tight">Acesso Restrito</h1>
                    <p className="text-slate-500 text-sm font-medium mt-1">Identifique-se para gerenciar o ecossistema.</p>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8 shadow-2xl">
                    {error && (
                        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                            <p className="text-red-400 text-xs font-bold leading-relaxed">{error}</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">E-mail Administrativo</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Mail className="h-5 w-5 text-slate-600 group-focus-within:text-amber-500 transition-colors" />
                                </div>
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="block w-full pl-12 pr-4 py-4 border border-slate-800 rounded-2xl bg-slate-950 text-slate-200 placeholder-slate-700 focus:outline-none focus:ring-4 focus:ring-amber-500/5 focus:border-amber-500/50 transition-all font-medium text-sm"
                                    placeholder="admin@blockminer.com"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Senha de Segurança</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-slate-600 group-focus-within:text-amber-500 transition-colors" />
                                </div>
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="block w-full pl-12 pr-4 py-4 border border-slate-800 rounded-2xl bg-slate-950 text-slate-200 placeholder-slate-700 focus:outline-none focus:ring-4 focus:ring-amber-500/5 focus:border-amber-500/50 transition-all font-medium text-sm"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full flex justify-center items-center gap-2 py-4 px-6 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-amber-500/20 active:scale-[0.98] disabled:opacity-50"
                        >
                            {isLoading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <>
                                    Autenticar Admin
                                    <ChevronRight className="w-5 h-5" />
                                </>
                            )}
                        </button>
                    </form>
                </div>

                <div className="mt-8 text-center">
                    <Link to="/login" className="text-slate-600 hover:text-slate-400 text-xs font-bold uppercase tracking-[0.2em] transition-colors">
                        Voltar para Área do Usuário
                    </Link>
                </div>
            </div>
        </div>
    );
}
