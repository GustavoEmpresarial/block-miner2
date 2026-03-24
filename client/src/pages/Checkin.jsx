import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Calendar, CheckCircle2, Star, Trophy, Wallet } from 'lucide-react';
import { BrowserProvider, formatEther, isAddress } from 'ethers';
import { api } from '../store/auth';
import { useWallet } from '../hooks/useWallet';

export default function Checkin() {
    const { t } = useTranslation();
    const { account, isConnected, isConnecting, isCorrectNetwork, connect, switchNetwork } = useWallet();
    const [status, setStatus] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isClaiming, setIsClaiming] = useState(false);
    /** Evita duplo clique / envios paralelos antes do React atualizar `isClaiming`. */
    const payInFlightRef = useRef(false);

    const fetchStatus = useCallback(async () => {
        try {
            setIsLoading(true);
            const res = await api.get('/checkin/status');
            if (res.data.ok) {
                setStatus(res.data);
            }
        } catch (err) {
            console.error("Erro ao buscar status do check-in", err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    const handlePayCheckin = async () => {
        if (status?.checkedIn || status?.alreadyClaimed || isClaiming || payInFlightRef.current) return;
        if (!status?.checkinConfigured || !status.checkinReceiver || !status.checkinAmountWei) {
            toast.error(t('checkin.not_configured'));
            return;
        }

        payInFlightRef.current = true;
        try {
            setIsClaiming(true);

            if (!isConnected) {
                await connect();
                toast.info(t('checkin.connect_then_retry'));
                return;
            }

            if (!isCorrectNetwork) {
                await switchNetwork();
                toast.info(t('checkin.network_then_retry'));
                return;
            }

            const receiver = status.checkinReceiver;
            if (!isAddress(receiver)) {
                toast.error(t('checkin.not_configured'));
                return;
            }

            let valueWei;
            try {
                valueWei = BigInt(status.checkinAmountWei);
            } catch {
                toast.error(t('common.error'));
                return;
            }

            const provider = new BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();

            toast.info(t('checkin.sending_tx'));
            const tx = await signer.sendTransaction({
                to: receiver,
                value: valueWei,
                gasLimit: 21000
            });

            toast.info(t('checkin.confirming_tx'));
            const receipt = await tx.wait();
            if (!receipt || receipt.status !== 1) {
                toast.error(t('checkin.tx_failed'));
                return;
            }

            const res = await api.post('/checkin/confirm', { txHash: tx.hash });
            if (res.data.ok) {
                toast.success(t('checkin.success_msg'));
                fetchStatus();
            }
        } catch (err) {
            if (err?.code === 4001) {
                toast.error(t('checkin.rejected'));
            } else if (err?.code === 'INSUFFICIENT_FUNDS' || (err?.message && err.message.includes('insufficient funds'))) {
                toast.error(t('checkin.insufficient_funds'));
            } else {
                toast.error(err.response?.data?.message || err?.message || t('common.error'));
            }
        } finally {
            payInFlightRef.current = false;
            setIsClaiming(false);
        }
    };

    if (isLoading) return <div className="p-8 text-gray-400">{t('common.loading')}</div>;

    const streak = status?.streak || 0;
    const feeLabel =
        status?.checkinAmountWei
            ? (() => {
                  try {
                      return formatEther(BigInt(status.checkinAmountWei));
                  } catch {
                      return '—';
                  }
              })()
            : '—';

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="text-center space-y-4">
                <div className="inline-flex p-3 bg-amber-500/10 rounded-2xl mb-2">
                    <Calendar className="w-8 h-8 text-amber-500" />
                </div>
                <h1 className="text-4xl font-black text-white tracking-tight">{t('checkin.title')}</h1>
                <p className="text-gray-500 font-medium max-w-lg mx-auto">
                    {t('checkin.subtitle')}
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-10 shadow-xl relative overflow-hidden group">
                    <div className="relative z-10">
                        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-[0.2em] mb-8">{t('checkin.streak')}</h3>

                        <div className="flex items-center gap-6">
                            <div className="w-24 h-24 bg-gradient-to-tr from-amber-500 to-orange-600 rounded-3xl flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:scale-110 transition-transform duration-500">
                                <Trophy className="text-white w-12 h-12" />
                            </div>
                            <div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-6xl font-black text-white tracking-tighter">{streak}</span>
                                    <span className="text-xl font-bold text-amber-500 uppercase">{t('checkin.days')}</span>
                                </div>
                                <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest">
                                    {t('checkin.streak_hint')}
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="absolute bottom-0 right-0 w-48 h-48 bg-amber-500/5 rounded-tl-[100px] -z-0"></div>
                </div>

                <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-10 shadow-xl flex flex-col justify-center">
                    {status?.checkedIn ? (
                        <div className="text-center space-y-6">
                            <div className="flex justify-center">
                                <div className="w-20 h-20 rounded-full bg-emerald-500/10 border-4 border-emerald-500/20 flex items-center justify-center">
                                    <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                                </div>
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-white">{t('checkin.claimed')}</h3>
                                <p className="text-sm text-gray-500 font-medium mt-2">{t('checkin.claimed_hint')}</p>
                            </div>
                        </div>
                    ) : !status?.checkinConfigured ? (
                        <div className="text-center space-y-4">
                            <p className="text-sm text-amber-500 font-bold uppercase tracking-widest">{t('checkin.not_configured')}</p>
                            <p className="text-sm text-gray-500">{t('checkin.not_configured_hint')}</p>
                        </div>
                    ) : (
                        <div className="space-y-8">
                            <div className="text-center space-y-2">
                                <p className="text-sm font-bold text-amber-500 uppercase tracking-[0.2em]">{t('checkin.fee_label')}</p>
                                <h3 className="text-3xl font-black text-white italic">
                                    {feeLabel} <span className="text-lg not-italic text-gray-400">POL</span>
                                </h3>
                                <p className="text-xs text-gray-500">
                                    {isConnected && account
                                        ? t('checkin.wallet_linked', { address: `${account.slice(0, 6)}…${account.slice(-4)}` })
                                        : t('checkin.wallet_connect_hint')}
                                </p>
                            </div>

                            <button
                                onClick={handlePayCheckin}
                                disabled={isClaiming || isConnecting}
                                className="w-full py-6 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-[2rem] font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-amber-500/20 active:scale-[0.98] flex items-center justify-center gap-3"
                            >
                                {isClaiming || isConnecting ? (
                                    t('common.loading')
                                ) : (
                                    <>
                                        <Wallet className="w-5 h-5" />
                                        {t('checkin.pay_button')}
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[7, 15, 30].map((milestone) => (
                    <div
                        key={milestone}
                        className={`bg-gray-800/30 border rounded-2xl p-6 flex items-center gap-4 ${
                            streak >= milestone ? 'border-amber-500/30 opacity-100' : 'border-gray-800 opacity-50'
                        }`}
                    >
                        <div
                            className={`p-3 rounded-xl ${
                                streak >= milestone ? 'bg-amber-500/10 text-amber-500' : 'bg-gray-900 text-gray-600'
                            }`}
                        >
                            <Star className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                {milestone} {t('checkin.days').toUpperCase()}
                            </p>
                            <p className="text-sm font-bold text-white">{t('checkin.milestone_bonus')}</p>
                        </div>
                        {streak >= milestone && <CheckCircle2 className="ml-auto w-5 h-5 text-emerald-500" />}
                    </div>
                ))}
            </div>
        </div>
    );
}
