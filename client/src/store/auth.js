import { create } from 'zustand';
import axios from 'axios';

// Configure default axios behavior for our API
export const api = axios.create({
    baseURL: '/api',
    withCredentials: true, // Need this to send cookies
});

export const useAuthStore = create((set) => ({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,

    checkSession: async () => {
        try {
            set({ isLoading: true, error: null });
            const response = await api.get('/auth/session');
            set({ user: response.data.user, isAuthenticated: true, isLoading: false });
        } catch (error) {
            set({ user: null, isAuthenticated: false, isLoading: false });
        }
    },

    login: async (email, password) => {
        try {
            set({ isLoading: true, error: null });
            const response = await api.post('/auth/login', { email, password });
            set({ user: response.data.user, isAuthenticated: true, isLoading: false });
            return { success: true };
        } catch (error) {
            set({
                error: error.response?.data?.message || 'Erro ao realizar login',
                isLoading: false
            });
            return { success: false, message: error.response?.data?.message };
        }
    },

    register: async (data) => {
        try {
            set({ isLoading: true, error: null });
            const response = await api.post('/auth/register', data);
            set({ user: response.data.user, isAuthenticated: true, isLoading: false });
            return { success: true };
        } catch (error) {
            set({
                error: error.response?.data?.message || 'Erro ao registrar',
                isLoading: false
            });
            return { success: false, message: error.response?.data?.message };
        }
    },

    logout: async () => {
        try {
            await api.post('/auth/logout');
        } finally {
            set({ user: null, isAuthenticated: false });
        }
    }
}));
