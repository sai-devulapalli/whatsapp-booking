import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { clearToken, getToken, setToken } from "../api/client";

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "ORG_ADMIN" | "STAFF";
}

interface AuthContextValue {
  isAuthenticated: boolean;
  user: AuthUser | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const USER_KEY = "booking_admin_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(getToken());
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: !!token,
      user,
      login: (newToken, newUser) => {
        setToken(newToken);
        localStorage.setItem(USER_KEY, JSON.stringify(newUser));
        setTokenState(newToken);
        setUser(newUser);
      },
      logout: () => {
        clearToken();
        localStorage.removeItem(USER_KEY);
        setTokenState(null);
        setUser(null);
      },
    }),
    [token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
