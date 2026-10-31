import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, queryString } from '../../lib/api';
import type { Data, Page, Payment, PaymentInput, PaymentQuery } from '../../types/api';

export const paymentKeys = { all: ['payments'] as const, list: (query: PaymentQuery) => ['payments', 'list', query] as const };

export const fetchPayments = (query: PaymentQuery) => api<Page<Payment>>(`/payments${queryString(query)}`);
export const createPayment = (input: PaymentInput) => api<Data<Payment>>('/payments', { method: 'POST', body: JSON.stringify(input) });

export const usePayments = (query: PaymentQuery) => useQuery({ queryKey: paymentKeys.list(query), queryFn: () => fetchPayments(query), placeholderData: previous => previous });

/** Recording a payment changes the payment list and the invoice (status, paid, outstanding), so both caches are refreshed. */
export function useCreatePayment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createPayment,
    onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: ['payments'] }), client.invalidateQueries({ queryKey: ['invoices'] })]),
  });
}
