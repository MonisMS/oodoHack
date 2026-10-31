import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { BillingInput, BillingResult, Data } from '../../types/api';

export const runBilling = (input: BillingInput) => api<Data<BillingResult>>('/billing/run', { method: 'POST', body: JSON.stringify(input) });

/** A billing run creates draft invoices and may close subscriptions, so invoice and subscription caches are refreshed. */
export function useRunBilling() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: BillingInput) => runBilling(input).then(response => response.data),
    onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: ['invoices'] }), client.invalidateQueries({ queryKey: ['subscriptions'] })]),
  });
}
