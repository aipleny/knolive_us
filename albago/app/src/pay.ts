import type { PayType } from './api';
import { money, type T } from './i18n';

/** "시급 11,000원" or "월급 2,156,880원 · 통상시급 10,320원" */
export function rateText(t: T, payType?: PayType, hourly?: number, monthly?: number, ordinary?: number): string {
  if (payType === 'monthly') {
    const base = t('monthlyRate', { n: money(monthly ?? 0, t) });
    return ordinary ? `${base} · ${t('ordinaryRate', { n: money(ordinary, t) })}` : base;
  }
  return hourly != null ? t('hourlyRate', { n: money(hourly, t) }) : '';
}
