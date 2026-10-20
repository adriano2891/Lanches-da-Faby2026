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

/**
 * Get stored or default local menu data
 */
export function getLocalMenuData(): { config: StoreConfig; products: Product[]; additionals: Additional[] } {
  try {
    const raw = localStorage.getItem(LOCAL_MENU_DATA_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.config && Array.isArray(parsed.products) && Array.isArray(parsed.additionals)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Could not read local menu cache:', e);
  }

  return {
    config: DEFAULT_CONFIG,
    products: DEFAULT_PRODUCTS,
    additionals: DEFAULT_ADDITIONALS,
  };
}

/**
 * Save updated menu data to localStorage
 */
export function saveLocalMenuData(data: {
  config?: StoreConfig;
  products?: Product[];
  additionals?: Additional[];
}) {
  try {
    const current = getLocalMenuData();
    const updated = {
      config: data.config || current.config,
      products: data.products || current.products,
      additionals: data.additionals || current.additionals,
    };
    localStorage.setItem(LOCAL_MENU_DATA_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.warn('Could not save local menu cache:', e);
    return getLocalMenuData();
  }
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
