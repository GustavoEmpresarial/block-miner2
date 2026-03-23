import React, { useState, useEffect, useCallback } from 'react';
import { ShieldAlert, X, ExternalLink } from 'lucide-react';
import { api } from '../store/auth';

const STORAGE_KEY = 'bm_adblock_snooze_until';
/** Não reexibir o aviso após fechar / “continuar” (evita spam em mobile com falsos positivos). */
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

function readSnoozeUntil() {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        if (!v) return 0;
        const t = parseInt(v, 10);
        return Number.isFinite(t) ? t : 0;
    } catch {
        return 0;
    }
}

function writeSnooze() {
    try {
        localStorage.setItem(STORAGE_KEY, String(Date.now() + SNOOZE_MS));
    } catch {
        /* ignore */
    }
}

const AdBlockDetector = () => {
    const [isDetected, setIsDetected] = useState(false);
    const [isDismissed, setIsDismissed] = useState(() => Date.now() < readSnoozeUntil());

    const dismiss = useCallback(() => {
        writeSnooze();
        setIsDismissed(true);
    }, []);

    useEffect(() => {
        if (Date.now() < readSnoozeUntil()) return;

        const detectAdBlock = async () => {
            const isCoarseOrMobile =
                (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
                (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);

            // Em celular, fetch no-cors para URLs de ads costuma dar falso positivo (modo economia, anti-tracking do próprio browser).
            let fetchBlocked = false;
            if (!isCoarseOrMobile) {
                const adUrls = [
                    'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
                    'https://www.google-analytics.com/analytics.js'
                ];
                try {
                    await fetch(adUrls[0], { mode: 'no-cors' }).catch(() => {
                        fetchBlocked = true;
                    });
                } catch {
                    fetchBlocked = true;
                }
            }

            const honeypot = document.createElement('div');
            honeypot.className = 'ad-banner adsbox ads-google ad-placement public_ads';
            honeypot.style.position = 'absolute';
            honeypot.style.left = '-9999px';
            honeypot.style.top = '-9999px';
            honeypot.innerHTML = '&nbsp;';
            document.body.appendChild(honeypot);

            const honeypotDelay = isCoarseOrMobile ? 450 : 120;

            window.setTimeout(() => {
                let honeypotBlocked = false;
                const cs = window.getComputedStyle(honeypot);
                if (
                    honeypot.offsetHeight === 0 ||
                    honeypot.clientHeight === 0 ||
                    cs.display === 'none' ||
                    cs.visibility === 'hidden' ||
                    parseFloat(cs.opacity || '1') === 0
                ) {
                    honeypotBlocked = true;
                }

                const blocked = isCoarseOrMobile ? honeypotBlocked : fetchBlocked || honeypotBlocked;

                if (blocked) {
                    setIsDetected(true);
                    api.post('/auth/mark-adblock').catch(() => {});
                }

                document.body.removeChild(honeypot);
            }, honeypotDelay);
        };

        const timer = setTimeout(detectAdBlock, 2000);
        return () => clearTimeout(timer);
    }, []);

    if (!isDetected || isDismissed) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xl animate-in fade-in duration-500">
            <div className="relative w-full max-w-lg bg-slate-900/50 border border-white/10 rounded-[2.5rem] p-10 shadow-2xl overflow-hidden group">
                {/* Decorative Background */}
                <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary/20 blur-[100px] rounded-full" />
                <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-orange-600/10 blur-[100px] rounded-full" />
                
                <div className="relative z-10 flex flex-col items-center text-center">
                    <div className="w-24 h-24 bg-red-500/10 border border-red-500/20 rounded-3xl flex items-center justify-center mb-8 shadow-inner animate-pulse">
                        <ShieldAlert className="w-12 h-12 text-red-500" />
                    </div>

                    <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase mb-4 leading-tight">
                        Protocolo de <br />
                        <span className="text-primary">Sustento Ativado</span>
                    </h2>

                    <p className="text-slate-400 text-lg leading-relaxed mb-10 max-w-sm">
                        Detectamos que você está usando um <span className="text-white font-bold">Bloqueador de Anúncios</span>. 
                        Nossa infraestrutura de mineração depende da publicidade para continuar operando de forma gratuita.
                    </p>

                    <div className="grid grid-cols-1 gap-4 w-full">
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="flex items-center justify-center gap-3 w-full py-5 bg-primary text-white font-black rounded-2xl hover:scale-[1.02] active:scale-95 transition-all uppercase italic tracking-widest shadow-glow touch-manipulation"
                        >
                            Já desativei, recarregar <ExternalLink className="w-5 h-5" />
                        </button>

                        <button
                            type="button"
                            onClick={dismiss}
                            className="w-full py-4 text-slate-500 font-bold hover:text-slate-300 transition-colors uppercase text-xs tracking-[0.3em] touch-manipulation"
                        >
                            Continuar mesmo assim
                        </button>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={dismiss}
                    className="absolute top-6 right-6 p-2 text-slate-500 hover:text-white transition-colors touch-manipulation"
                    aria-label="Fechar"
                >
                    <X className="w-6 h-6" />
                </button>
            </div>
        </div>
    );
};

export default AdBlockDetector;
