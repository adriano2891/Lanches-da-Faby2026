import type { StoreConfig, Product, Additional, StoreStatus } from '../types.ts';
import { DEFAULT_CONFIG, DEFAULT_PRODUCTS, DEFAULT_ADDITIONALS } from '../data/defaultMenuData.ts';
import { computeStoreStatus } from './statusHelper.ts';

const LOCAL_MENU_DATA_KEY = 'faby_menu_data_v1';
const LOCAL_ADMIN_CREDS_KEY = 'faby_admin_creds_v1';

export interface MenuDataResponse {
  config: StoreConfig;
  products: Product[];
  additionals: Additional[];
  storeStatus: StoreStatus;
}

// In-memory cache to guarantee instant synchronization across views and fallback if localStorage has quota issues
let inMemoryCache: { config: StoreConfig; products: Product[]; additionals: Additional[] } | null = null;

/**
 * Get stored or default local menu data, ensuring all default drinks and items exist
 */
export function getLocalMenuData(): { config: StoreConfig; products: Product[]; additionals: Additional[] } {
  if (inMemoryCache) {
    return inMemoryCache;
  }

  try {
    const raw = localStorage.getItem(LOCAL_MENU_DATA_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.config && Array.isArray(parsed.products) && Array.isArray(parsed.additionals)) {
        // Guarantee that all products from DEFAULT_PRODUCTS (especially drinks/bebidas) are included
        const productMap = new Map<string, Product>();
        DEFAULT_PRODUCTS.forEach((dp) => productMap.set(dp.id, dp));
        parsed.products.forEach((p: Product) => {
          if (p && p.id) {
            const existing = productMap.get(p.id);
            productMap.set(p.id, { ...(existing || {}), ...p });
          }
        });

        const mergedProducts = Array.from(productMap.values()).sort(
          (a, b) => (a.order || 99) - (b.order || 99)
        );

        const result = {
          config: { ...DEFAULT_CONFIG, ...parsed.config },
          products: mergedProducts,
          additionals: parsed.additionals.length > 0 ? parsed.additionals : DEFAULT_ADDITIONALS,
        };
        inMemoryCache = result;
        return result;
      }
    }
  } catch (e) {
    console.warn('Could not read local menu cache:', e);
  }

  const defaultResult = {
    config: DEFAULT_CONFIG,
    products: DEFAULT_PRODUCTS,
    additionals: DEFAULT_ADDITIONALS,
  };
  inMemoryCache = defaultResult;
  return defaultResult;
}

/**
 * Save updated menu data to localStorage and in-memory cache
 */
export function saveLocalMenuData(data: {
  config?: StoreConfig;
  products?: Product[];
  additionals?: Additional[];
}) {
  const current = getLocalMenuData();
  const updated = {
    config: data.config || current.config,
    products: data.products || current.products,
    additionals: data.additionals || current.additionals,
  };

  inMemoryCache = updated;

  try {
    localStorage.setItem(LOCAL_MENU_DATA_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('LocalStorage quota or write warning (persisting in memory):', e);
  }

  return updated;
}

/**
 * Update a specific product directly in local cache
 */
export function updateLocalProduct(id: string, updates: Partial<Product>): Product[] {
  const current = getLocalMenuData();
  const index = current.products.findIndex((p) => p.id === id);
  let updatedProducts: Product[];

  if (index > -1) {
    updatedProducts = current.products.map((p) =>
      p.id === id ? ({ ...p, ...updates } as Product) : p
    );
  } else {
    const def = DEFAULT_PRODUCTS.find((p) => p.id === id);
    const newProd = ({ ...(def || {}), id, ...updates } as Product);
    updatedProducts = [...current.products, newProd];
  }

  saveLocalMenuData({ products: updatedProducts });
  return updatedProducts;
}

/**
 * Fetch menu data from server with automatic seamless offline/Netlify fallback
 */
export async function fetchMenuDataWithFallback(): Promise<MenuDataResponse> {
  try {
    const res = await fetch('/api/menu', {
      headers: { Accept: 'application/json' },
    });

    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data && data.config && data.products) {
        // Cache to localStorage
        saveLocalMenuData({
          config: data.config,
          products: data.products,
          additionals: data.additionals || [],
        });
        return {
          config: data.config,
          products: data.products,
          additionals: data.additionals || [],
          storeStatus: data.storeStatus || computeStoreStatus(data.config),
        };
      }
    }
  } catch {
    // Backend offline or running in static host (Netlify, Vercel static, GitHub Pages)
  }

  // Seamless fallback to localStorage or built-in default menu data
  const local = getLocalMenuData();
  const storeStatus = computeStoreStatus(local.config);

  return {
    config: local.config,
    products: local.products,
    additionals: local.additionals,
    storeStatus,
  };
}

/**
 * Local Admin Authentication & Credential Management for Static Hosting
 */
export function getLocalAdminCreds(): { email: string; passwordHash: string; recoveryKey: string } {
  try {
    const raw = localStorage.getItem(LOCAL_ADMIN_CREDS_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // ignore
  }

  return {
    email: 'admin@fabylanches.com',
    passwordHash: 'admin', // Default initial password
    recoveryKey: 'FABY-ADMIN-RECOVERY',
  };
}

export function saveLocalAdminCreds(creds: { email?: string; passwordHash?: string; recoveryKey?: string }) {
  try {
    const current = getLocalAdminCreds();
    const updated = { ...current, ...creds };
    localStorage.setItem(LOCAL_ADMIN_CREDS_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Could not persist admin credentials:', e);
  }
}
