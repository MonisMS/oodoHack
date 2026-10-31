import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, queryString } from '../../lib/api';
import type { LineInput, Page, Plan, Product, User } from '../../types/api';
import { ErrorNotice } from './errors';
import { money } from './format';
import { Button, Field, inputClass, Spinner } from './ui';

// Data pickers shared by the template, subscription and invoice screens. They read the catalog through the public API
// (products and plans are owned by the catalog workstream) and show an honest message while an endpoint is unavailable.
const useList = <T,>(key: string, path: string) => useQuery({ queryKey: [key], queryFn: () => api<Page<T>>(`${path}${queryString({ pageSize: 100, sortBy: 'name', sortOrder: 'asc' })}`), staleTime: 60_000 });
export const useProducts = () => useList<Product>('catalog-products', '/products');
export const usePlans = () => useList<Plan>('catalog-plans', '/plans');
export const useCustomers = () => useList<User>('customers', '/users/customers');

type FieldProps = { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string };

export function CustomerSelect({ value, onChange, error }: { value: string; onChange: (id: string) => void; error?: string[] }) {
  const { data, isLoading, error: failure } = useCustomers();
  return <Field label="Customer" error={error}>{(f: FieldProps) => failure ? <ErrorNotice error={failure} /> : <select {...f} className={inputClass} value={value} onChange={e => onChange(e.target.value)} disabled={isLoading}><option value="">{isLoading ? 'Loading customers…' : 'Select a customer'}</option>{data?.data.filter(c => c.isActive).map(c => <option key={c.id} value={c.id}>{c.name} ({c.email})</option>)}</select>}</Field>;
}

export function PlanSelect({ value, onChange, error, label = 'Plan' }: { value: string; onChange: (id: string, plan?: Plan) => void; error?: string[]; label?: string }) {
  const { data, isLoading, error: failure } = usePlans();
  return <Field label={label} error={error}>{(f: FieldProps) => failure ? <ErrorNotice error={failure} /> : <select {...f} className={inputClass} value={value} onChange={e => onChange(e.target.value, data?.data.find(p => p.id === e.target.value))} disabled={isLoading}><option value="">{isLoading ? 'Loading plans…' : 'Select a plan'}</option>{data?.data.filter(p => p.isActive).map(p => <option key={p.id} value={p.id}>{p.name} — {money(p.price)} / {p.billingPeriod.toLowerCase()}</option>)}</select>}</Field>;
}

export interface EditableLine extends LineInput { key: string }
let lineCounter = 0;
export const blankLine = (): EditableLine => ({ key: `line-${++lineCounter}`, productId: '', variantId: null, quantity: 1 });
export const toLineInputs = (lines: EditableLine[]): LineInput[] => lines.map(({ productId, variantId, quantity, unitPrice }) => ({ productId, variantId: variantId || null, quantity, ...(unitPrice ? { unitPrice } : {}) }));

/** Shows what a line will roughly cost. The server resolves and freezes the real price; this is only a guide for the person typing. */
function estimate(product: Product | undefined, variantId: string | null | undefined, unitPrice: string | undefined) {
  if (unitPrice) return unitPrice;
  if (!product) return null;
  const extra = product.variants.find(v => v.id === variantId)?.extraPrice ?? '0.00';
  return ((Math.round(Number(product.salesPrice) * 100) + Math.round(Number(extra) * 100)) / 100).toFixed(2);
}

/**
 * Product / variant / quantity rows shared by templates, subscriptions and seat changes. `fieldErrors` uses the server's
 * `lines.<index>.<field>` keys, so a rejected row is marked exactly where the problem is.
 */
export function LinesEditor({ lines, onChange, errors = {}, allowPrice }: { lines: EditableLine[]; onChange: (lines: EditableLine[]) => void; errors?: Record<string, string[]>; allowPrice?: boolean }) {
  const { data, isLoading, error } = useProducts(); const [open, setOpen] = useState(false);
  const products = data?.data.filter(p => p.isActive) ?? [];
  const patch = (key: string, change: Partial<EditableLine>) => onChange(lines.map(l => (l.key === key ? { ...l, ...change } : l)));
  if (error) return <ErrorNotice error={error} title="The product list could not be loaded" />;
  return <div className="space-y-3">
    {errors.lines && <p role="alert" className="text-sm text-rose-600">{errors.lines.join(' ')}</p>}
    {lines.map((line, index) => { const product = products.find(p => p.id === line.productId); const price = estimate(product, line.variantId, line.unitPrice);
      return <div key={line.key} className="grid items-start gap-3 rounded-lg border bg-slate-50 p-3 md:grid-cols-[2fr_1.5fr_6rem_8rem_auto]">
        <Field label="Product" error={errors[`lines.${index}.productId`]}>{(f: FieldProps) => <select {...f} className={inputClass} value={line.productId} disabled={isLoading} onChange={e => patch(line.key, { productId: e.target.value, variantId: null })}><option value="">{isLoading ? 'Loading…' : 'Select a product'}</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} — {money(p.salesPrice)}</option>)}</select>}</Field>
        <Field label="Variant" error={errors[`lines.${index}.variantId`]}>{(f: FieldProps) => <select {...f} className={inputClass} value={line.variantId ?? ''} disabled={!product || product.variants.length === 0} onChange={e => patch(line.key, { variantId: e.target.value || null })}><option value="">{product && product.variants.length ? 'No variant' : '—'}</option>{product?.variants.filter(v => v.isActive).map(v => <option key={v.id} value={v.id}>{v.attribute}: {v.value}{Number(v.extraPrice) ? ` (+${money(v.extraPrice)})` : ''}</option>)}</select>}</Field>
        <Field label="Quantity" error={errors[`lines.${index}.quantity`]}>{(f: FieldProps) => <input {...f} type="number" min={1} step={1} className={inputClass} value={line.quantity} onChange={e => patch(line.key, { quantity: Math.max(1, Math.floor(Number(e.target.value)) || 1) })} />}</Field>
        {allowPrice || open ? <Field label="Unit price (optional)" error={errors[`lines.${index}.unitPrice`]} hint="Overrides the catalog price">{(f: FieldProps) => <input {...f} inputMode="decimal" placeholder={price ?? '0.00'} className={inputClass} value={line.unitPrice ?? ''} onChange={e => patch(line.key, { unitPrice: e.target.value || undefined })} />}</Field> : <div><span className="mb-1 block text-sm font-medium text-slate-700">Est. unit price</span><p className="py-2 text-sm tabular-nums text-slate-700">{price ? money(price) : '—'}</p></div>}
        <div className="pt-6"><Button variant="ghost" aria-label={`Remove line ${index + 1}`} disabled={lines.length <= 1} onClick={() => onChange(lines.filter(l => l.key !== line.key))}>Remove</Button></div>
      </div>; })}
    <div className="flex flex-wrap items-center gap-3"><Button variant="secondary" onClick={() => onChange([...lines, blankLine()])}>Add a line</Button>{!allowPrice && <button type="button" className="text-sm text-brand-700 underline" onClick={() => setOpen(o => !o)}>{open ? 'Hide' : 'Override'} unit prices</button>}{isLoading && <Spinner small />}<span className="text-xs text-slate-500">Prices shown are estimates; the server calculates and freezes the final price.</span></div>
  </div>;
}
