import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { 
    Settings as SettingsIcon, 
    Lock, 
    Wallet, 
    User, 
    ShieldCheck, 
    Save, 
    Loader2,
    CheckCircle2
} from 'lucide-react';
import { api, useAuthStore } from '../store/auth';
import { useGameStore } from '../store/game';

export default function Settings() {
    const { t } = useTranslation();
    const { user } = useAuthStore();
    const { stats, fetchAll } = useGameStore();
    
    const [isSavingWallet, setIsSavingWallet] = useState(false);
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    
    const [walletAddress, setWalletAddress] = useState('');
    const [passwords, setPasswords] = useState({
        current: '',
        new: '',
        confirm: ''
    });

    useEffect(() => {
        if (stats?.miner?.walletAddress) {
            setWalletAddress(stats.miner.walletAddress);
        }
    }, [stats]);

    const handleUpdateWallet = async (e) => {
        e.preventDefault();
        if (!walletAddress.trim()) return toast.error("Endereço de carteira inválido.");
        
        try {
            setIsSavingWallet(true);
            const res = await api.post('/wallet/address', { walletAddress });
            if (res.data.ok) {
                toast.success("Carteira atualizada com sucesso!");
                fetchAll(); // Refresh stats to get updated address
            }
        } catch (err) {
            toast.error(err.response?.data?.message || "Erro ao atualizar carteira.");
        } finally {
            setIsSavingWallet(false);
        }
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        if (passwords.new !== passwords.confirm) {
            return toast.error("As senhas não coincidem.");
        }
        if (passwords.new.length < 8) {
            return toast.error("A nova senha deve ter pelo menos 8 caracteres.");
        }

        try {
            setIsChangingPassword(true);
            const res = await api.post('/auth/change-password', {
                currentPassword: passwords.current,
                newPassword: passwords.new
            });
            if (res.data.ok) {
                toast.success("Senha alterada com sucesso!");
                setPasswords({ current: '', new: '', confirm: '' });
            }
        } catch (err) {
            toast.error(err.response?.data?.message || "Erro ao alterar senha.");
        } finally {
            setIsChangingPassword(false);
        }
    };

    return (
        <div className="space-y-8 pb-20 animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <div className="inline-flex p-3 bg-primary/10 rounded-2xl">
                        <SettingsIcon className="w-6 h-6 text-primary" />
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tight italic uppercase">Configurações</h1>
                    <p className="text-gray-500 font-medium uppercase text-[10px] tracking-[0.2em]">Gerencie sua conta e segurança</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Account Info & Wallet */}
                <div className="space-y-8">
                    <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-8 shadow-xl space-y-8">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-500/10 rounded-xl">
                                <User className="w-5 h-5 text-blue-400" />
                            </div>
                            <h2 className="text-lg font-bold text-white uppercase tracking-wider">Perfil do Usuário</h2>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="bg-gray-900/50 p-4 rounded-2xl border border-gray-800">
                                <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest block mb-1">Nome de Usuário</span>
                                <span className="text-sm font-bold text-white">{user?.username || user?.name}</span>
                            </div>
                            <div className="bg-gray-900/50 p-4 rounded-2xl border border-gray-800">
                                <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest block mb-1">E-mail</span>
                                <span className="text-sm font-bold text-white truncate">{user?.email}</span>
                            </div>
                        </div>

                        <form onSubmit={handleUpdateWallet} className="space-y-4">
                            <div className="flex items-center gap-4 mb-4 pt-4 border-t border-gray-800">
                                <div className="p-3 bg-purple-500/10 rounded-xl">
                                    <Wallet className="w-5 h-5 text-purple-400" />
                                </div>
                                <h2 className="text-lg font-bold text-white uppercase tracking-wider">Carteira de Pagamento</h2>
                            </div>
                            
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-2">Endereço Polygon (MATIC/USDC)</label>
                                <div className="relative flex items-center bg-gray-950 border border-gray-800 rounded-2xl p-1.5 focus-within:border-primary/50 transition-all shadow-inner">
                                    <input 
                                        type="text" 
                                        value={walletAddress}
                                        onChange={(e) => setWalletAddress(e.target.value)}
                                        placeholder="0x..."
                                        className="bg-transparent border-none text-sm font-bold text-gray-300 px-4 w-full focus:outline-none"
                                    />
                                    <button 
                                        type="submit"
                                        disabled={isSavingWallet}
                                        className="bg-primary hover:bg-primary-hover text-white px-6 py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 font-black text-[10px] uppercase tracking-widest"
                                    >
                                        {isSavingWallet ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                        Salvar
                                    </button>
                                </div>
                                <p className="text-[9px] text-gray-600 font-medium px-4">Utilizado para retiradas automáticas e depósitos.</p>
                            </div>
                        </form>
                    </div>

                    <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-[2rem] p-6 flex items-start gap-4">
                        <div className="p-3 bg-emerald-500/10 rounded-xl">
                            <ShieldCheck className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                            <h4 className="text-white font-bold text-sm uppercase tracking-wider">Conta Verificada</h4>
                            <p className="text-[11px] text-gray-500 leading-relaxed mt-1">Sua conta possui todos os protocolos de segurança ativos. Seus dados estão criptografados de ponta a ponta.</p>
                        </div>
                    </div>
                </div>

                {/* Password Change */}
                <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-8 shadow-xl">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="p-3 bg-amber-500/10 rounded-xl">
                            <Lock className="w-5 h-5 text-amber-400" />
                        </div>
                        <h2 className="text-lg font-bold text-white uppercase tracking-wider">Segurança e Senha</h2>
                    </div>

                    <form onSubmit={handleChangePassword} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-2">Senha Atual</label>
                            <input 
                                type="password" 
                                value={passwords.current}
                                onChange={(e) => setPasswords({...passwords, current: e.target.value})}
                                className="w-full bg-gray-950 border border-gray-800 rounded-2xl py-4 px-6 text-sm font-bold text-white focus:outline-none focus:border-primary/50 transition-all shadow-inner"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-2">Nova Senha</label>
                            <input 
                                type="password" 
                                value={passwords.new}
                                onChange={(e) => setPasswords({...passwords, new: e.target.value})}
                                className="w-full bg-gray-950 border border-gray-800 rounded-2xl py-4 px-6 text-sm font-bold text-white focus:outline-none focus:border-primary/50 transition-all shadow-inner"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-2">Confirmar Nova Senha</label>
                            <input 
                                type="password" 
                                value={passwords.confirm}
                                onChange={(e) => setPasswords({...passwords, confirm: e.target.value})}
                                className="w-full bg-gray-950 border border-gray-800 rounded-2xl py-4 px-6 text-sm font-bold text-white focus:outline-none focus:border-primary/50 transition-all shadow-inner"
                                required
                            />
                        </div>

                        <button 
                            type="submit"
                            disabled={isChangingPassword}
                            className="w-full py-5 bg-gray-800 hover:bg-primary hover:text-white text-gray-400 rounded-[2rem] transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3 font-black text-xs uppercase tracking-[0.2em] italic border border-gray-700 hover:border-primary/50"
                        >
                            {isChangingPassword ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                            Atualizar Credenciais
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
