# Shared UI contract for C and D

Part C implementation, 31 October 2026. Existing PageHeader and EmptyState props remain compatible. All components use the shared Inter font, light surfaces, muted teal accent and responsive CSS in client/src/styles.css. No gradient assets or external font requests are required. Inter's SIL Open Font License is included in client/public/fonts/Inter-LICENSE.txt.

## Public imports

```tsx
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Button, FormField, Input, Select, Textarea, Toggle, StatusBadge,
  DataTable, Pagination, Modal, ConfirmDialog, ErrorNotice, Loading, useToast
} from '../../components/ui/kit';
import type { Column } from '../../components/ui/kit';
import { ReferencePicker } from '../../components/ui/ReferencePicker';
import { Icon } from '../../components/ui/Icon';
```

Individual compatibility entry points also exist for Button, DataTable, Pagination, FormField, StatusBadge, Modal, ConfirmDialog and Toast.

| Component | Props / responsibilities |
|---|---|
| PageHeader | title, optional description/actions/eyebrow. Keep one page h1. |
| EmptyState | title, optional children/action/icon. Use truthful empty/unavailable states. |
| Button | Native button attributes plus variant: primary/secondary/ghost/danger. Set type=button for non-submit actions inside a form. |
| FormField | label, optional hint/error(string or string[])/required, children. Input/Select/Textarea inherit the generated label id, error and hint associations. |
| Toggle | label, optional hint, checked:boolean, onChange(boolean). Native accessible checkbox. |
| StatusBadge | status:string or boolean. Boolean means active/archived. Status text is retained and normalized for display. |
| DataTable<T> | columns: Column<T>[], rows:T[], rowKey(row), optional loading/emptyTitle/emptyDescription. Column has key/header/render and optional align=right. Never fetches, sorts, filters or aggregates business data itself. |
| Pagination | page/pageSize/total/onPageChange. Controlled server pagination. |
| Modal | open/title/children/onClose, optional wide. Native dialog supports focus containment and Escape. Guard onClose during a pending mutation. |
| ConfirmDialog | open/title/description/onConfirm/onClose, optional confirmLabel/pending/error. Call the server on confirm; show errors and retain the dialog on failure. |
| ErrorNotice | error:unknown and optional retry callback. Displays the shared API error envelope/field errors. |
| Loading | Optional label, accessible role=status. |
| useToast | notify(message). AppLayout already mounts ToastProvider; do not add another provider per screen. |
| ReferencePicker | path, value:string[], onChange(ids), label; optional multiple/optionalService. Explicit paginated server search, ten options per page; never silently downloads all customers/products. |

ReferencePicker supplies its own accessible search label. Optional tax endpoints returning 501 show a real unavailable message while preserving selections; genuine request failures offer Retry. The current fixed list contract has no active-only query parameter, so archived choices are filtered from each option page, and existing selected archived choices remain visible.

## Composition and behavior

Use panel/panel-title/panel-body for contained sections; form-grid/span-2 for forms; form-actions for the primary footer; toolbar/search-field for lists. The shell owns the sidebar, topbar and main landmarks. It hides unavailable role navigation and redirects anonymous protected routes to sign-in while preserving the intended staff URL. Mobile navigation is inert while hidden; when open, background content is inert, focus stays inside the drawer, and Escape restores focus to the menu button.

Native date fields submit FormData values to handle browser date entry/autofill reliably. Keep date strings in YYYY-MM-DD; never convert a money write to a JS floating-point number. Monetary transport remains a two-decimal string. formatMoney/addDisplayMoney in lib/catalog-client are display helpers, not authorization/calculation logic for a financial mutation.

Catalog lists and account lists use server pagination/search. D must invalidate the relevant TanStack Query keys after a successful mutation. Current keys: products/plans/discounts (list or id), users (staff/customers), reference plus API path, reports plus filters. Invalidate reports after invoice/payment/subscription changes. Do not copy B's billing calculations into a screen.

## Remaining D integration

- Implement /api/taxes so catalog tax selection becomes fully available.
- Connect the existing resetMailer/invoiceMailer interfaces to D's shared production transport. C's reset screens are wired to the real session interface, but real delivery is still D's responsibility.
- Use the kit for D's subscription/template/invoice/billing/payment/tax/portal screens. C did not replace their feature scaffolds or implement portal authorization.
- Keep A's server role/ownership predicates authoritative; hiding buttons does not grant security.
