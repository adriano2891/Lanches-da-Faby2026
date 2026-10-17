import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Product, Additional, StoreConfig, StoreStatus, CartItem } from './types.ts';
import { Header } from './components/Header.tsx';
import { StoreStatusBanner } from './components/StoreStatusBanner.tsx';
import { SearchBar } from './components/SearchBar.tsx';
import { CategoryNav, type CategoryKey } from './components/CategoryNav.tsx';
import { ExperimenteSection } from './components/ExperimenteSection.tsx';
import { ProductCard } from './components/ProductCard.tsx';
import { ProductModal } from './components/ProductModal.tsx';
import { DrinkInquiryModal } from './components/DrinkInquiryModal.tsx';
import { PhotoZoomModal } from './components/PhotoZoomModal.tsx';
import { CartBottomBar } from './components/CartBottomBar.tsx';
import { CartDrawer } from './components/CartDrawer.tsx';
import { StoreInfoFooter } from './components/StoreInfoFooter.tsx';
import { AdminPanel } from './components/admin/AdminPanel.tsx';
import { SearchX } from 'lucide-react';

import { fetchMenuDataWithFallback } from './utils/menuStorage.ts';

const LOCAL_STORAGE_CART_KEY = 'faby_cart_items_v1';

export default function App() {
  // Application Data from Server
  const [config, setConfig] = useState<StoreConfig | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [additionals, setAdditionals] = useState<Additional[]>([]);
  const [storeStatus, setStoreStatus] = useState<StoreStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  // Search & Category Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>('todos');

  // Shopping Cart state
  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_CART_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Modal States
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [customizingProduct, setCustomizingProduct] = useState<Product | null>(null);
  const [editingCartItem, setEditingCartItem] = useState<CartItem | null>(null);
  const [inquiryDrink, setInquiryDrink] = useState<Product | null>(null);
  const [zoomedPhotoProduct, setZoomedPhotoProduct] = useState<Product | null>(null);

  // Admin Login state
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(() =>
    Boolean(localStorage.getItem('faby_admin_token'))
  );

  // Sync cart to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_CART_KEY, JSON.stringify(cartItems));
    } catch (e) {
      console.warn('Could not persist cart to localStorage:', e);
    }
  }, [cartItems]);

  // Fetch full menu from server with automatic Netlify/offline fallback
  const fetchMenuData = useCallback(async () => {
    try {
      const data = await fetchMenuDataWithFallback();
      setConfig(data.config);
      setProducts(data.products || []);
      setAdditionals(data.additionals || []);
      setStoreStatus(data.storeStatus);
      setDataError(null);
    } catch (err: any) {
      console.error('Error fetching menu:', err);
      setDataError(err.message || 'Erro ao carregar o cardápio');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMenuData();
    // Poll store status every 60 seconds
    const interval = setInterval(fetchMenuData, 60000);
    return () => clearInterval(interval);
  }, [fetchMenuData]);

  // Total cart calculations
  const totalCartCount = useMemo(() => {
    return cartItems.reduce((acc, item) => acc + item.quantity, 0);
  }, [cartItems]);

  const subtotalCents = useMemo(() => {
    return cartItems.reduce((acc, item) => acc + item.totalPrice, 0);
  }, [cartItems]);

  // Product counts per category (supports all existing and upcoming categories dynamically)
  const productCounts = useMemo(() => {
    const counts: Record<string, number> = {
      todos: products.length,
      lanches: 0,
      cuscuz: 0,
      sopas: 0,
      bebidas: 0,
    };
    products.forEach((p) => {
      counts[p.categoryId] = (counts[p.categoryId] || 0) + 1;
    });
    return counts;
  }, [products]);

  // Filtered products list with active accent-insensitive and multi-field search
  const filteredProducts = useMemo(() => {
    const normalize = (text?: string) =>
      text
        ? text
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim()
        : '';

    const hasSearch = searchTerm.trim() !== '';
    const query = normalize(searchTerm.trim());

    return products.filter((product) => {
      // 1. Search term filter (nome, descrição, ingredientes, sabor, categoria)
      if (hasSearch) {
        const matchesName = normalize(product.name).includes(query);
        const matchesDescription = normalize(product.description).includes(query);
        const matchesIngredients = product.ingredients?.some((ing) =>
          normalize(ing).includes(query)
        );
        const matchesFlavor = normalize(product.drinkDetails?.flavor).includes(query);
        const matchesCategory = normalize(product.categoryId).includes(query);

        if (!matchesName && !matchesDescription && !matchesIngredients && !matchesFlavor && !matchesCategory) {
          return false;
        }
      }

      // 2. Category filter
      if (selectedCategory !== 'todos' && product.categoryId !== selectedCategory) {
        return false;
      }

      return true;
    });
  }, [products, selectedCategory, searchTerm]);

  // Add / Save item to cart
  const handleSaveToCart = (item: CartItem) => {
    setCartItems((prev) => {
      const existingIndex = prev.findIndex((i) => i.id === item.id);
      if (existingIndex > -1) {
        const copy = [...prev];
        copy[existingIndex] = item;
        return copy;
      }
      return [...prev, item];
    });
    setCustomizingProduct(null);
    setEditingCartItem(null);
  };

  // Update item quantity in cart
  const handleUpdateQuantity = (itemId: string, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveItem(itemId);
      return;
    }
    setCartItems((prev) =>
      prev.map((i) => {
        if (i.id === itemId) {
          const totalPrice = i.unitPriceWithAdditionals * newQty;
          return { ...i, quantity: newQty, totalPrice };
        }
        return i;
      })
    );
  };

  // Remove item from cart
  const handleRemoveItem = (itemId: string) => {
    setCartItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  // Clear cart
  const handleClearCart = () => {
    setCartItems([]);
  };

  // Open edit modal for cart item
  const handleEditCartItem = (item: CartItem) => {
    const originalProd = products.find((p) => p.id === item.productId);
    if (originalProd) {
      setEditingCartItem(item);
      setCustomizingProduct(originalProd);
      setIsCartOpen(false);
    }
  };

  // Add drink directly from upsell
  const handleAddDrinkDirect = (drink: Product) => {
    const size = drink.drinkDetails?.sizes?.find((s) => s.available && s.price > 0);
    const price = size ? size.price : drink.price;
    const newItem: CartItem = {
      id: `cart-drink-${Date.now()}`,
      productId: drink.id,
      productName: drink.name,
      basePrice: price,
      quantity: 1,
      removedIngredients: [],
      additionals: [],
      notes: '',
      drinkOption: size
        ? { sizeId: size.id, sizeName: size.name, flavor: drink.drinkDetails?.flavor }
        : undefined,
      unitPriceWithAdditionals: price,
      totalPrice: price,
    };
    setCartItems((prev) => [...prev, newItem]);
  };

  if (isLoading && !config) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-900 rounded-full animate-spin mb-4" />
        <p className="font-bold text-stone-700 text-sm">Carregando cardápio Faby Lanches...</p>
      </div>
    );
  }

  if (dataError && !config) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4 text-center">
        <p className="font-bold text-rose-700 mb-2">Erro ao carregar o cardápio</p>
        <p className="text-stone-600 text-sm mb-4">{dataError}</p>
        <button
          onClick={fetchMenuData}
          className="px-4 py-2 bg-purple-900 text-amber-300 font-bold rounded-xl text-sm"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 flex flex-col font-sans selection:bg-purple-200 selection:text-purple-950">
      {/* 1. CABEÇALHO COM LOGO E CARRINHO */}
      <Header
        customLogoUrl={config?.logoUrl}
        totalCartCount={totalCartCount}
        subtotalCents={subtotalCents}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenAdmin={() => setIsAdminOpen(true)}
      />

      {/* 2. STATUS DE FUNCIONAMENTO E PRAZO ESTIMADO */}
      {config && storeStatus && (
        <StoreStatusBanner config={config} status={storeStatus} />
      )}

      {/* 3. CAMPO DE BUSCA */}
      <SearchBar
        searchTerm={searchTerm}
        onSearchChange={(val) => {
          setSearchTerm(val);
          if (val.trim() !== '' && selectedCategory !== 'todos') {
            setSelectedCategory('todos');
          }
        }}
        resultCount={filteredProducts.length}
        totalProductsCount={products.length}
      />

      {/* 4. CATEGORIAS */}
      <CategoryNav
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        productCounts={productCounts}
      />

      {/* 5. SEÇÃO "EXPERIMENTE" (apenas quando não há busca ativa e categoria for 'todos' ou 'lanches') */}
      {!searchTerm && (selectedCategory === 'todos' || selectedCategory === 'lanches') && config && (
        <ExperimenteSection
          products={products}
          experimentProductIds={config.experimentProductIds || []}
          onSelectProduct={(p) => {
            setEditingCartItem(null);
            setCustomizingProduct(p);
          }}
          onZoomPhoto={setZoomedPhotoProduct}
          onInquireDrink={setInquiryDrink}
        />
      )}

      {/* 6. PRODUTOS */}
      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4 w-full flex-1">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-stone-200">
          <h2 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2">
            <span>
              {selectedCategory === 'todos'
                ? 'Todos os Produtos'
                : selectedCategory === 'lanches'
                ? 'Lanches Artesanais'
                : selectedCategory === 'cuscuz'
                ? 'Cuscuz Tradicional'
                : selectedCategory === 'sopas'
                ? 'Sopas e Canjas'
                : selectedCategory === 'bebidas'
                ? 'Sucos e Vitaminas'
                : selectedCategory
                    .split(/[-_ ]+/)
                    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(' ')}
            </span>
            <span className="text-sm font-semibold text-stone-600 bg-stone-200/70 px-2 py-0.5 rounded-full">
              {filteredProducts.length}
            </span>
          </h2>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="py-16 text-center space-y-3 bg-white rounded-2xl border border-stone-200 p-8 shadow-xs">
            <div className="w-16 h-16 mx-auto rounded-full bg-purple-50 flex items-center justify-center text-purple-600">
              <SearchX className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-stone-800">
              Nenhum produto encontrado
            </h3>
            <p className="text-sm text-stone-500 max-w-sm mx-auto leading-relaxed">
              Não encontramos nenhum item correspondente a "{searchTerm}". Tente buscar por outro nome ou ingrediente.
            </p>
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedCategory('todos');
              }}
              className="mt-2 px-5 py-2 rounded-xl bg-purple-900 text-amber-300 font-bold text-xs hover:bg-purple-800 transition"
            >
              Limpar busca e ver cardápio completo
            </button>
          </div>
        ) : (
          /* Cards Grid: 1 column on mobile, 2 on tablet, up to 3 on desktop */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-6">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onSelect={(p) => {
                  setEditingCartItem(null);
                  setCustomizingProduct(p);
                }}
                onZoomPhoto={setZoomedPhotoProduct}
                onInquireDrink={setInquiryDrink}
                isFeatured={false}
              />
            ))}
          </div>
        )}
      </main>

      {/* 7. INFORMAÇÕES DA LOJA */}
      {config && storeStatus && (
        <StoreInfoFooter
          config={config}
          status={storeStatus}
          onOpenAdmin={() => setIsAdminOpen(true)}
          hasCartItems={totalCartCount > 0}
        />
      )}

      {/* BARRA FIXA INFERIOR NO CELULAR (COM CLEARANCE) */}
      <CartBottomBar
        totalCount={totalCartCount}
        subtotalCents={subtotalCents}
        onOpenCart={() => setIsCartOpen(true)}
      />

      {/* MODAL DE PERSONALIZAÇÃO DO PRODUTO */}
      {customizingProduct && (
        <ProductModal
          product={customizingProduct}
          additionals={additionals}
          existingItem={editingCartItem}
          onClose={() => {
            setCustomizingProduct(null);
            setEditingCartItem(null);
          }}
          onSaveToCart={handleSaveToCart}
        />
      )}

      {/* MODAL DE CONSULTA DE BEBIDAS SEM PREÇO */}
      {inquiryDrink && config && (
        <DrinkInquiryModal
          product={inquiryDrink}
          whatsappNumber={config.whatsappNumber}
          onClose={() => setInquiryDrink(null)}
        />
      )}

      {/* MODAL DE FOTO AMPLIADA */}
      {zoomedPhotoProduct && (
        <PhotoZoomModal
          product={zoomedPhotoProduct}
          onClose={() => setZoomedPhotoProduct(null)}
          onAdd={(p) => {
            setEditingCartItem(null);
            setCustomizingProduct(p);
          }}
        />
      )}

      {/* DRAWER DO CARRINHO & CHECKOUT */}
      {config && storeStatus && (
        <CartDrawer
          isOpen={isCartOpen}
          onClose={() => setIsCartOpen(false)}
          items={cartItems}
          config={config}
          status={storeStatus}
          allProducts={products}
          additionals={additionals}
          onUpdateQuantity={handleUpdateQuantity}
          onRemoveItem={handleRemoveItem}
          onEditItem={handleEditCartItem}
          onAddDrinkDirect={handleAddDrinkDirect}
          onClearCart={handleClearCart}
          onApplyServerValidation={(updated) => setCartItems(updated)}
        />
      )}

      {/* PAINEL ADMINISTRATIVO PROTEGIDO */}
      {config && (
        <AdminPanel
          isOpen={isAdminOpen}
          onClose={() => setIsAdminOpen(false)}
          config={config}
          products={products}
          additionals={additionals}
          onRefreshData={fetchMenuData}
          onAuthChange={(loggedIn) => {
            setIsAdminLoggedIn(loggedIn);
          }}
        />
      )}
    </div>
  );
}
