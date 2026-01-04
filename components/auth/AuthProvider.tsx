'use client';

import React, { createContext, useContext, useMemo, useState } from 'react';
import { getToken as getStoredToken, setToken as setStoredToken, clearToken as clearStoredToken } from '@/lib/auth';

type AuthContextValue = {
    token: string | null;
    isLoading: boolean;
    setToken: (token: string) => void;
    clearToken: () => void;
    isAdmin: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

interface JwtPayload {
    role?: string;
    [key: string]: unknown;
}

function decodeJwtPayload(token: string): JwtPayload | null {
    try {
        const parts = token.split('.');
        if (parts.length < 2) return null;
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const json = decodeURIComponent(
            atob(b64)
                .split('')
                .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
                .join('')
        );
        return JSON.parse(json);
    } catch {
        return null;
    }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [token, setTokenState] = useState<string | null>(() => {
        if (typeof window !== 'undefined') {
            return getStoredToken();
        }
        return null;
    });

    // Removed unused isLoading state

    const setToken = (newToken: string) => {
        setStoredToken(newToken);
        setTokenState(newToken);
    };

    const clearToken = () => {
        clearStoredToken();
        setTokenState(null);
    };

    const isAdmin = useMemo(() => {
        if (!token) return false;
        const p = decodeJwtPayload(token);
        return p?.role === 'admin';
    }, [token]);

    const value = useMemo(
        () => ({ token, isLoading: false, setToken, clearToken, isAdmin }),
        [token, isAdmin]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return ctx;
}
