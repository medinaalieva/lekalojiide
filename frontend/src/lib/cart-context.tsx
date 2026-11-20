"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Cart, CartItem } from "../types";
import { api } from "./api";
import { useAuth } from "./auth-context";

const GUEST_CART_KEY = "lekalo_guest_cart";

interface CartContextType {
  cart: Cart | null;
  itemsCount: number;
  totalAmountKgs: number;
  isLoading: boolean;
  addItem: (productVariantId: string, itemData?: Partial<CartItem>) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  updateItemVariant: (itemId: string, newVariantId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  refreshCart: () => Promise<void>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

function getGuestCartFromStorage(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(GUEST_CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveGuestCartToStorage(items: CartItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items));
  } catch (e) {
    console.warn("Could not save guest cart to localStorage:", e);
  }
}

function buildGuestCart(items: CartItem[]): Cart {
  const total = items.reduce(
    (sum, it) => sum + (it.price ?? it.priceKgs ?? (it.variant?.price ?? 0)),
    0
  );
  const rounded = Math.round(total * 100) / 100;
  return {
    id: "guest-cart",
    currency: "KGS",
    items,
    totalItems: items.length,
    itemsCount: items.length,
    totalAmount: rounded,
    totalAmountKgs: rounded,
  };
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user, token } = useAuth();
  const [cart, setCart] = useState<Cart | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load server cart
  const fetchServerCart = useCallback(async () => {
    if (!token) return;

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

  // Handle auth transition and guest cart merge
  useEffect(() => {
    if (token) {
      // User is logged in: check if there are guest items to merge
      const guestItems = getGuestCartFromStorage();
      if (guestItems.length > 0) {
        setIsLoading(true);
        // Sequentially merge guest items into server cart
        (async () => {
          for (const item of guestItems) {
            try {
              await api.post("/api/v1/cart/items", { variantId: item.variantId });
            } catch (err: any) {
              // Ignore conflict (409) if item already exists on server
              if (err?.status !== 409 && err?.code !== "VARIANT_ALREADY_IN_CART") {
                console.warn("Failed to merge guest item:", item.variantId, err);
              }
            }
          }
          // Clear guest cart after merge
          saveGuestCartToStorage([]);
          await fetchServerCart();
        })();
      } else {
        fetchServerCart();
      }
    } else {
      // Guest mode: load from localStorage
      const guestItems = getGuestCartFromStorage();
      setCart(buildGuestCart(guestItems));
    }
  }, [token, fetchServerCart]);

  const addItem = async (productVariantId: string, itemData?: Partial<CartItem>) => {
    if (!token) {
      // Guest: Add to localStorage
      const currentItems = getGuestCartFromStorage();
      const existing = currentItems.find(
        (it) => it.variantId === productVariantId || it.id === productVariantId
      );
      if (existing) {
        const err: any = new Error("VARIANT_ALREADY_IN_CART");
        err.code = "VARIANT_ALREADY_IN_CART";
        err.status = 409;
        throw err;
      }

      const newItem: CartItem = {
        id: "guest_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
        variantId: productVariantId,
        productId: itemData?.productId,
        title: itemData?.title || "Выкройка",
        slug: itemData?.slug,
        coverImage: itemData?.coverImage,
        sku: itemData?.sku,
        size: itemData?.size,
        height: itemData?.height,
        format: itemData?.format,
        price: itemData?.price ?? itemData?.priceKgs ?? 0,
        priceKgs: itemData?.price ?? itemData?.priceKgs ?? 0,
        originalPrice: itemData?.originalPrice,
        isDiscountActive: itemData?.isDiscountActive,
        isBundle: itemData?.isBundle,
        currency: "KGS",
        isAvailable: true,
        createdAt: new Date().toISOString(),
      };

      const updated = [...currentItems, newItem];
      saveGuestCartToStorage(updated);
      setCart(buildGuestCart(updated));
      return;
    }

    // Authenticated user: Add to Backend
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
    if (!token) {
      // Guest: Remove from localStorage
      const currentItems = getGuestCartFromStorage();
      const updated = currentItems.filter(
        (it) => it.id !== itemId && it.variantId !== itemId
      );
      saveGuestCartToStorage(updated);
      setCart(buildGuestCart(updated));
      return;
    }

    // Authenticated user
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
    if (!token) {
      // Guest: replace variantId in guest cart
      const currentItems = getGuestCartFromStorage();
      const updated = currentItems.map((it) =>
        it.id === itemId ? { ...it, variantId: productVariantId } : it
      );
      saveGuestCartToStorage(updated);
      setCart(buildGuestCart(updated));
      return;
    }

    // Authenticated user
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
    if (!token) {
      // Guest: clear localStorage
      saveGuestCartToStorage([]);
      setCart(buildGuestCart([]));
      return;
    }

    // Authenticated user
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
        refreshCart: fetchServerCart,
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
