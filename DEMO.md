# Brightloop demo script (about 4 minutes)

Follows "A month at Brightloop": a customer is billed, pays, and the finance team chases what is late.

## Before you start (once, 5 minutes)

```bash
# 1. A disposable local database (the name must contain test, demo, perf or seed for the big set)
createdb brightloop_demo            # or: psql -c "create database brightloop_demo"
# 2. Point the API at it: in server/.env
DATABASE_URL="postgresql://USER:PASS@localhost:5432/brightloop_demo?schema=public"
# 3. Create tables and demo data
npm run db:migrate
npm run db:seed                     # demo story: 9 subscriptions, ~35 invoices, payments, 3 discounts, 2 templates
npm run db:seed -- --perf           # optional: +300 customers, 5,000 subscriptions (about 5 minutes)
npm run dev                         # API on :4000, web on :5173
```

Demo accounts (password for all: `Brightloop!2026`; demo data only, the seed refuses to run in production):

| Role | Email |
|---|---|
| Admin | admin@brightloop.local |
| Staff | priya@brightloop.local, rahul@brightloop.local |
| Customer | billing@acme.example, accounts@northwind.example, finance@globex.example |

Sign-in uses the real Better Auth session. Until the login screen from the auth workstream is merged, sign in through `POST /api/auth/sign-in/email` (see the QA notes) or the dev role switcher.

## The 4-minute walk

| Time | Screen | What to do and say |
|---|---|---|
| 0:00 | **Subscriptions** | "Everything starts here." Show the list: statuses, the **Billing due** and **Ends at period end** badges. Filter `Status = Active`. |
| 0:30 | **Quotation templates → CRM Starter** | "Sales starts from a template." Click **Create subscription from this template**, pick *Globex*, start today, create. Note the price: product 1,000 + Odoo variant 560 = **1,560**, counted once. |
| 0:50 | **Subscription detail** | Walk the status buttons the server offers: **Send quotation → Confirm → Activate**. Point at the timeline. Try a wrong jump: the server refuses. |
| 1:20 | **Run billing** | "Billing day." Leave *Bill up to* = today, **Run billing**, confirm. Show created / skipped / failed. **Run it again**: *Created 0*, "nothing is ever billed twice". |
| 1:50 | **Invoices** | Open *Review draft invoices*. Select several, **Confirm selected**: one click for many. Open one invoice: lines, GST per line, **seat discount** (10% off for 5+ seats, applied before tax). |
| 2:30 | **Record payment** | On a confirmed invoice: pay **half** → *Partially paid*; try to pay more than the balance → refused; pay the rest → *Paid*. |
| 3:00 | **Overdue** | Invoices → *Overdue only*. Open one, **Send reminder**; a second click is refused (once per 24 hours). |
| 3:20 | **Cancel at period end** | Open the weekly subscription: **Cancel at period end** keeps service until the paid period ends, then billing stops and it closes by itself. **Keep subscription** undoes it. |
| 3:40 | **Customer portal** | Sign in as `billing@acme.example`: balance, overdue count, next invoice. Open an invoice → **Print / download**. A customer only ever sees their own data. |

## If something goes wrong
- *"Product list could not be loaded"* in a form: the catalog (products and plans) screens and endpoints belong to the catalog workstream; until they are merged, create subscriptions from a **template** (it needs no product picker).
- Dates are the Asia/Kolkata calendar date (`BUSINESS_TZ`), so "today" is correct for India after midnight.
- Emails without SMTP are printed in the API console (that is where the reset link and invoice email appear); with `SMTP_HOST` set they are really sent.
