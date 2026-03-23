import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Cpu, Zap, ArrowLeft, Shield, Trophy, Gamepad2 } from 'lucide-react';
import { api } from '../store/auth';
import {
    getGlobalSlotIndex,
    getMachineBySlot,
    getMachineDescriptor,
    formatHashrate,
    RACKS_COUNT,
    SLOTS_PER_RACK,
    DEFAULT_MINER_IMAGE_URL
} from '../utils/machine';

export default function PublicRoom() {
    const { t } = useTranslation();
    const { username } = useParams();
    const navigate = useNavigate();
    const [targetUser, setTargetUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchRoomData = async () => {
            try {
                setIsLoading(true);
                const res = await api.get(`/ranking/room/${username}`);
                if (res.data.ok) {
                    setTargetUser(res.data.user);
                } else {
                    navigate('/ranking');
                }
            } catch (err) {
                console.error("Error fetching room data", err);
                navigate('/ranking');
            } finally {
                setIsLoading(false);
            }
        };
        fetchRoomData();
    }, [username, navigate]);

    const machines = targetUser?.miners || [];
    const racks = targetUser?.racks || {};

    const activeMachinesHashRate = useMemo(() => {
        return machines.reduce((sum, machine) => sum + Number(machine.hashRate || machine.hash_rate || 0), 0);
    }, [machines]);

    const gamePower = targetUser?.gamePower || 0;
    const totalHashRate = activeMachinesHashRate + gamePower;

    if (isLoading) {
        return (
            <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Sincronizando Hardware...</p>
            </div>
        );
    }

    if (!targetUser) {
        return (
            <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
                <p className="text-red-500 font-bold">Erro ao carregar os dados da sala.</p>
                <button onClick={() => navigate('/ranking')} className="px-6 py-2 bg-primary text-white rounded-xl">Voltar ao Ranking</button>
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-20 animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-slate-900/50 p-8 rounded-[2.5rem] border border-slate-800 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-[100px] -mr-32 -mt-32" />
                
                <div className="flex items-center gap-6 relative z-10">
                    <div className="w-20 h-20 rounded-3xl bg-gray-800 flex items-center justify-center text-3xl font-black text-white border-2 border-gray-700 shadow-2xl">
                        {targetUser.username.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-black text-white tracking-tight italic uppercase">
                                Sala de <span className="text-primary">{targetUser.username}</span>
                            </h1>
                            <div className="px-3 py-1 bg-primary/10 rounded-lg border border-primary/20 flex items-center gap-1.5">
                                <Shield className="w-3 h-3 text-primary" />
                                <span className="text-[10px] font-black text-primary uppercase">Modo Visitação</span>
                            </div>
                        </div>
                        <p className="text-gray-500 font-medium mt-1 uppercase text-xs tracking-widest flex items-center gap-2">
                            <Trophy className="w-3 h-3" /> Visualizando configuração de rede global
                        </p>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row items-center gap-4 relative z-10">
                    <button 
                        onClick={() => navigate('/ranking')}
                        className="flex items-center gap-3 px-6 py-4 bg-gray-800 hover:bg-gray-700 text-white rounded-2xl transition-all border border-gray-700 shadow-xl group font-bold text-sm uppercase tracking-widest order-2 md:order-1 w-full md:w-auto justify-center"
                    >
                        <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                        Voltar
                    </button>

                    <div className="flex items-center gap-3 order-1 md:order-2">
                        <div className="px-6 py-4 bg-gray-950 rounded-2xl border border-gray-800 flex flex-col items-center min-w-[140px]">
                            <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1 text-center">HashRate Total</span>
                            <div className="flex items-center gap-2 text-white font-black text-xl italic">
                                <Zap className="w-5 h-5 text-primary" />
                                {formatHashrate(totalHashRate)}
                            </div>
                        </div>
                        
                        <div className="px-6 py-4 bg-gray-950 rounded-2xl border border-gray-800 flex flex-col items-center min-w-[140px]">
                            <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1 text-center">Poder de Jogos</span>
                            <div className="flex items-center gap-2 text-primary font-black text-xl italic">
                                <Gamepad2 className="w-5 h-5" />
                                {formatHashrate(gamePower)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {Array.from({ length: RACKS_COUNT }).map((_, i) => {
                    const rackIndex = i + 1;
                    const rackName = racks[rackIndex] || `Rack ${rackIndex}`;

                    return (
                        <div key={rackIndex} className="bg-surface border border-gray-800/50 rounded-[2.5rem] overflow-hidden shadow-2xl relative group">
                            <div className="px-8 py-6 bg-gray-800/20 border-b border-gray-800/50 flex justify-between items-center relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                                <div className="flex items-center gap-4">
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-glow" />
                                    <h3 className="text-base font-black text-white italic uppercase tracking-tighter">{rackName}</h3>
                                </div>
                                <div className="text-[10px] font-black text-gray-600 uppercase tracking-widest bg-gray-900/50 px-3 py-1 rounded-lg border border-gray-800">
                                    Status: Online
                                </div>
                            </div>

                            <div className="p-4 sm:p-8 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                                {Array.from({ length: SLOTS_PER_RACK }).map((_, localI) => {
                                    const globalI = getGlobalSlotIndex(rackIndex, localI);
                                    const machine = getMachineBySlot(globalI, machines);

                                    if (machine && machine.isSecondSlot) return null;

                                    const descriptor = machine ? getMachineDescriptor(machine) : null;
                                    const isOccupied = !!machine;
                                    const isDouble = descriptor?.size === 2;

                                    return (
                                        <div
                                            key={localI}
                                            className={`
                                                relative aspect-square rounded-2xl border transition-all duration-500 flex items-center justify-center overflow-hidden
                                                ${isDouble ? 'col-span-2 aspect-auto' : ''}
                                                ${isOccupied
                                                    ? 'bg-gray-800/40 border-gray-700/50 shadow-inner'
                                                    : 'bg-gray-950/40 border-dashed border-gray-900 opacity-20'}
                                            `}
                                        >
                                            {isOccupied ? (
                                                <div className="relative w-full h-full p-2 flex items-center justify-center group-item">
                                                    <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                    <img
                                                        src={descriptor.image}
                                                        alt={descriptor.name}
                                                        className="w-4/5 h-4/5 object-contain z-10"
                                                        onError={(e) => e.target.src = DEFAULT_MINER_IMAGE_URL}
                                                    />
                                                    <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary shadow-glow animate-pulse" />
                                                    
                                                    {/* Tooltip on hover */}
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 opacity-0 hover:opacity-100 transition-opacity z-20 p-2 text-center">
                                                        <span className="text-[8px] font-black text-primary uppercase tracking-[0.2em]">{descriptor.name}</span>
                                                        <span className="text-[10px] font-black text-white mt-1 italic">{formatHashrate(machine.hashRate || machine.hash_rate || 0)}</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="w-1.5 h-1.5 rounded-full bg-gray-800" />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="p-8 bg-blue-500/5 border border-blue-500/10 rounded-[2.5rem] flex items-start gap-6 max-w-2xl mx-auto">
                <div className="p-4 bg-blue-500/10 rounded-2xl">
                    <Shield className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                    <h4 className="text-white font-black text-lg italic uppercase">Acesso de Visitante</h4>
                    <p className="text-sm text-gray-500 leading-relaxed font-medium mt-1">
                        Você está no modo de visualização. Não é possível alterar as configurações, mover máquinas ou renomear racks deste minerador.
                    </p>
                </div>
            </div>
        </div>
    );
}
