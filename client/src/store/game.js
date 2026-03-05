import { create } from 'zustand';
import { api } from './auth';
import { io } from 'socket.io-client';

export const useGameStore = create((set, get) => ({
    machines: [],
    inventory: [],
    racks: {},
    stats: null,
    messages: [],
    socket: null,
    isLoading: true,
    isChatOpen: false,

    toggleChat: () => set(state => ({ isChatOpen: !state.isChatOpen })),
    openChat: () => set({ isChatOpen: true }),
    closeChat: () => set({ isChatOpen: false }),

    initSocket: () => {
        if (get().socket) return;

        const socket = io('/', {
            withCredentials: true
        });

        socket.on('connect', () => {
            console.log('Socket connected');
            socket.emit('miner:join', {}, (response) => {
                if (response?.ok && response.state) {
                    set((state) => ({
                        stats: {
                            ...response.state,
                            miner: response.state.miner || state.stats?.miner
                        }
                    }));
                }
            });
        });

        socket.on('state:update', (payload) => {
            set((state) => ({
                stats: {
                    ...payload,
                    miner: payload.miner || state.stats?.miner
                }
            }));
        });

        socket.on('miner:update', (minerPayload) => {
            set((state) => ({
                stats: state.stats ? { ...state.stats, miner: minerPayload } : { miner: minerPayload }
            }));
        });

        socket.on('inventory:update', (payload) => {
            if (payload?.inventory) {
                set({ inventory: payload.inventory });
            } else {
                get().fetchInventory();
            }
        });

        socket.on('machines:update', (payload) => {
            if (payload?.machines) {
                set({ machines: payload.machines });
            } else {
                get().fetchMachines();
            }
        });

        socket.on('chat:new-message', () => {
            get().fetchMessages();
        });

        set({ socket });
    },

    fetchMachines: async () => {
        try {
            const res = await api.get('/machines');
            if (res.data.ok) set({ machines: res.data.machines });
        } catch (err) { console.error(err); }
    },

    fetchInventory: async () => {
        try {
            const res = await api.get('/inventory');
            if (res.data.ok) set({ inventory: res.data.inventory });
        } catch (err) { console.error(err); }
    },

    fetchRacks: async () => {
        try {
            const res = await api.get('/racks');
            if (res.data.ok && res.data.racks) {
                const racksObj = {};
                res.data.racks.forEach(r => { racksObj[r.rack_index] = r.custom_name; });
                set({ racks: racksObj });
            }
        } catch (err) { console.error(err); }
    },

    fetchMessages: async () => {
        try {
            const res = await api.get('/chat/messages');
            if (res.data.ok) set({ messages: res.data.messages });
        } catch (err) { console.error(err); }
    },

    sendMessage: async (message) => {
        try {
            const res = await api.post('/chat/send', { message });
            return res.data;
        } catch (err) {
            return { ok: false, message: err.response?.data?.message || "Error sending message" };
        }
    },

    installMachine: async (slotIndex, inventoryId) => {
        try {
            const res = await api.post('/inventory/install', { slotIndex, inventoryId });
            if (res.data.ok) {
                get().fetchMachines();
                get().fetchInventory();
            }
            return res.data;
        } catch (err) { return { ok: false }; }
    },

    removeMachine: async (machineId) => {
        try {
            const res = await api.post('/machines/remove', { machineId });
            if (res.data.ok) {
                get().fetchMachines();
                get().fetchInventory();
            }
            return res.data;
        } catch (err) { return { ok: false }; }
    },

    toggleMachine: async (machineId, isActive) => {
        try {
            const res = await api.post('/machines/toggle', { machineId, isActive });
            if (res.data.ok) get().fetchMachines();
            return res.data;
        } catch (err) { return { ok: false }; }
    },

    moveMachine: async (machineId, targetSlotIndex) => {
        try {
            const res = await api.post('/machines/move', { machineId, targetSlotIndex });
            if (res.data.ok) get().fetchMachines();
            return res.data;
        } catch (err) { return { ok: false, message: 'Server error' }; }
    },

    fetchAll: async () => {
        set({ isLoading: true });
        await Promise.all([
            get().fetchMachines(),
            get().fetchInventory(),
            get().fetchRacks(),
            get().fetchMessages()
        ]);
        set({ isLoading: false });
    }
}));
