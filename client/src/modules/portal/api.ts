import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, queryString } from '../../lib/api';
import type { CancellationInput, Data, Page, PortalInvoice, PortalInvoiceQuery, PortalSubscription, PortalSubscriptionQuery, PortalSummary } from '../../types/api';

// The server derives the customer from the session; no customer id is ever sent from here.
export const portalKeys = {
  all: ['portal'] as const,
  summary: ['portal', 'summary'] as const,
  subscriptions: ['portal', 'subscriptions'] as const,
  subscriptionList: (query: object) => ['portal', 'subscriptions', 'list', query] as const,
  subscription: (id: string) => ['portal', 'subscriptions', 'detail', id] as const,
  invoices: ['portal', 'invoices'] as const,
  invoiceList: (query: object) => ['portal', 'invoices', 'list', query] as const,
  invoice: (id: string) => ['portal', 'invoices', 'detail', id] as const,
};

export const usePortalSummary = () => useQuery({ queryKey: portalKeys.summary, queryFn: () => api<Data<PortalSummary>>('/portal/summary').then(r => r.data) });

export const usePortalSubscriptions = (query: PortalSubscriptionQuery) => useQuery({
  queryKey: portalKeys.subscriptionList(query), queryFn: () => api<Page<PortalSubscription>>(`/portal/subscriptions${queryString(query)}`), placeholderData: previous => previous,
});

export const usePortalSubscription = (id: string) => useQuery({ queryKey: portalKeys.subscription(id), queryFn: () => api<Data<PortalSubscription>>(`/portal/subscriptions/${id}`).then(r => r.data) });

export const usePortalInvoices = (query: PortalInvoiceQuery) => useQuery({
  queryKey: portalKeys.invoiceList(query), queryFn: () => api<Page<PortalInvoice>>(`/portal/invoices${queryString(query)}`), placeholderData: previous => previous,
});

export const usePortalInvoice = (id: string) => useQuery({ queryKey: portalKeys.invoice(id), queryFn: () => api<Data<PortalInvoice>>(`/portal/invoices/${id}`).then(r => r.data) });

/** Schedule (`cancel-at-period-end`) or withdraw (`keep`) an end of service. Refreshes every portal query afterwards. */
export function useCancellationChange(id: string, action: 'cancel-at-period-end' | 'keep') {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CancellationInput) => api<unknown>(`/portal/subscriptions/${id}/${action}`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => client.invalidateQueries({ queryKey: portalKeys.all }),
  });
}
