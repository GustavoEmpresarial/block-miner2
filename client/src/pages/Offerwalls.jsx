import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { MousePointer2, ExternalLink, Zap, Coins, TrendingUp, AlertCircle, RefreshCw } from 'lucide-react';
import { api } from '../store/auth';

const OFFERWALLS = [
  {
    key: "zerads-ptc",
    name: "ZerAds PTC",
    type: "PTC",
    logoPath: "/assets/logos/offerwall/zerads.png"
  },
  {
    key: "zerads-offerwall",
    name: "ZerAds Offerwall",
    type: "Offerwall",
    logoPath: "/assets/logos/offerwall/zerads.png"
  }
];

export default function Offerwalls() {
    const { t } = useTranslation();
    const [links, setLinks] = useState({});
    const [stats, setStats] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchData = useCallback(async () => {
        try {
            setIsLoading(true);
            const [ptcRes, owRes, statsRes] = await Promise.all([
                api.get('/zerads/ptc-link'),
                api.get('/zerads/offerwall-link'),
                api.get('/zerads/stats')
            ]);

            setLinks({
                'zerads-ptc': ptcRes.data.ok ? ptcRes.data.ptcUrl : '',
                'zerads-offerwall': owRes.data.ok ? owRes.data.offerwallUrl : ''
            });

            if (statsRes.data.ok) setStats(statsRes.data);
        } catch (err) {
            setError('Erro ao carregar ofertas.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <div className="inline-flex p-3 bg-blue-500/10 rounded-2xl">
                        <MousePointer2 className="w-6 h-6 text-blue-400" />
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tight">{t('ptc.title')}</h1>
                    <p className="text-gray-500 font-medium">{t('ptc.subtitle')}</p>
                </div>
                <button 
                    onClick={fetchData}
                    className="p-3 bg-gray-800/50 hover:bg-gray-800 text-gray-400 hover:text-white rounded-xl transition-all border border-gray-700/50"
                >
                    <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {OFFERWALLS.map((item) => {
                    const url = links[item.key];
                    const isActive = !!url;
                    
                    return (
                        <div key={item.key} className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-8 shadow-xl flex flex-col group hover:border-primary/30 transition-all duration-500">
                            <div className="w-20 h-20 bg-gray-900 rounded-3xl p-4 border border-gray-800 mb-6 flex items-center justify-center">
                                <img src={item.logoPath} alt={item.name} className="w-full h-full object-contain" />
                            </div>
                            
                            <h3 className="text-xl font-bold text-white mb-1">{item.name}</h3>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">{item.type} Network</p>
                            
                            <div className="mt-auto">
                                <a 
                                    href={isActive ? url : '#'} 
                                    target={isActive ? "_blank" : "_self"}
                                    rel="noopener noreferrer"
                                    className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
                                        isActive 
                                            ? 'bg-primary text-white hover:bg-primary-hover shadow-lg shadow-primary/20' 
                                            : 'bg-gray-800 text-slate-600 cursor-not-allowed'
                                    }`}
                                >
                                    {isActive ? (
                                        <>
                                            {item.type === 'Offerwall' ? 'Abrir Mural' : 'Iniciar PTC'}
                                            <ExternalLink className="w-4 h-4" />
                                        </>
                                    ) : 'Indisponível'}
                                </a>
                            </div>
                        </div>
                    );
                })}

                {/* Stats Summary */}
                <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-[2.5rem] p-8 text-white shadow-2xl shadow-blue-500/20 relative overflow-hidden group flex flex-col justify-center">
                    <div className="relative z-10 space-y-6">
                        <div>
                            <p className="text-blue-100/60 font-bold uppercase tracking-widest text-[10px] mb-1">Total Recebido</p>
                            <h3 className="text-3xl font-black tracking-tight">{Number(stats?.totalRewards || 0).toFixed(6)} <span className="text-sm">POL</span></h3>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-blue-100/60 font-bold uppercase tracking-widest text-[8px] mb-1">Cliques</p>
                                <p className="text-xl font-bold">{stats?.totalClicks || 0}</p>
                            </div>
                            <div>
                                <p className="text-blue-100/60 font-bold uppercase tracking-widest text-[8px] mb-1">Aprovados</p>
                                <p className="text-xl font-bold">{stats?.callbackCount || 0}</p>
                            </div>
                        </div>
                    </div>
                    <Coins className="absolute right-[-20px] bottom-[-20px] w-48 h-48 text-white/10 -rotate-12 group-hover:scale-110 transition-transform duration-1000" />
                </div>
            </div>

            <div className="bg-gray-800/30 border border-gray-800 rounded-3xl p-8 flex items-start gap-6">
                <div className="p-4 bg-amber-500/10 rounded-2xl shrink-0">
                    <AlertCircle className="w-8 h-8 text-amber-500" />
                </div>
                <div className="space-y-2">
                    <h4 className="text-white font-black text-lg">Como funcionam as Ofertas?</h4>
                    <p className="text-sm text-gray-500 leading-relaxed font-medium">
                        Ao completar tarefas ou clicar em anúncios nos nossos parceiros, você ganha POL diretamente na sua carteira do BlockMiner. Os créditos são processados automaticamente após a confirmação da rede parceira, o que pode levar de alguns minutos até algumas horas dependendo da tarefa.
                    </p>
                </div>
            </div>
        </div>
    );
}
