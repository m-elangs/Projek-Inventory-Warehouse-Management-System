import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from '@/types/domain';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setSession: (token: string, user: AuthUser) => void;
  updateUser: (user: AuthUser) => void;
  clearSession: () => void;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      setSession: (token, user) => set({ token, user }),
      updateUser: (user) => set({ user }),
      clearSession: () => set({ token: null, user: null }),
      hasPermission: (permission) => {
        const user = get().user;
        if (!user || !user.is_active) return false;
        if (user.is_admin) return true;
        return user.permissions.includes(permission);
      },
      hasAnyPermission: (permissions) => {
        const user = get().user;
        if (!user || !user.is_active) return false;
        if (user.is_admin) return true;
        return permissions.some((p) => user.permissions.includes(p));
      },
    }),
    {
      name: 'strata-wms-auth',
    }
  )
);
