import { create } from 'zustand';
import type { User } from '../types';
import { getSession, logout as localLogout } from '../services/auth';

interface AuthState {
  user: User | null;
  setUser: (user: User) => void;
  logout: () => void;
}

// Read synchronously on store creation — no async init() needed
const savedSession = getSession() as unknown as User | null;

export const useAuthStore = create<AuthState>((set) => ({
  user: savedSession,
  setUser: (user) => set({ user }),
  logout: () => { localLogout(); set({ user: null }); },
}));
