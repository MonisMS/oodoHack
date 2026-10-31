# Shared UI contract (C-01)

Owner C. This is the C-01 prop contract for the UI kit to be delivered in C-05. Import available components directly from their named files. Existing PageHeader and EmptyState exports and props remain compatible. UI kit components must not fetch data, filter full datasets, or calculate financial totals.

- `DataTable<T>`: `columns: {key, header, render(row), sortKey?}[]`, `rows`, `rowKey(row)`, `caption`, optional `loading`, `error`, `onRetry`, `emptyTitle`, `sort: {key, direction}`, `onSort(key)`. Server owns sorting and pagination; pass only the current page. State precedence: error, loading, rows/empty.
- `Pagination`: controlled `page`, `pageSize`, `total`, `onPageChange(page)`, optional `disabled`. One-based pages; caller resets page on search/filter changes. Does not fetch.
- `FormField`: `id`, `label`, `children(controlProps)`, optional `hint`, `errors: string[]`, `required`. Control props provide `id`, `aria-describedby`, `aria-invalid`, `required`; apply them to the input/select. Pass Zod/API field messages as errors.
- `StatusBadge`: `children`, optional `tone: neutral|success|warning|danger|info`. Labels remain visible; tone never encodes domain policy.
- `ConfirmDialog`: controlled `open`, `title`, `children`, `onConfirm`, `onCancel`, optional `pending`, `error`, `confirmLabel`. Caller owns async work; pending blocks dismissal, errors keep dialog open. Native modal focus handling and return focus; Cancel receives initial focus.
- `Toast`: controlled `message: string|null`, `onDismiss`, optional `tone: success|error|info`. Persistent until explicitly dismissed; never steals focus.
- `PageHeader`: existing `title`, optional `description`, `actions` unchanged.
- `EmptyState`: existing `title`, optional `children` unchanged.

Use actual API errors/pending states while another workstream is unfinished. Never show mock business success. Consumers own field validation, role visibility, mutation/cache invalidation and requests. D integrates these exports in D-owned screens.

## Frozen inputs reviewed for C-01

Authoritative sources are [TASKS.md](../../../../TASKS.md), [API_CONTRACT.md](../../../../API_CONTRACT.md), [server validators](../../../../server/src/lib/contracts.ts) and [client DTOs](../../types/api.ts). This document defines UI props only; it does not change those sources.

| Area | Existing inputs and responses | Consumer requirements |
|---|---|---|
| Products/variants | ProductInput, VariantInput -> Product, ProductVariant | ADMIN mutations; ADMIN/STAFF reads. DELETE deactivates. Variant belongs to the selected product. |
| Plans | PlanInput -> Plan | Preserve minimum quantity, date bounds, tax IDs and all lifecycle flags. Date-bound validation follows the server validator. |
| Discounts | DiscountInput -> Discount | usedCount is response-only. Preserve scope, products, dates and thresholds; B owns eligibility/application logic. |
| Auth/staff | A's useSession methods -> ActionResult; StaffInput -> User | A owns cookie sessions/security; C owns screens. Signup is CUSTOMER-only; staff creation is ADMIN-only. |
| Lists | ListQuery -> Page<T> | One-based page, default pageSize 20, maximum 100; search/sort/count/pagination on server. Catalog sort keys are createdAt/name. |
| Reports | ReportQuery -> ReportSummary | All filters combine. Revenue uses payment.date and payment amounts; invoice KPIs use issueDate. B/A own financial definitions. |

Money remains an INR decimal string with exactly two places (for example "560.00"); date-only values are YYYY-MM-DD in UTC. Missing optional values and explicit null follow the server defaults/nullability. PUT replaces writable fields. Resource success uses Data<T>, lists use Page<T>, resource DELETE returns no body; resource error fields are Record<string, string[]>.

Password forms mirror 9-72 characters, uppercase, lowercase, a non-whitespace special character and a maximum of 72 UTF-8 bytes. Login uses its separate, less restrictive validator. UI feedback does not replace server validation.

On current main, A's [session interface](../../lib/session.tsx) supplies signIn, signUp, signOut, requestReset and resetPassword. Actions return `{ok:true}` or `{ok:false,code,message}`. Auth uses cookie sessions through that interface; the legacy AuthSession token DTO still present in api.ts is not the UI integration contract. C-06 must use the current interface and confirm any validator/transport discrepancies with A.

Do not add variant extraPrice twice: inherited price is product.salesPrice + variant.extraPrice; an explicit unitPrice is already final. The UI kit itself performs no price resolution.

## Typed prop handoff

These are the planned public signatures for C-05. PageHeader and EmptyState already exist; the other components and exported types are not delivered by this documentation PR. Implementation acceptance, including browser/keyboard verification, belongs to C-05. Once implemented, import components and their exported types directly from the corresponding file; this block is reference documentation, not an additional source module.

```ts
import type { ReactNode } from 'react';

interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortKey?: string;
}
interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  emptyTitle?: string;
  sort?: { key: string; direction: 'asc' | 'desc' };
  onSort?: (key: string) => void;
}
interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}
interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  required?: boolean;
}
interface FormFieldProps {
  id: string;
  label: string;
  children: (props: FieldControlProps) => ReactNode;
  hint?: string;
  errors?: string[];
  required?: boolean;
}
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  pending?: boolean;
  error?: string;
  confirmLabel?: string;
}
interface ToastProps {
  message: string | null;
  onDismiss: () => void;
  tone?: 'success' | 'error' | 'info';
}
// PageHeader and EmptyState currently declare props inline; StatusBadge is planned.
type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
};
type EmptyStateProps = { title: string; children?: ReactNode };
type StatusBadgeProps = {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
};
```

## Integration responsibilities

- Supply unique column keys, stable row IDs and only the fetched page of rows. Enable sort controls only for endpoint-allowed keys; the caller toggles direction and requests the next result.
- Reset page to 1 when filters/search/pageSize change. Supply positive integer page/pageSize and nonnegative total; after deletion or a reduced count, the caller corrects an out-of-range page and refetches. Disable pagination while the request is pending.
- Spread FormField control props onto the actual input/select/textarea. IDs must be unique on the page. Pass `errors={apiError.body.error.fields?.name}` or the equivalent Zod messages; the caller handles form-level errors separately.
- Keep dialog open and set pending during a mutation. The caller catches failures, supplies error, and closes only on success or cancellation. The callbacks report intent; the dialog does not run requests or decide whether a domain operation is allowed.
- Use a nonempty Toast message to display feedback and null to clear it. Success is shown only after server success. The caller owns notification lifecycle and dismissal.
- Choose badge labels/tones from authoritative server state. Hidden buttons do not enforce authorization: server guards/services remain responsible.
- Preserve PageHeader/EmptyState named exports and their existing props. The existing ModulePage consumer requires no migration.

## Ownership and verification boundary

C owns this directory, including PageHeader and EmptyState. D owns adopting the kit in D's pages. A retains ownership of shared client session/API/routes/styles, dependency manifests, DTOs, schema and validators. No new package or shared interface change is needed for this prop handoff.

C-01 publishes prop interfaces and preserves the existing PageHeader/EmptyState contract. Component implementation and browser acceptance belong to C-05. A's current session interface must be used for later auth integration; D's performance seed is required for the full performance proof.
