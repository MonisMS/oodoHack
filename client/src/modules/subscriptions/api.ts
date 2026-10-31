import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, queryString } from '../../lib/api';
import type { CancellationInput, ChangeLinesInput, Data, Page, QuotationTemplate, Subscription, SubscriptionInput, SubscriptionQuery, TransitionInput } from '../../types/api';

export { api, queryString };

export const subscriptionKeys = {
  all: ['subscriptions'] as const,
  list: (query: object) => ['subscriptions', 'list', query] as const,
  detail: (id: string) => ['subscriptions', 'detail', id] as const,
};

export const useSubscriptions = (query: SubscriptionQuery) => useQuery({
  queryKey: subscriptionKeys.list(query),
  queryFn: () => api<Page<Subscription>>(`/subscriptions${queryString(query)}`),
  placeholderData: previous => previous,
});

export const useSubscription = (id: string | undefined) => useQuery({
  queryKey: subscriptionKeys.detail(id ?? ''),
  queryFn: async () => (await api<Data<Subscription>>(`/subscriptions/${id}`)).data,
  enabled: Boolean(id),
});

export const useActiveTemplates = (enabled: boolean) => useQuery({
  queryKey: ['quotation-templates', 'picker'],
  queryFn: () => api<Page<QuotationTemplate>>(`/quotation-templates${queryString({ pageSize: 100, sortBy: 'name', sortOrder: 'asc' })}`),
  enabled,
});

const post = async (path: string, body: object) => (await api<Data<Subscription>>(path, { method: 'POST', body: JSON.stringify(body) })).data;

/** Every mutation refreshes the list and the detail, since both show status and billing flags. */
function useSubscriptionMutation<V, R>(fn: (variables: V) => Promise<R>) {
  const client = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => client.invalidateQueries({ queryKey: subscriptionKeys.all }) });
}

export const useSaveSubscription = (id?: string) => useSubscriptionMutation(async (input: SubscriptionInput) =>
  (await api<Data<Subscription>>(id ? `/subscriptions/${id}` : '/subscriptions', { method: id ? 'PUT' : 'POST', body: JSON.stringify(input) })).data);

export const useDeleteSubscription = (id: string) => useSubscriptionMutation(() => api<void>(`/subscriptions/${id}`, { method: 'DELETE' }));
export const useTransition = (id: string) => useSubscriptionMutation((input: TransitionInput) => post(`/subscriptions/${id}/transition`, input));
export const useScheduleCancellation = (id: string) => useSubscriptionMutation((input: CancellationInput) => post(`/subscriptions/${id}/schedule-cancellation`, input));
export const useUnscheduleCancellation = (id: string) => useSubscriptionMutation((input: CancellationInput) => post(`/subscriptions/${id}/unschedule-cancellation`, input));
export const useChangeLines = (id: string) => useSubscriptionMutation((input: ChangeLinesInput) => post(`/subscriptions/${id}/change-lines`, input));
