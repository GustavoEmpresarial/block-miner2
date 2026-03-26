import { create } from 'zustand';
import axios from 'axios';
import { generateSecurityPayload } from '../utils/security';

// Configure default axios behavior for our API
export const api = axios.create({
    baseURL: '/api',
    withCredentials: true, // Need this to send cookies
    xsrfCookieName: 'blockminer_csrf',
    xsrfHeaderName: 'x-csrf-token',
});

// Interceptor to attach Anti-Bot payload to every API request
api.interceptors.request.use((config) => {
    try {
        const url = String(config.url || '');
        if (url.startsWith('/admin/') && !url.startsWith('/admin/auth/login')) {
            const t = localStorage.getItem('adminToken');
            if (t) config.headers.Authorization = `Bearer ${t}`;
        }
    } catch {
        /* ignore */
    }
    // We only attach this for state-changing or critical requests,
    // but attaching it everywhere is safer and simpler.
    try {
        const security = generateSecurityPayload();
        config.headers['X-Anti-Bot-Payload'] = security.fingerprint;
        config.headers['X-Anti-Bot-Key'] = security.sk;
        config.headers['X-Anti-Bot'] = security.isBot ? '1' : '0';
    } catch (e) {
        // Fallback if security module fails
        config.headers['X-Anti-Bot'] = '0';
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});

export const useAuthStore = create((set) => ({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,

    /**
     * @param {{ retries?: number, retryDelayMs?: number, silent?: boolean }} options
     * silent=true: não altera isLoading (evita desmontar o BrowserRouter em App.jsx durante login/registo).
     */
    checkSession: async (options = {}) => {
        const { retries = 0, retryDelayMs = 200, silent = false } = options;

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                if (!silent) {
                    set({ isLoading: true, error: null });
                } else {
                    set({ error: null });
                }
                const response = await api.get('/auth/session');
                set({ user: response.data.user, isAuthenticated: true, isLoading: false });
                return true;
            } catch (error) {
                if (attempt < retries) {
                    await new Promise((r) => setTimeout(r, retryDelayMs));
                    continue;
                }
                if (silent) {
                    set({ user: null, isAuthenticated: false });
                } else {
                    set({ user: null, isAuthenticated: false, isLoading: false });
                }
            }
        }

        return false;
    },

    login: async (identifier, password) => {
        try {
            set({ isLoading: true, error: null });
            const response = await api.post('/auth/login', { identifier, password });
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
            const fieldError = error.response?.data?.errors?.[0]?.message;
            const code = error.response?.data?.code;
            set({
                error: fieldError || error.response?.data?.message || 'Erro ao registrar',
                isLoading: false
            });
            return { success: false, message: fieldError || error.response?.data?.message, code };
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
