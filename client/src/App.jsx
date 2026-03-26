import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useAuthStore } from './store/auth';
import { MobileNavProvider } from './context/MobileNavContext';

import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard from './pages/Dashboard';
import Shop from './pages/Shop';
import Inventory from './pages/Inventory';
import Wallet from './pages/Wallet';
import Faucet from './pages/Faucet';
import Shortlinks from './pages/Shortlinks';
import Checkin from './pages/Checkin';
import YouTubeWatch from './pages/YouTubeWatch';
import Ranking from './pages/Ranking';
import PublicRoom from './pages/PublicRoom';
import Settings from './pages/Settings';
import AutoMining from './pages/AutoMining';
import Games from './pages/Games';
import ShortlinkStep from './pages/ShortlinkStep';

import ChatSidebar from './components/ChatSidebar';
import SupportMiniChat from './components/SupportMiniChat';
import AdBlockDetector from './components/AdBlockDetector';

import AdminLogin from './pages/AdminLogin';
import AdminLayout from './components/AdminLayout';
import AdminDashboard from './pages/AdminDashboard';
import AdminMiners from './pages/AdminMiners';
import AdminUsers from './pages/AdminUsers';
import AdminFinance from './pages/AdminFinance';
import AdminBackups from './pages/AdminBackups';
import AdminLogs from './pages/AdminLogs';
import AdminMetrics from './pages/AdminMetrics';
import AdminSupport from './pages/AdminSupport';

// Main App Component
const Landing = () => {
  const { isAuthenticated } = useAuthStore();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-950 text-white flex flex-col items-center justify-center px-4 py-8 sm:p-6 text-center safe-pb">
      <div className="max-w-3xl space-y-6 sm:space-y-8 w-full">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tighter bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent italic">
          BLOCK MINER
        </h1>
        <p className="text-base sm:text-xl text-slate-400 leading-relaxed px-1">
          The next generation of Web3 mining simulation. Build your farm, upgrade your rigs, and mine real rewards in a premium competitive environment.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center pt-4 sm:pt-8 w-full max-w-md sm:max-w-none mx-auto">
          <a href="/login" className="px-8 py-4 bg-primary text-white font-bold rounded-2xl hover:scale-[1.02] sm:hover:scale-105 transition-transform touch-manipulation text-center">
            Start Mining
          </a>
          <a href="/register" className="px-8 py-4 bg-slate-800 text-white font-bold rounded-2xl hover:bg-slate-700 transition-colors touch-manipulation text-center">
            Join the Network
          </a>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-16">
          <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-3xl">
            <h3 className="text-primary font-bold mb-2">Realtime Mining</h3>
            <p className="text-sm text-slate-500">Experience block rewards every 10 minutes with live global hashpower.</p>
          </div>
          <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-3xl">
            <h3 className="text-primary font-bold mb-2">Economy</h3>
            <p className="text-sm text-slate-500">Swap assets, participate in offerwalls and faucets to boost your growth.</p>
          </div>
          <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-3xl">
            <h3 className="text-primary font-bold mb-2">Security</h3>
            <p className="text-sm text-slate-500">Built on top of Prisma & PostgreSQL with military-grade JWT auth.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const ProtectedLayout = () => {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <MobileNavProvider>
      <div className="flex h-screen min-h-0 bg-background overflow-hidden text-gray-100 font-sans">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          <Header />
          <main className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide overscroll-contain">
            <div className="p-3 pb-6 sm:p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full min-w-0 safe-pb">
              <Outlet />
            </div>
          </main>
          <ChatSidebar />
        </div>
      </div>
    </MobileNavProvider>
  );
};

function App() {
  const { checkSession, isLoading } = useAuthStore();
  const [toasterPosition, setToasterPosition] = useState('bottom-right');

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const apply = () => setToasterPosition(mq.matches ? 'bottom-center' : 'bottom-right');
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex justify-center items-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Toaster
        theme="dark"
        position={toasterPosition}
        richColors={false}
        expand={true}
        toastOptions={{
          className: 'bg-slate-950/80 backdrop-blur-md border border-white/5 rounded-xl text-white font-mono text-[10px] uppercase tracking-widest p-4 shadow-2xl',
          style: {
            background: 'rgba(2, 6, 23, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            color: '#fff',
          },
          classNames: {
            error: 'border-red-500/30 !text-red-400',
            success: 'border-emerald-500/30 !text-emerald-400',
            warning: 'border-orange-500/30 !text-orange-400',
            info: 'border-blue-500/30 !text-blue-400',
          },
        }}
      />
      <AdBlockDetector />
      <SupportMiniChat />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        <Route element={<ProtectedLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/faucet" element={<Faucet />} />
          <Route path="/shortlinks" element={<Shortlinks />} />
          <Route path="/checkin" element={<Checkin />} />
          <Route path="/youtube" element={<YouTubeWatch />} />
          <Route path="/auto-mining" element={<AutoMining />} />
          <Route path="/ranking" element={<Ranking />} />
          <Route path="/room/:username" element={<PublicRoom />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/games" element={<Games />} />
          <Route path="/shortlink/internal-shortlink/step/:step" element={<ShortlinkStep />} />
        </Route>

        {/* Admin Routes */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route element={<AdminLayout />}>
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/miners" element={<AdminMiners />} />
          <Route path="/admin/finance" element={<AdminFinance />} />
          <Route path="/admin/support" element={<AdminSupport />} />
          <Route path="/admin/backups" element={<AdminBackups />} />
          <Route path="/admin/logs" element={<AdminLogs />} />
          <Route path="/admin/metrics" element={<AdminMetrics />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App;
