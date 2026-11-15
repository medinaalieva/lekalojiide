"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { User } from "../types";
import { api, ApiError } from "./api";

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCurrentUser = useCallback(async (authToken: string) => {
    try {
      const res = await api.get<{ success: boolean; data: any }>(
        "/api/v1/auth/me",
        { token: authToken }
      );
      if (res.success && res.data) {
        const u = res.data.user || res.data;
        if (u && (u.id || u.email)) {
          setUser(u);
        }
      }
    } catch (err: any) {
      // If access token is expired (401), attempt to rotate via HttpOnly refresh cookie
      if (err?.status === 401) {
        try {
          const refreshRes = await api.post<{
            success: boolean;
            data: { accessToken: string; user?: User };
          }>("/api/v1/auth/refresh");

          if (refreshRes.success && refreshRes.data?.accessToken) {
            const newAccessToken = refreshRes.data.accessToken;
            localStorage.setItem("lekalo_token", newAccessToken);
            setToken(newAccessToken);

            if (refreshRes.data.user) {
              setUser(refreshRes.data.user);
              return;
            }

            const meRes = await api.get<{ success: boolean; data: any }>(
              "/api/v1/auth/me",
              { token: newAccessToken }
            );
            if (meRes.success && meRes.data) {
              const u = meRes.data.user || meRes.data;
              if (u && (u.id || u.email)) {
                setUser(u);
                return;
              }
            }
          }
        } catch {
          // Refresh also failed or refresh token expired
        }
      }

      console.warn("Session expired or invalid:", err?.message || err);
      localStorage.removeItem("lekalo_token");
      setToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const savedToken = localStorage.getItem("lekalo_token");
    if (savedToken) {
      setToken(savedToken);
      fetchCurrentUser(savedToken).finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [fetchCurrentUser]);

  const login = async (email: string, password: string) => {
    const res = await api.post<{
      success: boolean;
      data: { user: User; accessToken: string };
    }>("/api/v1/auth/login", { email, password });

    if (res.success && res.data) {
      const { user: loggedInUser, accessToken } = res.data;
      localStorage.setItem("lekalo_token", accessToken);
      setToken(accessToken);
      setUser(loggedInUser);
    }
  };

  const register = async (data: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  }) => {
    const payload = {
      email: data.email.trim().toLowerCase(),
      password: data.password,
      firstName: data.firstName?.trim() || undefined,
      lastName: data.lastName?.trim() || undefined,
      phone: data.phone?.trim() || undefined,
    };

    const res = await api.post<{
      success: boolean;
      data: { user: User; accessToken: string };
    }>("/api/v1/auth/register", payload);

    if (res.success && res.data) {
      const { user: registeredUser, accessToken } = res.data;
      if (accessToken) {
        localStorage.setItem("lekalo_token", accessToken);
        setToken(accessToken);
      }
      if (registeredUser) {
        setUser(registeredUser);
      }
    }
  };

  const logout = async () => {
    try {
      await api.post("/api/v1/auth/logout");
    } catch {
      // Ignore logout errors
    } finally {
      localStorage.removeItem("lekalo_token");
      setToken(null);
      setUser(null);
    }
  };

  const refreshUser = async () => {
    const savedToken = localStorage.getItem("lekalo_token");
    if (savedToken) {
      await fetchCurrentUser(savedToken);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
