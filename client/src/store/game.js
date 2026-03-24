import { create } from 'zustand';
import { api } from './auth';
import { io } from 'socket.io-client';

const asArray = (value) => (Array.isArray(value) ? value : []);

export const useGameStore = create((set, get) => ({
    machines: [],
    inventory: [],
    racks: {},
    stats: null,
    messages: [],
    privateMessages: [],
    conversations: [],
    notifications: [],
    activePrivateUser: null,
    socket: null,
    isLoading: true,
    isChatOpen: false,
    isSidebarOpen: false,
    
    // Notification State
    unreadPms: 0,
    hasMention: false,

    toggleChat: () => set(state => ({ isChatOpen: !state.isChatOpen, hasMention: false })),
    openChat: () => set({ isChatOpen: true, hasMention: false }),
    closeChat: () => set({ isChatOpen: false }),

    toggleSidebar: () => set(state => ({ isSidebarOpen: !state.isSidebarOpen })),
    openSidebar: () => set({ isSidebarOpen: true }),
    closeSidebar: () => set({ isSidebarOpen: false }),
    
    clearMention: () => set({ hasMention: false }),
    clearUnreadPms: () => set({ unreadPms: 0 }),

    setActivePrivateUser: (user) => set({ activePrivateUser: user }),
    clearActivePrivateUser: () => set({ activePrivateUser: null }),

    initSocket: () => {
        if (get().socket) return;

        const socket = io('/', { withCredentials: true });

        socket.on('connect', () => {
            console.log('Socket connected');
            
            // Try to find the token in cookies for explicit pass
            const cookies = document.cookie.split(';').reduce((acc, cookie) => {
                const [key, value] = cookie.trim().split('=');
                acc[key] = value;
                return acc;
            }, {});
            const token = cookies['blockminer_access'];

            socket.emit('miner:join', { token }, (response) => {
                if (response?.ok && response.state) {
                    set((state) => ({
                        stats: { ...response.state, miner: response.state.miner || state.stats?.miner }
                    }));
                }
            });
        });

        socket.on('state:update', (payload) => {
            set((state) => {
                const currentHistory = state.stats?.blockHistory || [];
                const incomingHistory = payload.blockHistory || [];
                
                const shouldKeepCurrentHistory = 
                    incomingHistory.every(b => (Number(b.userReward) || 0) === 0) && 
                    currentHistory.some(b => (Number(b.userReward) || 0) > 0);

                return {
                    stats: {
                        ...payload,
                        miner: payload.miner || state.stats?.miner,
                        blockHistory: shouldKeepCurrentHistory ? currentHistory : incomingHistory
                    }
                };
            });
        });

        socket.on('miner:update', (minerPayload) => {
            set((state) => ({ stats: state.stats ? { ...state.stats, miner: minerPayload } : { miner: minerPayload } }));
        });

        socket.on('inventory:update', (payload) => {
            if (Array.isArray(payload?.inventory)) set({ inventory: payload.inventory });
            else get().fetchInventory();
        });

        socket.on('machines:update', (payload) => {
            if (Array.isArray(payload?.machines)) set({ machines: payload.machines });
            else get().fetchMachines();
        });

        socket.on('chat:new-message', (msg) => {
            const currentUser = JSON.parse(localStorage.getItem('user-storage'))?.state?.user;
            if (currentUser && msg.message.includes(`@${currentUser.username || currentUser.name}`)) {
                if (!get().isChatOpen) set({ hasMention: true });
            }
            get().fetchMessages();
        });

        socket.on('chat:new-pm', (pm) => {
            const activeUser = get().activePrivateUser;
            const currentUser = JSON.parse(localStorage.getItem('user-storage'))?.state?.user;
            if (pm.receiverId === currentUser?.id && (!get().isChatOpen || activeUser?.id !== pm.senderId)) {
                set(state => ({ unreadPms: state.unreadPms + 1 }));
            }
            if (activeUser && (pm.senderId === activeUser.id || pm.receiverId === activeUser.id)) {
                get().fetchPrivateMessages(activeUser.id);
            }
            get().fetchConversations();
        });

        socket.on('notification:new', (notification) => {
            set(state => ({
                notifications: [notification, ...state.notifications]
            }));
        });

        set({ socket });
    },

    fetchMachines: async () => {
        try {
            const res = await api.get('/machines');
            if (res.data.ok) set({ machines: asArray(res.data.machines) });
        } catch (err) { console.error(err); }
    },

    fetchInventory: async () => {
        try {
            const res = await api.get('/inventory');
            if (res.data.ok) set({ inventory: asArray(res.data.inventory) });
        } catch (err) { console.error(err); }
    },

    fetchRacks: async () => {
        try {
            const res = await api.get('/racks');
            if (res.data.ok && Array.isArray(res.data.racks)) {
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

    fetchPrivateMessages: async (targetUserId) => {
        try {
            const res = await api.get(`/chat/private/${targetUserId}`);
            if (res.data.ok) set({ privateMessages: res.data.messages });
        } catch (err) { console.error(err); }
    },

    fetchConversations: async () => {
        try {
            const res = await api.get('/chat/conversations');
            if (res.data.ok) set({ conversations: res.data.conversations });
        } catch (err) { console.error(err); }
    },

    fetchNotifications: async () => {
        try {
            const res = await api.get('/notifications');
            if (res.data.ok) set({ notifications: res.data.notifications });
        } catch (err) { console.error(err); }
    },

    markNotificationRead: async (id) => {
        try {
            const res = await api.post(`/notifications/read/${id}`);
            if (res.data.ok) {
                if (id === 'all') {
                    set(state => ({
                        notifications: state.notifications.map(n => ({ ...n, isRead: true }))
                    }));
                } else {
                    set(state => ({
                        notifications: state.notifications.map(n => n.id === id ? { ...n, isRead: true } : n)
                    }));
                }
            }
        } catch (err) { console.error(err); }
    },

    sendMessage: async (message, replyToId = null) => {
        try {
            const res = await api.post('/chat/send', { message, replyToId });
            return res.data;
        } catch (err) {
            return { ok: false, message: err.response?.data?.message || "Error sending message" };
        }
    },

    sendPrivateMessage: async (receiverId, message) => {
        try {
            const res = await api.post('/chat/send-private', { receiverId, message });
            if (res.data.ok) {
                get().fetchPrivateMessages(receiverId);
                get().fetchConversations();
            }
            return res.data;
        } catch (err) {
            return { ok: false, message: err.response?.data?.message || "Error sending PM" };
        }
    },

    installMachine: async (slotIndex, inventoryId) => {
        try {
            const res = await api.post('/inventory/install', { slotIndex, inventoryId });
            if (res.data.ok) { get().fetchMachines(); get().fetchInventory(); }
            return res.data;
        } catch (err) { return { ok: false }; }
    },

    removeMachine: async (machineId) => {
        try {
            const res = await api.post('/machines/remove', { machineId });
            if (res.data.ok) { get().fetchMachines(); get().fetchInventory(); }
            return res.data;
        } catch (err) {
            return { ok: false, message: err.response?.data?.message || 'Error removing miner.' };
        }
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
            get().fetchMessages(),
            get().fetchNotifications()
        ]);
        set({ isLoading: false });
    }
}));
