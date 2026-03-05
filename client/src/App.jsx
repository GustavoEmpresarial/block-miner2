import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useAuthStore } from './store/auth';

import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Shop from './pages/Shop';
import Inventory from './pages/Inventory';
import Wallet from './pages/Wallet';
import Faucet from './pages/Faucet';
import Shortlinks from './pages/Shortlinks';
import Checkin from './pages/Checkin';
import YouTubeWatch from './pages/YouTubeWatch';
import Offerwalls from './pages/Offerwalls';
import Ranking from './pages/Ranking';
import ShortlinkStep from './pages/ShortlinkStep';

import ChatSidebar from './components/ChatSidebar';

// Admin Pages
import AdminLogin from './pages/AdminLogin';
import AdminLayout from './components/AdminLayout';
import AdminDashboard from './pages/AdminDashboard';
import AdminUsers from './pages/AdminUsers';
import AdminMiners from './pages/AdminMiners';

// Temporary place-holders for missing admin pages
const AdminFinance = () => <div className="p-8 text-slate-400 font-bold uppercase tracking-widest text-center py-20 bg-slate-900 border border-slate-800 rounded-[2.5rem]">Gestão Financeira em desenvolvimento...</div>;
const AdminBackups = () => <div className="p-8 text-slate-400 font-bold uppercase tracking-widest text-center py-20 bg-slate-900 border border-slate-800 rounded-[2.5rem]">Sistema de Backups em desenvolvimento...</div>;
const AdminLogs = () => <div className="p-8 text-slate-400 font-bold uppercase tracking-widest text-center py-20 bg-slate-900 border border-slate-800 rounded-[2.5rem]">Logs de Sistema em desenvolvimento...</div>;
const AdminMetrics = () => <div className="p-8 text-slate-400 font-bold uppercase tracking-widest text-center py-20 bg-slate-900 border border-slate-800 rounded-[2.5rem]">Métricas do Servidor em desenvolvimento...</div>;

const Landing = () => {
  const { isAuthenticated } = useAuthStore();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-3xl space-y-8">
        <h1 className="text-6xl font-black tracking-tighter bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent italic">
          BLOCK MINER
        </h1>
        <p className="text-xl text-slate-400 leading-relaxed">
          The next generation of Web3 mining simulation. Build your farm, upgrade your rigs, and mine real rewards in a premium competitive environment.
        </p>
        <div className="flex gap-4 justify-center pt-8">
          <a href="/login" className="px-8 py-4 bg-primary text-white font-bold rounded-2xl hover:scale-105 transition-transform">
            Start Mining
          </a>
          <a href="/register" className="px-8 py-4 bg-slate-800 text-white font-bold rounded-2xl hover:bg-slate-700 transition-colors">
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
    <div className="flex h-screen bg-background overflow-hidden text-gray-100 font-sans">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <Header />
        <main className="flex-1 overflow-y-auto scrollbar-hide">
          <div className="p-8 max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
        <ChatSidebar />
      </div>
    </div>
  );
};

function App() {
  const { checkSession, isLoading } = useAuthStore();

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex justify-center items-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Toaster position="top-right" richColors expand={true} />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route element={<ProtectedLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/faucet" element={<Faucet />} />
          <Route path="/shortlinks" element={<Shortlinks />} />
          <Route path="/checkin" element={<Checkin />} />
          <Route path="/youtube" element={<YouTubeWatch />} />
          <Route path="/offerwalls" element={<Offerwalls />} />
          <Route path="/ranking" element={<Ranking />} />
          <Route path="/shortlink/internal-shortlink/verify" element={<ShortlinkStep />} />
        </Route>

        {/* Admin Routes */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route element={<AdminLayout />}>
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/miners" element={<AdminMiners />} />
          <Route path="/admin/finance" element={<AdminFinance />} />
          <Route path="/admin/backups" element={<AdminBackups />} />
          <Route path="/admin/logs" element={<AdminLogs />} />
          <Route path="/admin/metrics" element={<AdminMetrics />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App;
