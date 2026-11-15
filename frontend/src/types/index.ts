export type DifficultyLevel = "BEGINNER" | "EASY" | "MEDIUM" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
export type FileFormat = "A4" | "PLOTTER_900" | "PLOTTER_600" | "LETTER";
export type OrderStatus = "PENDING" | "PAID" | "CANCELLED" | "REFUNDED";
export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "EXPIRED" | "CANCELLED" | "REFUNDED";

export interface User {
  id: string;
  email: string;
  role: "CUSTOMER" | "ADMIN" | "DESIGNER";
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  createdAt?: string;
}

export interface Category {
  id: string;
  title?: string;
  name?: string;
  slug: string;
  description?: string | null;
  parentId?: string | null;
  children?: Category[];
}

export interface FilterItem {
  id?: string;
  code: string;
  label: string;
  description?: string | null;
}

export interface ProductVariant {
  id: string;
  variantId?: string;
  productId: string;
  sku: string;
  size: string | FilterItem;
  height: string | FilterItem;
  format: FileFormat | FilterItem;
  price?: number;
  priceKgs?: number;
  currency?: string;
  isAvailable?: boolean;
  isActive?: boolean;
  file?: {
    id: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
  };
}

export interface ProductInstruction {
  id: string;
  productId?: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  description?: string;
  uploadedAt?: string;
}

export interface Product {
  id: string;
  title: string;
  slug: string;
  description?: string;
  shortDescription?: string;
  complexity?: DifficultyLevel;
  difficulty?: DifficultyLevel;
  difficultyLevel?: DifficultyLevel;
  basePrice?: number;
  priceFromKgs?: number;
  isActive?: boolean;
  coverImage?: string;
  images?: Array<string | { imageUrl: string; isCover?: boolean }>;
  category?: Category;
  categoryId?: string;
  fabricDetails?: string | null;
  fabricRequirements?: string | null;
  measurementsInfo?: string;
  variants?: ProductVariant[];
  instructions?: ProductInstruction[];
  createdAt?: string;
}

export interface CatalogFilters {
  sizes: Array<FilterItem | string>;
  heights: Array<FilterItem | string>;
  formats: Array<FilterItem | string>;
  difficulties?: string[];
  difficultyLevels?: string[];
}

export interface CartItem {
  id: string;
  variantId: string;
  productId?: string;
  title?: string;
  slug?: string;
  coverImage?: string | null;
  sku?: string;
  size?: FilterItem | string;
  height?: FilterItem | string;
  format?: FilterItem | string;
  price?: number;
  priceKgs?: number;
  currency?: string;
  isAvailable?: boolean;
  createdAt?: string;
  variant?: any;
}

export interface Cart {
  id: string;
  userId?: string;
  currency: string;
  items: CartItem[];
  totalItems?: number;
  itemsCount?: number;
  totalAmount?: number;
  totalAmountKgs?: number;
}

export interface OrderItem {
  id: string;
  orderId?: string;
  variantId?: string;
  productVariantId?: string;
  productTitle?: string;
  variantSku?: string;
  size?: string;
  height?: string;
  format?: string;
  price?: number;
  priceKgs?: number;
  priceAtPurchase?: number;
  productSnapshot?: {
    title?: string;
    size?: string;
    height?: string;
    format?: string;
    sku?: string;
    coverUrl?: string;
  };
  productSlug?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId?: string;
  status: OrderStatus;
  totalAmount?: number;
  totalKgs?: number;
  currency: string;
  customerEmail?: string;
  contactEmail?: string;
  customerPhone?: string | null;
  contactPhone?: string | null;
  customerName?: string | null;
  customerNote?: string | null;
  createdAt: string;
  paidAt?: string | null;
  items: OrderItem[];
  payments?: Array<{
    id: string;
    provider?: string;
    paymentGateway?: string;
    status: PaymentStatus;
    amount?: number;
    amountKgs?: number;
    paymentUrl?: string | null;
    createdAt: string;
  }>;
}

export interface FileVersion {
  id: string;
  fileId?: string;
  versionNumber: number;
  changelog?: string | null;
  createdAt?: string;
  fileSize?: number;
}

export interface PurchaseEntitlement {
  id?: string;
  entitlementId?: string;
  variantId?: string;
  userId?: string;
  orderId?: string;
  orderItemId?: string;
  productId?: string;
  productVariantId?: string;
  status: "ACTIVE" | "REVOKED";
  grantedAt?: string;
  productTitle?: string;
  size?: string;
  height?: string;
  format?: string;
  coverUrl?: string | null;
  instructionId?: string | null;
  currentVersion?: number | null;
  changelog?: string | null;
  downloadCount?: number;
  product?: {
    id: string;
    title: string;
    slug: string;
    coverImage?: string;
    instructions?: ProductInstruction[];
  };
  productVariant?: {
    id: string;
    sku?: string;
    size: string | FilterItem;
    height: string | FilterItem;
    format: FileFormat | FilterItem;
  };
  file?: {
    id?: string;
    fileName?: string;
    fileSize?: number;
    currentVersion?: number;
    versions?: FileVersion[];
  };
}

export interface DownloadUrlResponse {
  downloadUrl: string;
  fileName: string;
  versionNumber: number;
  expiresAt: string;
  expiresInSeconds?: number;
  fileSize?: number;
  remainingDownloads?: number;
}
