'use client';

import { useParams } from 'next/navigation';
import { useAppStore } from '@/store/app-store';

export function useCurrentLocale(): { locale: 'ar' | 'en'; isAr: boolean } {
  const params = useParams();
  const storeLocale = useAppStore((s) => s.locale);
  const paramLocale = (params?.locale as string | undefined)?.toLowerCase();

  const locale: 'ar' | 'en' =
    paramLocale === 'ar' || paramLocale === 'en'
      ? paramLocale
      : storeLocale === 'ar'
      ? 'ar'
      : 'en';

  return { locale, isAr: locale === 'ar' };
}
