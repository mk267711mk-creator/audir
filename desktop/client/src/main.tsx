import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import './i18n';
import './index.css';
import { useAuthStore } from './store/authStore';
import AuthPage from './components/Auth/AuthPage';
import Layout from './components/Layout/Layout';
import HomePage from './components/VideoList/HomePage';
import PlayerPage from './components/Player/PlayerPage';
import DashboardPage from './components/Dashboard/DashboardPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user);
  return user ? <>{children}</> : <Navigate to="/auth" replace />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Toaster
        position="top-center"
        toastOptions={{
          style: { background: '#1e293b', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' },
        }}
      />
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/" element={<ProtectedRoute><Layout><HomePage /></Layout></ProtectedRoute>} />
        <Route path="/play/:id" element={<ProtectedRoute><Layout><PlayerPage /></Layout></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><Layout><DashboardPage /></Layout></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
