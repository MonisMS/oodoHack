import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, queryString } from '../../lib/api';
import type { Data, FromTemplateInput, ListQuery, Page, QuotationTemplate, Subscription, TemplateInput } from '../../types/api';

export const templateKeys = {
  all: ['quotation-templates'] as const,
  list: (query: object) => ['quotation-templates', 'list', query] as const,
  detail: (id: string) => ['quotation-templates', 'detail', id] as const,
};

export const useTemplates = (query: ListQuery) => useQuery({
  queryKey: templateKeys.list(query),
  queryFn: () => api<Page<QuotationTemplate>>(`/quotation-templates${queryString(query)}`),
  placeholderData: previous => previous,
});

export const useTemplate = (id: string | undefined) => useQuery({
  queryKey: templateKeys.detail(id ?? ''),
  queryFn: async () => (await api<Data<QuotationTemplate>>(`/quotation-templates/${id}`)).data,
  enabled: Boolean(id),
});

export function useSaveTemplate(id?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: TemplateInput) => (await api<Data<QuotationTemplate>>(id ? `/quotation-templates/${id}` : '/quotation-templates', { method: id ? 'PUT' : 'POST', body: JSON.stringify(input) })).data,
    onSuccess: () => client.invalidateQueries({ queryKey: templateKeys.all }),
  });
}

export function useDeactivateTemplate(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>(`/quotation-templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: templateKeys.all }),
  });
}

export function useCreateFromTemplate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: FromTemplateInput) => (await api<Data<Subscription>>('/subscriptions/from-template', { method: 'POST', body: JSON.stringify(input) })).data,
    onSuccess: () => client.invalidateQueries({ queryKey: ['subscriptions'] }),
  });
}
