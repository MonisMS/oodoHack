# Person D status (delivered by A on D's behalf)

| Task | State |
|---|---|
| D-01 skeletons | done (superseded by real pages) |
| D-02 taxes + email | done: tax CRUD, `lib/email.ts` (SMTP / dev log / honest production failure), reset/invoice/reminder emails, tax admin screen |
| D-03 templates UI | done |
| D-04 subscriptions UI | done: list, forms, detail with timeline and server-driven actions, cancel at period end, seat changes |
| D-05 invoices / payments / billing UI | done: filters, bulk confirm/send/remind, invoice detail and print, record payment, run billing page |
| D-06 customer portal | done: server (isolation tested) and pages incl. print |
| D-07 seed | done: idempotent, 5,000-subscription mode verified (303 users, 5,009 subscriptions, 15,854 invoices, 9,374 payments in 287 s) |
| D-08 DEMO.md / QA.md | done: 26/26 scripted journey steps pass; results recorded in QA.md |
| D-09 integration | done for built modules; real-browser check found no JS errors |

Open for others: product/plan/discount endpoints and screens, login/signup/reset screens (C).
