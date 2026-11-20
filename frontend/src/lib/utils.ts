import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(amount: number, currency: string = 'SDG'): string {
  return new Intl.NumberFormat('en-SA', {
    style: 'currency',
    currency,
  }).format(amount);
}

export function formatDate(date: string | Date, locale: string = 'en'): string {
  if (!date) return '-';
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SD' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(date));
  } catch {
    return String(date);
  }
}

export function formatDateTime(date: string | Date, locale: string = 'en'): string {
  if (!date) return '-';
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SD' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  } catch {
    return String(date);
  }
}

export function formatNumber(num: number, locale: string = 'en'): string {
  return new Intl.NumberFormat(locale).format(num);
}

export function formatCompactNumber(num: number, locale: string = 'en'): string {
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(num);
}
