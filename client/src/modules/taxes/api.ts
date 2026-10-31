import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, queryString } from '../../lib/api';
import type { Data, ListQuery, Page, Tax, TaxInput } from '../../types/api';

export const taxKeys = { all: ['taxes'] as const, list: (query: object) => ['taxes', 'list', query] as const };

export const fetchTaxes = (query: ListQuery) => api<Page<Tax>>(`/taxes${queryString(query)}`);

export const useTaxes = (query: ListQuery) => useQuery({ queryKey: taxKeys.list(query), queryFn: () => fetchTaxes(query), placeholderData: previous => previous });

export function useSaveTax() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: TaxInput }) => id
      ? api<Data<Tax>>(`/taxes/${id}`, { method: 'PUT', body: JSON.stringify(input) })
      : api<Data<Tax>>('/taxes', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => client.invalidateQueries({ queryKey: taxKeys.all }),
  });
}

export function useDeactivateTax() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/taxes/${id}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: taxKeys.all }),
  });
}
