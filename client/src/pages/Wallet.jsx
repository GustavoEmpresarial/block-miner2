import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
    Wallet as WalletIcon,
    ArrowUpCircle,
    ArrowDownCircle,
    Clock,
    ShieldCheck,
    Copy,
    ExternalLink,
    RefreshCw,
    AlertCircle,
    CheckCircle2,
    XCircle,
    Info
} from 'lucide-react';
import { api } from '../store/auth';

export default function Wallet() {
    const { t } = useTranslation();
    const [balance, setBalance] = useState({
        amount: 0,
        lifetimeMined: 0,
        totalWithdrawn: 0
    });
    const [walletAddress, setWalletAddress] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isWithdrawing, setIsWithdrawing] = useState(false);
    const [withdrawForm, setWithdrawForm] = useState({
        address: '',
        amount: ''
    });

    const fetchWalletData = useCallback(async () => {
        try {
            const [balanceRes, historyRes] = await Promise.all([
                api.get('/wallet/balance'),
                api.get('/wallet/transactions')
            ]);

            if (balanceRes.data.ok) {
                setBalance({
                    amount: Number(balanceRes.data.balance || 0),
                    lifetimeMined: Number(balanceRes.data.lifetimeMined || 0),
                    totalWithdrawn: Number(balanceRes.data.totalWithdrawn || 0)
                });
                setWalletAddress(balanceRes.data.walletAddress || null);
            }

            if (historyRes.data.ok) {
                setTransactions(historyRes.data.transactions || []);
            }
        } catch (err) {
            console.error("Erro ao carregar dados da carteira", err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchWalletData();
        const interval = setInterval(fetchWalletData, 30000);
        return () => clearInterval(interval);
    }, [fetchWalletData]);

    const handleConnectWallet = async () => {
        if (typeof window.ethereum === 'undefined') {
            toast.error('Please install MetaMask or Trust Wallet.');
            return;
        }

        try {
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            const address = accounts[0];
            if (address) {
                const res = await api.post('/wallet/address', { walletAddress: address });
                if (res.data.ok) {
                    setWalletAddress(address);
                }
            }
        } catch (err) {
            console.error("Erro ao conectar carteira", err);
        }
    };

    const handleWithdraw = async (e) => {
        e.preventDefault();
        const amount = parseFloat(withdrawForm.amount);

        if (!withdrawForm.address) {
            toast.error(t('wallet.dest_address'));
            return;
        }
        if (isNaN(amount) || amount < 10) {
            toast.error(t('wallet.amount_label'));
            return;
        }
        if (amount > balance.amount) {
            toast.error('Insufficient balance.');
            return;
        }

        try {
            setIsWithdrawing(true);
            const res = await api.post('/wallet/withdraw', {
                amount,
                address: withdrawForm.address
            });

            if (res.data.ok) {
                toast.success(res.data.message || t('common.success'));
                setWithdrawForm({ address: '', amount: '' });
                fetchWalletData();
            } else {
                toast.error(res.data.message || t('common.error'));
            }
        } catch (err) {
            toast.error(err.response?.data?.message || t('common.error'));
        } finally {
            setIsWithdrawing(false);
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        toast.success(t('common.copied'));
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-700 pb-20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight">{t('wallet.title')}</h1>
                    <p className="text-gray-500 font-medium">{t('wallet.subtitle')}</p>
                </div>
                <button
                    onClick={fetchWalletData}
                    className="p-3 bg-gray-800/50 hover:bg-gray-800 text-gray-400 hover:text-white rounded-xl transition-all border border-gray-700/50"
                >
                    <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <div className="bg-gradient-to-br from-primary to-blue-700 rounded-[2.5rem] p-10 text-white shadow-2xl shadow-primary/20 relative overflow-hidden group">
                        <div className="relative z-10 space-y-8">
                            <div>
                                <p className="text-blue-100/60 font-bold uppercase tracking-[0.2em] text-[10px] mb-2">{t('wallet.available_balance')}</p>
                                <div className="flex items-baseline gap-3">
                                    <h2 className="text-5xl font-black tracking-tighter">{balance.amount.toFixed(6)}</h2>
                                    <span className="text-xl font-bold text-blue-100/80 uppercase">POL</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-8 pt-8 border-t border-white/10">
                                <div>
                                    <p className="text-blue-100/60 font-bold uppercase tracking-widest text-[9px] mb-1">{t('wallet.lifetime_mined')}</p>
                                    <p className="text-xl font-bold tracking-tight">{balance.lifetimeMined.toFixed(4)} <span className="text-xs font-medium text-blue-100/50 uppercase">POL</span></p>
                                </div>
                                <div>
                                    <p className="text-blue-100/60 font-bold uppercase tracking-widest text-[9px] mb-1">{t('wallet.total_withdrawn')}</p>
                                    <p className="text-xl font-bold tracking-tight">{balance.totalWithdrawn.toFixed(4)} <span className="text-xs font-medium text-blue-100/50 uppercase">POL</span></p>
                                </div>
                            </div>
                        </div>
                        <WalletIcon className="absolute right-[-40px] top-[-40px] w-80 h-80 text-white/10 -rotate-12 group-hover:scale-110 transition-transform duration-1000" />
                    </div>

                    <div className="bg-surface border border-gray-800/50 rounded-[2rem] p-8 shadow-xl">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-3 bg-primary/10 rounded-2xl">
                                <ArrowUpCircle className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white">{t('wallet.withdraw_title')}</h3>
                                <p className="text-xs font-medium text-gray-500">{t('wallet.withdraw_subtitle')}</p>
                            </div>
                        </div>

                        <form onSubmit={handleWithdraw} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1" htmlFor="address">
                                    {t('wallet.dest_address')}
                                </label>
                                <div className="relative group">
                                    <input
                                        id="address"
                                        type="text"
                                        value={withdrawForm.address}
                                        onChange={(e) => setWithdrawForm(prev => ({ ...prev, address: e.target.value }))}
                                        placeholder="0x..."
                                        className="w-full bg-gray-900/50 border border-gray-800 group-hover:border-gray-700 focus:border-primary/50 rounded-2xl py-4 pl-4 pr-12 text-gray-200 text-sm font-medium transition-all focus:outline-none focus:ring-4 focus:ring-primary/5"
                                    />
                                    {walletAddress && (
                                        <button
                                            type="button"
                                            onClick={() => setWithdrawForm(prev => ({ ...prev, address: walletAddress }))}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-primary hover:text-white transition-colors"
                                        >
                                            {t('wallet.use_saved')}
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1" htmlFor="amount">
                                    {t('wallet.amount_label')}
                                </label>
                                <div className="relative group">
                                    <input
                                        id="amount"
                                        type="number"
                                        step="0.000001"
                                        value={withdrawForm.amount}
                                        onChange={(e) => setWithdrawForm(prev => ({ ...prev, amount: e.target.value }))}
                                        placeholder="0.00"
                                        className="w-full bg-gray-900/50 border border-gray-800 group-hover:border-gray-700 focus:border-primary/50 rounded-2xl py-4 px-4 text-gray-200 text-sm font-medium transition-all focus:outline-none focus:ring-4 focus:ring-primary/5"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setWithdrawForm(prev => ({ ...prev, amount: balance.amount.toString() }))}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-primary hover:text-white transition-colors"
                                    >
                                        {t('wallet.max')}
                                    </button>
                                </div>
                            </div>

                            <div className="bg-gray-800/30 rounded-2xl p-4 border border-gray-800/50 space-y-3">
                                <div className="flex justify-between text-xs font-medium">
                                    <span className="text-gray-500">{t('wallet.network_fee')}:</span>
                                    <span className="text-emerald-400 font-bold">{t('wallet.paid_by_pool')}</span>
                                </div>
                                <div className="flex justify-between text-sm font-bold">
                                    <span className="text-gray-400">{t('wallet.receive_amount')}:</span>
                                    <span className="text-white">{(parseFloat(withdrawForm.amount) || 0).toFixed(6)} POL</span>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isWithdrawing}
                                className="w-full py-5 bg-primary hover:bg-primary-hover text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-primary/20 active:scale-[0.98] disabled:opacity-50"
                            >
                                {isWithdrawing ? t('wallet.processing') : t('wallet.confirm_withdraw')}
                            </button>

                            <p className="text-[10px] text-center text-gray-500 font-medium">
                                <Clock className="w-3 h-3 inline mr-1 mb-0.5" /> {t('wallet.processing_time')}
                            </p>
                        </form>
                    </div>
                </div>

                <div className="space-y-8">
                    <div className="bg-surface border border-gray-800/50 rounded-[2rem] p-6 shadow-xl">
                        <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-widest text-gray-400">{t('wallet.web3_title')}</h3>

                        {walletAddress ? (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
                                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-bold text-emerald-500 uppercase">{t('wallet.linked_wallet')}</p>
                                        <p className="text-xs font-mono text-gray-300 truncate">{walletAddress}</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => copyToClipboard(walletAddress)}
                                        className="flex items-center justify-center gap-2 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-bold transition-all"
                                    >
                                        <Copy className="w-3.5 h-3.5" /> {t('common.copy')}
                                    </button>
                                    <button
                                        onClick={handleConnectWallet}
                                        className="flex items-center justify-center gap-2 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-bold transition-all"
                                    >
                                        <RefreshCw className="w-3.5 h-3.5" /> {t('inventory.modal.settings')}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 p-4 bg-red-500/5 border border-red-500/10 rounded-2xl">
                                    <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                                    <div>
                                        <p className="text-[10px] font-bold text-red-500 uppercase">{t('wallet.not_connected')}</p>
                                        <p className="text-xs text-gray-500">{t('wallet.link_to_withdraw')}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleConnectWallet}
                                    className="w-full py-4 bg-white text-gray-900 rounded-xl font-bold text-sm transition-all hover:bg-gray-200"
                                >
                                    {t('wallet.connect_wallet')}
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="bg-surface border border-gray-800/50 rounded-[2rem] p-6 shadow-xl flex flex-col max-h-[500px]">
                        <div className="flex items-center justify-between mb-6 shrink-0">
                            <h2 className="text-sm font-bold text-white uppercase tracking-widest text-gray-400">{t('wallet.recent_activity')}</h2>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-hide">
                            {transactions.length === 0 ? (
                                <div className="py-12 flex flex-col items-center justify-center text-center opacity-40">
                                    <Clock className="w-10 h-10 mb-3" />
                                    <p className="text-xs font-medium">{t('wallet.no_transactions')}</p>
                                </div>
                            ) : (
                                transactions.map((tx, i) => {
                                    const isWithdrawal = tx.type === 'withdrawal';
                                    return (
                                        <div key={i} className="flex items-center gap-4 group">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isWithdrawal ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'
                                                }`}>
                                                {isWithdrawal ? <ArrowUpCircle className="w-5 h-5" /> : <ArrowDownCircle className="w-5 h-5" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-start mb-0.5">
                                                    <span className="text-sm font-bold text-white truncate">
                                                        {isWithdrawal ? t('wallet.withdrawal') : t('wallet.deposit')}
                                                    </span>
                                                    <span className={`text-sm font-black ${isWithdrawal ? 'text-red-400' : 'text-emerald-400'
                                                        }`}>
                                                        {isWithdrawal ? '-' : '+'}{Number(tx.amount || 0).toFixed(4)}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center text-[10px] font-bold text-gray-500 uppercase tracking-tighter">
                                                    <span>{new Date(tx.created_at || tx.createdAt || Date.now()).toLocaleDateString()}</span>
                                                    <span className={`px-1.5 py-0.5 rounded bg-gray-800/50 ${tx.status === 'confirmed' || tx.status === 'completed' ? 'text-emerald-500' : 'text-amber-500'
                                                        }`}>
                                                        {t(`wallet.status.${tx.status}`)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        <div className="mt-6 pt-6 border-t border-gray-800/50 shrink-0">
                            <div className="bg-blue-500/5 rounded-2xl p-4 border border-blue-500/10 flex gap-3">
                                <Info className="w-5 h-5 text-blue-400 shrink-0" />
                                <p className="text-[10px] text-gray-500 leading-relaxed font-medium">
                                    {t('wallet.tip_deposit')}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
