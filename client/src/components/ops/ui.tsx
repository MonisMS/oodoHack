import { useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Button as LibraryButton } from "../ui/primitives/button";
import { Card as LibraryCard } from "../ui/primitives/card";
import { Badge } from "../ui/primitives/badge";
import { Label } from "../ui/primitives/label";
import { Modal as SharedModal } from "../ui/kit";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "../ui/primitives/table";
import { label } from "./format";

// Compatibility adapters keep operational screens on the shared shadcn primitives.
export const inputClass = "input w-full";
type Variant = "primary" | "secondary" | "danger" | "ghost";
const variants = {
  primary: "default",
  secondary: "outline",
  danger: "destructive",
  ghost: "ghost",
} as const;
export function Button({
  variant = "secondary",
  busy,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  busy?: boolean;
}) {
  return (
    <LibraryButton
      type="button"
      variant={variants[variant]}
      {...rest}
      disabled={rest.disabled || busy}
      className={`btn btn-${variant} ${className}`}
    >
      {busy && <Spinner small />}
      {children}
    </LibraryButton>
  );
}

export function Spinner({ small }: { small?: boolean }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${small ? "h-3.5 w-3.5" : "h-5 w-5"}`}
    />
  );
}

export function Card({
  title,
  actions,
  children,
  className = "",
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <LibraryCard className={`ops-card ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </LibraryCard>
  );
}

const TONES: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  red: "bg-rose-50 text-rose-700 ring-rose-600/20",
  slate: "bg-slate-100 text-slate-700 ring-slate-500/20",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/20",
};
const STATUS_TONE: Record<string, string> = {
  ACTIVE: "green",
  PAID: "green",
  CONFIRMED: "blue",
  QUOTATION: "violet",
  DRAFT: "slate",
  PAUSED: "amber",
  PARTIALLY_PAID: "amber",
  CLOSED: "slate",
  CANCELLED: "red",
  OVERDUE: "red",
};
/** Status is always shown as text (never colour alone). */
export function StatusBadge({
  status,
  tone,
}: {
  status: string;
  tone?: keyof typeof TONES;
}) {
  return (
    <Badge
      variant="outline"
      className={`ops-status inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone ?? STATUS_TONE[status] ?? "slate"]}`}
    >
      {label(status)}
    </Badge>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
  onDismiss,
}: {
  tone?: "info" | "success" | "error" | "warning";
  title?: string;
  children?: ReactNode;
  onDismiss?: () => void;
}) {
  const styles = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    error: "border-rose-200 bg-rose-50 text-rose-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
  }[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${styles}`}
    >
      <div>
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={title ? "mt-1" : ""}>{children}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="text-lg leading-none opacity-60 hover:opacity-100"
        >
          ×
        </button>
      )}
    </div>
  );
}

/** A labelled form field with its error message wired up for assistive tech. */
export function Field({
  label: text,
  error,
  hint,
  children,
  className = "",
}: {
  label: string;
  error?: string[] | string;
  hint?: string;
  children: (props: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby"?: string;
  }) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const message = Array.isArray(error) ? error.join(" ") : error;
  return (
    <div className={className}>
      <Label
        htmlFor={id}
        className="mb-1 block text-sm font-medium text-slate-700"
      >
        {text}
      </Label>
      {children({
        id,
        "aria-invalid": Boolean(message),
        "aria-describedby": message
          ? `${id}-error`
          : hint
            ? `${id}-hint`
            : undefined,
      })}
      {hint && !message && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      )}
      {message && (
        <p id={`${id}-error`} className="mt-1 text-xs text-rose-600">
          {message}
        </p>
      )}
    </div>
  );
}

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: "right";
}
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  empty,
  caption,
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  empty: ReactNode;
  caption: string;
  onRowClick?: (row: T) => void;
}) {
  if (loading && !rows)
    return (
      <div className="flex justify-center rounded-xl border bg-white p-10">
        <Spinner />
      </div>
    );
  if (!rows?.length)
    return (
      <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-slate-500">
        {empty}
      </div>
    );
  return (
    <div className="ops-table rounded-xl border bg-white shadow-sm">
      <Table className="min-w-full divide-y divide-slate-200 text-sm">
        <caption className="sr-only">{caption}</caption>
        <TableHeader className="bg-slate-50">
          <TableRow>
            {columns.map((c) => (
              <TableHead
                key={c.header}
                scope="col"
                className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 ${c.align === "right" ? "text-right" : "text-left"}`}
              >
                {c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <TableRow
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? "cursor-pointer hover:bg-slate-50" : ""}
            >
              {columns.map((c) => (
                <TableCell
                  key={c.header}
                  className={`px-4 py-2.5 ${c.align === "right" ? "text-right tabular-nums" : ""} ${c.className ?? ""}`}
                >
                  {c.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm text-slate-600"
    >
      <p>
        {from}–{to} of {total.toLocaleString("en-IN")}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </Button>
        <span>
          Page {page} of {pages}
        </span>
        <Button
          variant="secondary"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}

/** Accessible modal: focus moves in, Escape closes, the page behind is inert to the screen reader. */
export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <SharedModal open title={title} onClose={onClose} wide={wide}>
      <div className="modal-body">{children}</div>
      {footer && (
        <footer className="modal-footer flex flex-wrap">{footer}</footer>
      )}
    </SharedModal>
  );
}
/** Definition list for read-only facts. */
export function Facts({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([term, value]) => (
        <div key={term}>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {term}
          </dt>
          <dd className="mt-0.5 text-sm text-slate-900">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
