'use client';

import { useState, useMemo } from 'react';
import { Star, MoreHorizontal } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { formatMoney } from '@/lib/utils';

export interface Product {
  id: string;
  medicine_id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  batch: string;
  lot_number: string;
  expiry: string;
  requires_prescription: boolean;
  favorite: boolean;
}

interface ProductCatalogProps {
  products: Product[];
  categories: string[];
  onProductClick: (product: Product) => void;
  isLoading?: boolean;
}

export default function ProductCatalog({ products, categories, onProductClick, isLoading }: ProductCatalogProps) {
  const [activeCategory, setActiveCategory] = useState('All');
  const { currency } = useAppStore();

  const filteredProducts = useMemo(() => {
    if (activeCategory === 'All') return products;
    return products.filter((p) => p.category === activeCategory);
  }, [products, activeCategory]);

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col bg-gray-100 dark:bg-[#0B1121] overflow-hidden">
        {/* Skeleton category bar */}
        <div className="flex overflow-x-auto bg-white dark:bg-[#111A2C] border-b border-gray-200 dark:border-gray-800 p-2 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse" />
          ))}
        </div>
        {/* Skeleton product grid */}
        <div className="flex-1 overflow-y-auto p-2 md:p-4">
          <div className="grid grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2 md:gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-[#1A2438] rounded-xl p-4 min-h-[110px] flex flex-col justify-between animate-pulse border border-gray-200 dark:border-transparent">
                <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-1/2 mb-4" />
                <div className="flex justify-between">
                  <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-1/3" />
                  <div className="h-3 w-3 bg-gray-200 dark:bg-gray-600 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-100 dark:bg-[#0B1121] overflow-hidden">
      {/* Category Bar */}
      <div className="flex overflow-x-auto bg-white dark:bg-[#111A2C] border-b border-gray-200 dark:border-gray-800 p-0 m-0 scroll-smooth no-scrollbar">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`
              px-6 py-3 text-sm whitespace-nowrap transition-colors border-none outline-none cursor-pointer border-b-2
              ${
                activeCategory === cat
                  ? 'bg-pos-500 text-white dark:bg-blue-500/10 dark:text-blue-400 font-semibold border-pos-500 dark:border-blue-500'
                  : 'bg-transparent text-gray-600 dark:text-gray-400 font-medium hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 border-transparent'
              }
            `}
          >
            {cat}
          </button>
        ))}
        {categories.length > 5 && (
          <button className="px-4 py-3 border-l border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-700 dark:hover:text-gray-200">
            <MoreHorizontal size={18} />
          </button>
        )}
      </div>

      {/* Product Grid */}
      <div className="flex-1 overflow-y-auto p-2 md:p-4">
        <div className="grid grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2 md:gap-4">
          {filteredProducts.map((product) => (
            <div
              key={product.id}
              onClick={() => product.stock > 0 ? onProductClick(product) : null}
              className={`bg-white dark:bg-[#1A2438] hover:bg-gray-50 dark:hover:bg-[#23304a] transition-all duration-200 rounded-xl p-4 min-h-[110px] flex flex-col justify-between border border-gray-200 dark:border-transparent hover:border-pos-500/50 dark:hover:border-blue-500/50 shadow-sm ${
                product.stock === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2 pr-2 leading-snug">
                  {product.name}
                </span>
                {product.requires_prescription && (
                  <span className="text-[10px] font-bold text-pos-600 bg-pos-100 dark:text-blue-400 dark:bg-blue-500/10 px-1.5 py-0.5 rounded flex-shrink-0">
                    Rx
                  </span>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between w-full">
                <span className="text-sm font-semibold text-pos-600 dark:text-blue-400">
                  {formatMoney(product.price, currency)}
                </span>
                {product.stock === 0 ? (
                  <span className="text-[10px] font-bold text-red-500 bg-red-100 dark:bg-red-500/20 px-2 py-0.5 rounded">
                    OUT OF STOCK
                  </span>
                ) : product.stock <= 10 ? (
                  <span className="text-[10px] font-medium text-orange-500">
                    Only {product.stock} left
                  </span>
                ) : (
                  <span className="text-[10px] text-foreground/40 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                    {product.stock}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
