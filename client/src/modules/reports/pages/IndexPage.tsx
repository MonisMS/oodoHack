import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { z } from "zod";
import { PageHeader } from "../../../components/ui/PageHeader";
import { EmptyState } from "../../../components/ui/EmptyState";
import {
  Button,
  ErrorNotice,
  Loading,
  Modal,
  FormField,
  Input,
  Select,
  DataTable,
} from "../../../components/ui/kit";
import { ReferencePicker } from "../../../components/ui/ReferencePicker";
import { Icon } from "../../../components/ui/Icon";
import {
  formatMoney,
  dateSchema,
  errorsFrom,
  type Fields,
} from "../../../lib/catalog-client";
import { useSession } from "../../../lib/session";
import type { ReportQuery } from "../../../types/api";
import { reportsApi } from "../api";
const filterSchema = z
  .object({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    customerId: z.string().uuid().optional(),
    planId: z.string().uuid().optional(),
    status: z
      .enum(["DRAFT", "QUOTATION", "CONFIRMED", "ACTIVE", "PAUSED", "CLOSED"])
      .optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    path: ["to"],
    message: "End date must be on or after start date",
  });
const monthLabel = (s: string) =>
  new Intl.DateTimeFormat("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(s + "-01T00:00:00Z"));
export default function IndexPage(_props: { title?: string }) {
  const [params, setParams] = useSearchParams();
  const { user } = useSession();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const parsed = filterSchema.safeParse(
    Object.fromEntries(
      ["from", "to", "customerId", "planId", "status"]
        .filter((k) => params.has(k))
        .map((k) => [k, params.get(k)]),
    ),
  );
  const query = parsed.success ? parsed.data : {};
  const result = useQuery({
    queryKey: ["reports", query],
    queryFn: ({ signal }) => reportsApi.summary(query, signal),
    enabled: parsed.success,
  });
  const data = result.data;
  const filtered = Object.keys(query).length > 0;
  const apply = (q: ReportQuery) => {
    setParams(
      Object.fromEntries(
        Object.entries(q).filter(([, value]) => Boolean(value)),
      ),
    );
    setFiltersOpen(false);
  };
  const setPreset = (preset: string) => {
    const now = new Date();
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    if (preset === "custom") {
      setFiltersOpen(true);
      return;
    }
    const from =
      preset === "month"
        ? today.slice(0, 8) + "01"
        : preset === "30days"
          ? new Date(new Date(today + "T00:00:00Z").getTime() - 29 * 86400000)
              .toISOString()
              .slice(0, 10)
          : undefined;
    apply({ ...query, from, to: from ? today : undefined });
  };
  const metrics = data
    ? [
        {
          label: "Revenue collected",
          value: formatMoney(data.revenueCollected),
          note: "Actual payments received",
          icon: "trend",
          accent: true,
        },
        {
          label: "Active subscriptions",
          value: data.activeSubscriptions.toLocaleString("en-IN"),
          note: filtered
            ? "Matching your selected filters"
            : "Across your workspace",
          icon: "repeat",
        },
        {
          label: "Outstanding balance",
          value: formatMoney(data.outstanding),
          note: "Confirmed and partially paid invoices",
          icon: "credit",
        },
        {
          label: "Overdue balance",
          value: formatMoney(data.overdueAmount),
          note: `${data.overdueCount} overdue invoice${data.overdueCount === 1 ? "" : "s"}`,
          icon: "calendar",
        },
      ]
    : [];
  return (
    <>
      <PageHeader
        title="Overview"
        eyebrow={
          user
            ? `YOUR WORKSPACE, ${user.name.split(" ")[0].toUpperCase()}`
            : "YOUR WORKSPACE"
        }
        description="A clear picture of your subscriptions and revenue."
        actions={
          <>
            <select
              className="sort-select"
              aria-label="Date range"
              value={query.from || query.to ? "custom" : "all"}
              onChange={(e) => setPreset(e.target.value)}
            >
              <option value="all">All time</option>
              <option value="month">This month</option>
              <option value="30days">Last 30 days</option>
              <option value="custom">Custom range</option>
            </select>
            <Button variant="secondary" onClick={() => setFiltersOpen(true)}>
              <Icon name="settings" size={14} />
              Filters
              {filtered && (
                <span className="count-pill">{Object.keys(query).length}</span>
              )}
            </Button>
          </>
        }
      />
      {filtered && (
        <div className="selected-chips" style={{ marginBottom: 21 }}>
          {query.from && (
            <span className="selected-chip">From {query.from}</span>
          )}
          {query.to && <span className="selected-chip">Until {query.to}</span>}
          {query.status && (
            <span className="selected-chip">
              {query.status.toLowerCase()} subscriptions
            </span>
          )}
          {query.customerId && (
            <span className="selected-chip">Customer selected</span>
          )}
          {query.planId && <span className="selected-chip">Plan selected</span>}
          <Button variant="ghost" onClick={() => setParams({})}>
            Clear filters
          </Button>
        </div>
      )}
      {!parsed.success ? (
        <ErrorNotice
          error={
            new Error(
              "The filters are invalid. Open Filters to choose a valid date range or clear your filters.",
            )
          }
          retry={() => setParams({})}
        />
      ) : result.error ? (
        <ErrorNotice error={result.error} retry={() => result.refetch()} />
      ) : result.isPending ? (
        <Loading label="Gathering your numbers…" />
      ) : (
        data && (
          <>
            <div className="metric-grid">
              {metrics.map((m) => (
                <section
                  className={`metric ${m.accent ? "metric-accent" : ""}`}
                  key={m.label}
                >
                  <p className="metric-label">
                    {m.label}
                    <Icon name={m.icon} size={14} />
                  </p>
                  <p className="metric-value number">{m.value}</p>
                  <p className="metric-foot">{m.note}</p>
                </section>
              ))}
            </div>
            <div className="dashboard-grid">
              <section className="panel">
                <div className="chart-header">
                  <div>
                    <h2>Revenue over time</h2>
                    <p>Payments received, grouped by month</p>
                  </div>
                  <span className="legend-key">Collected</span>
                </div>
                {data.revenueByMonth.length ? (
                  <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={data.revenueByMonth.map((r) => ({
                          ...r,
                          value: Number(r.amount),
                        }))}
                        margin={{ top: 12, right: 22, left: 12, bottom: 8 }}
                      >
                        <CartesianGrid stroke="#eef1e8" vertical={false} />
                        <XAxis
                          dataKey="month"
                          tickFormatter={monthLabel}
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 9, fill: "#9ba58e" }}
                          dy={9}
                          minTickGap={30}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 9, fill: "#9ba58e" }}
                          width={57}
                          tickFormatter={(v) =>
                            `₹${Number(v) >= 100000 ? `${(Number(v) / 100000).toFixed(1)}L` : Number(v) >= 1000 ? `${(Number(v) / 1000).toFixed(0)}k` : v}`
                          }
                        />
                        <Tooltip
                          labelFormatter={(v) => monthLabel(String(v))}
                          formatter={(v) => [
                            formatMoney(String(v)),
                            "Collected",
                          ]}
                          contentStyle={{
                            fontSize: 11,
                            border: "1px solid #e1e8d8",
                            borderRadius: 7,
                            boxShadow: "0 3px 15px #243a2110",
                          }}
                        />
                        <Area
                          dataKey="value"
                          stroke="#789a65"
                          strokeWidth={2}
                          fill="#eef3e6"
                          fillOpacity={1}
                          activeDot={{ r: 4, strokeWidth: 2, stroke: "white" }}
                          type="monotone"
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyState
                    title="Your revenue story starts here"
                    icon="chart"
                  >
                    Recorded payments will appear here automatically. Choose a
                    different range if you expected to see activity.
                  </EmptyState>
                )}
                <div className="chart-footer">
                  Collected revenue comes from payments, not invoice totals.
                </div>
              </section>
              <section className="panel">
                <div className="panel-title">
                  <h2>Receivables</h2>
                  <Icon name="credit" size={17} />
                </div>
                <div className="insight-list">
                  <div className="insight-row">
                    <div>
                      <p>Total outstanding</p>
                      <small>Open invoice balance</small>
                    </div>
                    <strong className="number">
                      {formatMoney(data.outstanding)}
                    </strong>
                  </div>
                  <div className="insight-row">
                    <div>
                      <p>Past the due date</p>
                      <small>
                        {data.overdueCount} invoice
                        {data.overdueCount === 1 ? "" : "s"} to follow up
                      </small>
                    </div>
                    <strong className="number">
                      {formatMoney(data.overdueAmount)}
                    </strong>
                  </div>
                  <div className="insight-row">
                    <p>Keep your collections moving.</p>
                    <Link to="/invoices" className="btn btn-secondary">
                      View invoices
                      <Icon name="arrow" size={13} />
                    </Link>
                  </div>
                </div>
                <div className="chart-footer">
                  Balances exclude draft, cancelled and paid invoices.
                </div>
              </section>
            </div>
            <section className="panel" style={{ marginTop: 24 }}>
              <div className="panel-title">
                <h2>Monthly collections</h2>
                <span className="small muted">INR</span>
              </div>
              <DataTable
                rows={[...data.revenueByMonth].reverse()}
                rowKey={(r) => r.month}
                emptyTitle="No payments in this period"
                emptyDescription="Collections will appear here after payments are recorded."
                columns={[
                  {
                    key: "month",
                    header: "Month",
                    render: (r) => (
                      <span className="cell-primary">
                        {monthLabel(r.month)}
                      </span>
                    ),
                  },
                  {
                    key: "amount",
                    header: "Revenue collected",
                    align: "right",
                    render: (r) => (
                      <span className="number">{formatMoney(r.amount)}</span>
                    ),
                  },
                ]}
              />
            </section>
            <p className="footer-note">
              <Icon name="info" size={12} />
              Date filters apply to subscription start dates, invoice issue
              dates and payment dates respectively.
            </p>
          </>
        )
      )}
      {filtersOpen && (
        <ReportFilters
          key={params.toString()}
          query={query}
          onApply={apply}
          onClose={() => setFiltersOpen(false)}
        />
      )}
    </>
  );
}
function ReportFilters({
  query,
  onApply,
  onClose,
}: {
  query: ReportQuery;
  onApply: (q: ReportQuery) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<ReportQuery>(query);
  const [fields, setFields] = useState<Fields>({});
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget as HTMLFormElement);
    const values = {
      ...draft,
      from: String(form.get("from") ?? ""),
      to: String(form.get("to") ?? ""),
    };
    const clean = Object.fromEntries(
      Object.entries(values).filter(([, value]) => Boolean(value)),
    );
    const parsed = filterSchema.safeParse(clean);
    if (!parsed.success) {
      setFields(errorsFrom(parsed.error));
      return;
    }
    onApply(parsed.data);
  };
  return (
    <Modal open title="Filter your overview" onClose={onClose} wide>
      <form onSubmit={submit} noValidate>
        <div className="modal-body">
          <div className="form-grid">
            <FormField label="From" error={fields.from}>
              <Input type="date" name="from" defaultValue={draft.from ?? ""} />
            </FormField>
            <FormField label="Until" error={fields.to}>
              <Input type="date" name="to" defaultValue={draft.to ?? ""} />
            </FormField>
            <div className="span-2">
              <FormField label="Subscription status">
                <Select
                  value={draft.status ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      status: e.target.value as ReportQuery["status"],
                    })
                  }
                >
                  <option value="">All statuses</option>
                  {[
                    "DRAFT",
                    "QUOTATION",
                    "CONFIRMED",
                    "ACTIVE",
                    "PAUSED",
                    "CLOSED",
                  ].map((s) => (
                    <option key={s} value={s}>
                      {s.toLowerCase()}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            <FormField label="Customer" error={fields.customerId}>
              <ReferencePicker
                path="/users/customers"
                label="Customers"
                value={draft.customerId ? [draft.customerId] : []}
                onChange={(v) => setDraft({ ...draft, customerId: v[0] })}
              />
            </FormField>
            <FormField label="Plan" error={fields.planId}>
              <ReferencePicker
                path="/plans"
                label="Plans"
                value={draft.planId ? [draft.planId] : []}
                onChange={(v) => setDraft({ ...draft, planId: v[0] })}
              />
            </FormField>
          </div>
        </div>
        <div className="modal-footer">
          <Button type="button" variant="ghost" onClick={() => onApply({})}>
            Clear all
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button>Apply filters</Button>
        </div>
      </form>
    </Modal>
  );
}
