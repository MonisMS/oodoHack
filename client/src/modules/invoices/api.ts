import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, queryString } from '../../lib/api';
import type { BulkResult, Data, Id, Invoice, InvoiceQuery, Page } from '../../types/api';

export const invoiceKeys = {
  all: ['invoices'] as const,
  list: (query: InvoiceQuery) => ['invoices', 'list', query] as const,
  detail: (id: Id) => ['invoices', 'detail', id] as const,
};

export type InvoiceAction = 'confirm' | 'cancel' | 'send' | 'remind' | 'reopen';
export type BulkAction = 'confirm' | 'send' | 'remind';

export const fetchInvoices = (query: InvoiceQuery) => api<Page<Invoice>>(`/invoices${queryString(query)}`);
export const fetchInvoice = (id: Id) => api<Data<Invoice>>(`/invoices/${id}`);
export const runInvoiceAction = (id: Id, action: InvoiceAction) => api<Data<Invoice>>(`/invoices/${id}/${action}`, { method: 'POST' });
export const runBulkAction = (action: BulkAction, ids: Id[]) => api<Data<BulkResult>>(`/invoices/${action}`, { method: 'POST', body: JSON.stringify({ ids }) });

export const useInvoices = (query: InvoiceQuery) => useQuery({ queryKey: invoiceKeys.list(query), queryFn: () => fetchInvoices(query), placeholderData: previous => previous });
export const useInvoice = (id: Id) => useQuery({ queryKey: invoiceKeys.detail(id), queryFn: () => fetchInvoice(id), select: response => response.data });

/** Every invoice change can alter lists, the detail and (via payments) the payment list, so all three are refreshed. */
function useRefreshAfterChange() {
  const client = useQueryClient();
  return () => Promise.all([client.invalidateQueries({ queryKey: ['invoices'] }), client.invalidateQueries({ queryKey: ['payments'] })]);
}

export function useInvoiceAction(id: Id) {
  const refresh = useRefreshAfterChange();
  return useMutation({ mutationFn: (action: InvoiceAction) => runInvoiceAction(id, action), onSuccess: refresh });
}

export function useBulkAction() {
  const refresh = useRefreshAfterChange();
  return useMutation({ mutationFn: ({ action, ids }: { action: BulkAction; ids: Id[] }) => runBulkAction(action, ids).then(response => response.data), onSettled: refresh });
}
