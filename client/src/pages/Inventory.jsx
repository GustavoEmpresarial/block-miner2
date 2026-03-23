import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Box, Trash2, Plus, AlertCircle, Zap, Clock } from 'lucide-react';
import { useGameStore } from '../store/game';
import {
    getGlobalSlotIndex,
    getMachineBySlot,
    getMachineDescriptor,
    formatHashrate,
    RACKS_COUNT,
    SLOTS_PER_RACK,
    DEFAULT_MINER_IMAGE_URL
} from '../utils/machine';

export default function Inventory() {
    const { t } = useTranslation();
    const {
        machines,
        inventory,
        racks,
        isLoading,
        fetchAll,
        initSocket,
        installMachine,
        toggleMachine,
        updateRackName,
        clearRack,
        moveMachine,
        removeMachine
    } = useGameStore();

    const [selectedSlot, setSelectedSlot] = useState(null);
    const [isActionModalOpen, setIsActionModalOpen] = useState(false);
    const safeMachines = Array.isArray(machines) ? machines : [];
    const safeInventory = Array.isArray(inventory) ? inventory : [];
    const safeRacks = racks && typeof racks === 'object' ? racks : {};

    useEffect(() => {
        fetchAll();
        initSocket();
    }, []);

    const handleSlotClick = (rackIndex, localSlotIndex, machine) => {
        setSelectedSlot({ rackIndex, localSlotIndex, machine });
        setIsActionModalOpen(true);
    };

    const groupedInventory = useMemo(() => {
        const groups = {};
        for (const item of safeInventory) {
            const key = `${item.minerName || item.miner_name}_${item.level}_${item.hashRate || item.hash_rate}`;
            if (!groups[key]) {
                groups[key] = {
                    ...item,
                    quantity: 1,
                    items: [item]
                };
            } else {
                groups[key].quantity += 1;
                groups[key].items.push(item);
            }
        }
        return Object.values(groups);
    }, [safeInventory]);

    const handleDragStart = (e, machine) => {
        e.dataTransfer.setData('machineId', machine.id.toString());
        e.dataTransfer.setData('inventoryId', '');
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleInventoryDragStart = (e, inventoryGroup) => {
        e.dataTransfer.setData('inventoryId', inventoryGroup.items[0].id.toString());
        e.dataTransfer.setData('machineId', '');
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = async (e, rackIndex, localSlotIndex) => {
        e.preventDefault();
        e.stopPropagation();
        const machineId = e.dataTransfer.getData('machineId');
        const inventoryId = e.dataTransfer.getData('inventoryId');
        const globalSlotIndex = getGlobalSlotIndex(rackIndex, localSlotIndex);

        if (machineId && machineId !== '') {
            const res = await moveMachine(Number(machineId), globalSlotIndex);
            if (res.ok) toast.success(res.message);
            else toast.error(res.message);
        } else if (inventoryId && inventoryId !== '') {
            const res = await installMachine(globalSlotIndex, Number(inventoryId));
            if (res.ok) toast.success(res.message || t('inventory.modal.install_success'));
            else toast.error(res.message || t('common.error'));
        }
    };

    const handleInventoryDrop = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const machineId = e.dataTransfer.getData('machineId');
        if (machineId && machineId !== '') {
            const res = await removeMachine(Number(machineId));
            if (res.ok) {
                toast.success(res.message || t('inventory.modal.remove_success'));
                setIsActionModalOpen(false);
            } else {
                toast.error(res.message || t('common.error'));
            }
        }
    };

    const onInstall = async (inventoryId) => {
        const slotIndex = getGlobalSlotIndex(selectedSlot.rackIndex, selectedSlot.localSlotIndex);
        const res = await installMachine(slotIndex, inventoryId);
        if (res.ok) {
            toast.success(res.message || t('inventory.modal.install_success'));
            setIsActionModalOpen(false);
        } else {
            toast.error(res.message || t('common.error'));
        }
    };

    const onRemove = async (machineId) => {
        const res = await removeMachine(machineId);
        if (res.ok) {
            toast.success(res.message || t('inventory.modal.remove_success'));
            setIsActionModalOpen(false);
        } else {
            toast.error(res.message || t('common.error'));
        }
    };

    const activeMachinesHashRate = useMemo(() => {
        return safeMachines.reduce((sum, machine) => sum + Number(machine.hashRate || machine.hash_rate || 0), 0);
    }, [safeMachines]);

    return (
        <div className="space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight">{t('inventory.title')}</h1>
                    <p className="text-gray-500 font-medium">{t('inventory.subtitle')}</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="px-4 py-2 bg-purple-500/10 border border-purple-500/20 rounded-xl text-xs font-bold text-purple-400 flex items-center gap-1.5 shadow-glow-sm">
                        <Zap className="w-3.5 h-3.5" />
                        {formatHashrate(activeMachinesHashRate)}
                    </div>
                    <div className="px-4 py-2 bg-gray-800/50 border border-gray-700/50 rounded-xl text-xs font-bold text-gray-400">
                        {safeMachines.length} {t('inventory.active_machines')}
                    </div>
                    <div className="px-4 py-2 bg-primary/10 border border-primary/20 rounded-xl text-xs font-bold text-primary">
                        {safeInventory.length} {t('inventory.in_inventory')}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
                <div className="xl:col-span-2 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {Array.from({ length: RACKS_COUNT }).map((_, i) => {
                            const rackIndex = i + 1;
                            const rackName = safeRacks[rackIndex] || `Rack ${rackIndex}`;

                            return (
                                <div key={rackIndex} className="bg-surface border border-gray-800/50 rounded-3xl overflow-hidden shadow-xl">
                                    <div className="px-6 py-4 bg-gray-800/20 border-b border-gray-800/50 flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-glow" />
                                            <h3 className="text-sm font-bold text-gray-300">{rackName}</h3>
                                        </div>
                                        <button onClick={() => clearRack(rackIndex)} className="p-1.5 text-gray-500 hover:text-red-400 transition-colors" title={t('inventory.clear_rack')}>
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>

                                    <div className="p-4 grid grid-cols-4 gap-3">
                                        {Array.from({ length: SLOTS_PER_RACK }).map((_, localI) => {
                                            const globalI = getGlobalSlotIndex(rackIndex, localI);
                                            const machine = getMachineBySlot(globalI, safeMachines);
                                            if (machine && machine.isSecondSlot) return null;
                                            const descriptor = machine ? getMachineDescriptor(machine) : null;
                                            const isOccupied = !!machine;
                                            const isDouble = descriptor?.size === 2;

                                            return (
                                                <button
                                                    key={localI}
                                                    onClick={() => handleSlotClick(rackIndex, localI, machine)}
                                                    draggable={isOccupied}
                                                    onDragStart={isOccupied ? (e) => handleDragStart(e, machine) : undefined}
                                                    onDragOver={handleDragOver}
                                                    onDrop={(e) => handleDrop(e, rackIndex, localI)}
                                                    className={`relative aspect-square rounded-2xl border transition-all duration-300 group flex items-center justify-center ${isDouble ? 'col-span-2 aspect-auto' : ''} ${isOccupied ? 'bg-gray-800/40 border-gray-700/50 hover:border-primary/40 hover:bg-primary/5 cursor-grab active:cursor-grabbing' : 'bg-gray-900/40 border-dashed border-gray-800 hover:border-gray-700 hover:bg-gray-800/30'}`}
                                                >
                                                    {isOccupied ? (
                                                        <>
                                                            <img src={descriptor.image} alt={descriptor.name} className="w-4/5 h-4/5 object-contain p-2 group-hover:scale-110 transition-transform pointer-events-none" onError={(e) => e.target.src = DEFAULT_MINER_IMAGE_URL} />
                                                            <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary pointer-events-none" />
                                                        </>
                                                    ) : (
                                                        <Plus className="w-5 h-5 text-gray-700 group-hover:text-gray-500 transition-colors" />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="space-y-6" onDragOver={handleDragOver} onDrop={handleInventoryDrop}>
                    <div className="bg-surface border border-gray-800/50 rounded-3xl p-6 shadow-xl sticky top-28">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <Box className="w-5 h-5 text-primary" /> {t('sidebar.machines')}
                            </h2>
                            <span className="text-xs font-bold text-gray-500">{safeInventory.length} ITENS</span>
                        </div>

                        {safeInventory.length === 0 ? (
                            <div className="py-12 flex flex-col items-center justify-center text-center px-4 bg-gray-800/20 rounded-2xl border border-dashed border-gray-800">
                                <AlertCircle className="w-10 h-10 text-gray-700 mb-3" />
                                <p className="text-gray-500 text-sm font-medium">{t('inventory.empty_inventory')}</p>
                                <p className="text-gray-600 text-xs mt-1">{t('inventory.buy_miners_msg')}</p>
                            </div>
                        ) : (
                            <div className="space-y-3 max-h-[60vh] overflow-y-auto scrollbar-hide pr-1">
                                {groupedInventory.map((group) => {
                                    const descriptor = getMachineDescriptor({
                                        hashRate: group.hashRate || group.hash_rate,
                                        slotSize: group.slotSize || group.slot_size,
                                        imageUrl: group.imageUrl || group.image_url
                                    });

                                    return (
                                        <div key={group.id} draggable onDragStart={(e) => handleInventoryDragStart(e, group)} className="bg-gray-800/30 border border-gray-800/50 rounded-2xl p-4 flex items-center gap-4 hover:border-gray-700 transition-all group-item cursor-grab active:cursor-grabbing">
                                            <div className="w-14 h-14 bg-gray-900/50 rounded-xl p-2 border border-gray-800/50 shrink-0 relative pointer-events-none">
                                                <img src={descriptor.image} className="w-full h-full object-contain" />
                                                <div className="absolute -top-2 -right-2 bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg border border-primary/20 pointer-events-auto">x{group.quantity}</div>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="text-sm font-bold text-white truncate">{group.minerName || group.miner_name}</h4>
                                                <div className="flex items-center gap-3 mt-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                                    <span>{t('inventory.modal.level')} {group.level}</span>
                                                    <span>•</span>
                                                    <span className="text-primary font-black">{formatHashrate(group.hashRate || group.hash_rate)}</span>
                                                </div>
                                                {group.expiresAt && (
                                                    <div className="mt-1 flex items-center gap-1 text-[9px] font-bold text-amber-500/80 uppercase">
                                                        <Clock className="w-2.5 h-2.5" />
                                                        {t('inventory.expires')}: {new Date(group.expiresAt).toLocaleDateString()}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {isActionModalOpen && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-surface border border-gray-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
                        <div className="px-8 pt-8 pb-6 flex items-center justify-between border-b border-gray-800/50">
                            <div>
                                <h3 className="text-xl font-bold text-white">{selectedSlot.machine ? t('inventory.modal.details_title') : t('inventory.modal.install_title')}</h3>
                                <p className="text-xs font-bold text-gray-500 mt-1 uppercase tracking-widest">{t('inventory.modal.rack_slot', { rack: selectedSlot.rackIndex, slot: selectedSlot.localSlotIndex + 1 })}</p>
                            </div>
                            <button onClick={() => setIsActionModalOpen(false)} className="w-10 h-10 rounded-xl bg-gray-800/50 text-gray-400 flex items-center justify-center hover:text-white transition-colors"><Plus className="w-6 h-6 rotate-45" /></button>
                        </div>
                        <div className="p-8">
                            {selectedSlot.machine ? (
                                <div className="space-y-6">
                                    <div className="flex items-center gap-6 p-4 bg-gray-800/20 rounded-2xl border border-gray-800/50">
                                        <div className="w-20 h-20 bg-gray-900/50 rounded-2xl p-3 border border-gray-800/50">
                                            <img src={getMachineDescriptor(selectedSlot.machine).image} className="w-full h-full object-contain" />
                                        </div>
                                        <div>
                                            <h4 className="text-lg font-bold text-white">{selectedSlot.machine.minerName || selectedSlot.machine.miner_name}</h4>
                                            <div className="flex items-center gap-4 mt-1">
                                                <div className="flex flex-col"><span className="text-[10px] font-bold text-gray-600 uppercase">{t('inventory.modal.level')}</span><span className="text-sm font-bold text-gray-300">{selectedSlot.machine.level}</span></div>
                                                <div className="flex flex-col"><span className="text-[10px] font-bold text-gray-600 uppercase">{t('inventory.modal.hashrate')}</span><span className="text-sm font-bold text-primary uppercase">{formatHashrate(selectedSlot.machine.hashRate || selectedSlot.machine.hash_rate)}</span></div>
                                            </div>
                                            {selectedSlot.machine.expiresAt && (
                                                <div className="mt-3 p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2">
                                                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                                                    <span className="text-[10px] font-bold text-amber-500 uppercase">{t('inventory.expires_in')}: {new Date(selectedSlot.machine.expiresAt).toLocaleString()}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <button onClick={() => onRemove(selectedSlot.machine.id)} className="w-full py-4 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-2xl font-bold text-sm transition-all border border-red-500/20 flex items-center justify-center gap-2"><Trash2 className="w-4 h-4" /> {t('inventory.modal.remove_to_inventory')}</button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {safeInventory.length === 0 ? <div className="p-8 text-center bg-gray-800/20 rounded-2xl border border-dashed border-gray-800"><p className="text-gray-500 text-sm">{t('inventory.modal.no_machines_avail')}</p></div> : (
                                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                                            {groupedInventory.map(group => (
                                                <button key={group.id} onClick={() => onInstall(group.items[0].id)} className="w-full p-4 bg-gray-800/30 hover:bg-primary/10 border border-gray-800 hover:border-primary/30 rounded-2xl flex items-center justify-between transition-all group-item">
                                                    <div className="flex items-center gap-3 text-left">
                                                        <div className="w-10 h-10 bg-gray-900 rounded-lg p-2 shrink-0 relative">
                                                            <img src={getMachineDescriptor({ hashRate: group.hashRate || group.hash_rate, slotSize: group.slotSize || group.slot_size, imageUrl: group.imageUrl || group.image_url }).image} className="w-full h-full object-contain" />
                                                            <div className="absolute -top-2 -right-2 bg-primary text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-lg border border-primary/20">x{group.quantity}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-sm font-bold text-white group-hover:text-primary transition-colors">{group.minerName || group.miner_name}</div>
                                                            <div className="text-[10px] font-bold text-gray-500 uppercase">{formatHashrate(group.hashRate || group.hash_rate)}</div>
                                                        </div>
                                                    </div>
                                                    <Plus className="w-5 h-5 text-gray-600 group-hover:text-primary transition-colors" />
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div >
    );
}
