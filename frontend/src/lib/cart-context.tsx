"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Cart, CartItem } from "../types";
import { api } from "./api";
import { useAuth } from "./auth-context";

interface CartContextType {
  cart: Cart | null;
  itemsCount: number;
  totalAmountKgs: number;
  isLoading: boolean;
  addItem: (productVariantId: string) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  updateItemVariant: (itemId: string, newVariantId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  refreshCart: () => Promise<void>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user, token } = useAuth();
  const [cart, setCart] = useState<Cart | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchCart = useCallback(async () => {
    if (!token) {
      setCart(null);
      return;
    }

    try {
      setIsLoading(true);
      const res = await api.get<{ success: boolean; data: Cart }>("/api/v1/cart");
      if (res.success && res.data) {
        setCart(res.data);
      }
    } catch (err) {
      console.error("Failed to load user cart:", err);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchCart();
    } else {
      setCart(null);
    }
  }, [token, fetchCart]);

  const addItem = async (productVariantId: string) => {
    if (!token) {
      throw new Error("AUTH_REQUIRED");
    }

    setIsLoading(true);
    try {
      const res = await api.post<{ success: boolean; data: Cart }>(
        "/api/v1/cart/items",
        { variantId: productVariantId }
      );
      if (res.success && res.data) {
        setCart(res.data);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const removeItem = async (itemId: string) => {
    if (!token) return;

    setIsLoading(true);
    try {
      const res = await api.delete<{ success: boolean; data: Cart }>(
        `/api/v1/cart/items/${itemId}`
      );
      if (res.success && res.data) {
        setCart(res.data);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const updateItemVariant = async (itemId: string, productVariantId: string) => {
    if (!token) return;

    setIsLoading(true);
    try {
      const res = await api.put<{ success: boolean; data: Cart }>(
        `/api/v1/cart/items/${itemId}`,
        { newVariantId: productVariantId }
      );
      if (res.success && res.data) {
        setCart(res.data);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const clearCart = async () => {
    if (!token) return;

    setIsLoading(true);
    try {
      const res = await api.delete<{ success: boolean; data: Cart }>("/api/v1/cart");
      if (res.success && res.data) {
        setCart(res.data);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const itemsCount = cart?.totalItems ?? cart?.itemsCount ?? cart?.items?.length ?? 0;
  const totalAmountKgs = cart?.totalAmount ?? cart?.totalAmountKgs ?? 0;

  return (
    <CartContext.Provider
      value={{
        cart,
        itemsCount,
        totalAmountKgs,
        isLoading,
        addItem,
        removeItem,
        updateItemVariant,
        clearCart,
        refreshCart: fetchCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
