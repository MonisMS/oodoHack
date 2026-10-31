# Interface libraries and visual system

The interface follows the supplied dashboard reference: a cool gray canvas, white cards, fine borders, restrained shadows, dark controls, blue chart strokes, and small semantic status badges. Inter Variable is hosted locally. Existing API data, financial totals, filters, permissions, lifecycle actions and form submissions remain in place.

## Library components

| Library           | Used for                                                                                                           | Source                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| shadcn/ui + Radix | Buttons, badges, cards, dialogs, inputs, native selects, textareas, labels, tables, switches, alerts and skeletons | [Official component registry](https://ui.shadcn.com/docs/components)                                                                  |
| Aceternity UI     | Responsive dashboard Bento Grid                                                                                    | [Bento Grid](https://ui.aceternity.com/components/bento-grid), [registry source](https://ui.aceternity.com/registry/bento-grid.json)  |
| Magic UI          | Active-subscription count animation                                                                                | [Number Ticker](https://magicui.design/docs/components/number-ticker), [registry source](https://magicui.design/r/number-ticker.json) |
| Sonner            | Dismissible notifications                                                                                          | [Official project](https://github.com/emilkowalski/sonner)                                                                            |
| Lucide            | Consistent interface icons                                                                                         | [Official project](https://lucide.dev/)                                                                                               |

shadcn and the other registries distribute editable source components. The files in `client/src/components/ui/primitives` are downloaded library sources with app-specific adaptations. They are not a replacement financial implementation. Existing public adapters in `components/ui/kit.tsx` and `components/ops/ui.tsx` preserve the screen contracts while delegating generic controls to these primitives.

Most shadcn primitives use the official Tailwind 3 compatible `https://ui.shadcn.com/r/styles/new-york/<component>.json` registry. Native Select comes from `https://ui.shadcn.com/r/styles/new-york-v4/native-select.json`, adapted to Tailwind 3 and retaining the native numeric `size` property. The app stays on its existing React/Vite/Tailwind stack. Dependencies are locked in the root package lock.

## Adaptations

- One neutral theme in `client/src/styles.css` and Tailwind CSS variables covers catalog, operational, authentication, and portal screens.
- Dialogs use Radix focus containment, Escape handling, an accessible title, a portal, and scrollable mobile content. Their wrappers preserve pending-action guards.
- Native select semantics, input names, controlled handlers and date `FormData` submission are retained.
- Aceternity's demo-specific fixed-height rows are removed; existing report cards determine the responsive layout.
- Magic UI uses Indian number grouping and respects reduced-motion preferences. Screen readers get the authoritative count. Currency values remain exact formatted server values and do not animate.
- Recharts continues to plot real monthly payment data; the reference's unrelated sales, channel, visitor and target metrics are not introduced.
- Operational routes load on demand. Print layouts remain plain white and retain every invoice detail.
- Customer navigation includes a direct link back to its overview. Existing server role guards remain authoritative.

## Attribution

shadcn/ui and Magic UI MIT notices are included in `docs/licenses/shadcn-ui.txt` and `docs/licenses/magic-ui.txt`. Aceternity's free public Bento Grid source is attributed to Manu Arora; see the [original component](https://ui.aceternity.com/components/bento-grid) and [licensing page](https://ui.aceternity.com/licence). No Pro templates or paid blocks are included. Package-managed libraries retain their license files in their npm distributions. Inter's license remains beside the local font.

## Verification

- `npm run typecheck`: passes for both workspaces.
- `npm test`: 240 pass, 8 seed-specific tests skipped (24 test files).
- `npm run build`: production server and client build checked after the migration.
- Browser checks: every staff module landing page; subscription detail; invoice list, detail and printable view; plan switches and invalid form input; report date filtering; invalid payment rejection; real customer sign-in, portal summary, subscription and invoice screens; desktop and phone-sized layouts; mobile navigation and filter dialog.
- Report filter check: September–October 2026 returns the two expected payment months and ₹95,226.00 in the isolated local preview data. A zero-amount payment is rejected without changing its invoice balance.

No backend financial logic was changed. No commit or push is part of this interface update.
