import { Alert } from "./primitives/alert";
import { Skeleton } from "./primitives/skeleton";
import { Button as LibraryButton } from "./primitives/button";
import { Badge } from "./primitives/badge";
import { Input as LibraryInput } from "./primitives/input";
import { Textarea as LibraryTextarea } from "./primitives/textarea";
import { NativeSelect } from "./primitives/native-select";
import { Label } from "./primitives/label";
import { Switch } from "./primitives/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./primitives/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "./primitives/table";
import { Toaster, toast } from "sonner";
import {
  createContext,
  useContext,
  useId,
  type ReactNode,
  type ButtonHTMLAttributes,
  type FormEvent,
} from "react";
import { Icon } from "./Icon";
import { EmptyState } from "./EmptyState";
import { ApiError } from "../../lib/api";
export function Button({
  variant = "primary",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <LibraryButton
      variant={
        {
          primary: "default",
          secondary: "outline",
          ghost: "ghost",
          danger: "destructive",
        }[variant] as "default" | "outline" | "ghost" | "destructive"
      }
      {...props}
      className={`btn btn-${variant} ${props.className ?? ""}`}
    >
      {children}
    </LibraryButton>
  );
}
export function StatusBadge({ status }: { status: string | boolean }) {
  const value =
    typeof status === "boolean" ? (status ? "Active" : "Archived") : status;
  const tone = /^(active|paid|available|enabled)$/i.test(value)
    ? "good"
    : /^(paused|draft|scheduled|confirmed|quotation)$/i.test(value)
      ? "warm"
      : /^(closed|archived|cancelled|disabled|expired|exhausted)$/i.test(value)
        ? "neutral"
        : "info";
  return (
    <Badge variant="outline" className={`badge badge-${tone}`}>
      <span />
      {value.replaceAll("_", " ").toLowerCase()}
    </Badge>
  );
}
export function FormField({
  label,
  hint,
  error,
  children,
  required,
}: {
  label: string;
  hint?: string;
  error?: string | string[];
  children: ReactNode;
  required?: boolean;
}) {
  const id = useId();
  const invalid = Array.isArray(error) ? error.length > 0 : Boolean(error);
  const describedBy = invalid ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={`field ${invalid ? "field-invalid" : ""}`}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="required-mark"> *</span>}
      </Label>
      <div className="field-control">
        <FieldContext.Provider value={{ id, invalid, describedBy }}>
          {children}
        </FieldContext.Provider>
      </div>
      {hint && !invalid && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {invalid && (
        <p role="alert" className="field-error" id={`${id}-error`}>
          {Array.isArray(error) ? error.join(" ") : error}
        </p>
      )}
    </div>
  );
}
const FieldContext = createContext<{
  id?: string;
  invalid?: boolean;
  describedBy?: string;
}>({});
export const useField = () => useContext(FieldContext);
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const field = useField();
  return (
    <LibraryInput
      aria-invalid={field.invalid || undefined}
      aria-describedby={field.describedBy}
      {...props}
      id={props.id ?? field.id}
      className={`input ${props.className ?? ""}`}
    />
  );
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const field = useField();
  return (
    <NativeSelect
      aria-invalid={field.invalid || undefined}
      aria-describedby={field.describedBy}
      {...props}
      id={props.id ?? field.id}
      className="input"
    />
  );
}
export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  const field = useField();
  return (
    <LibraryTextarea
      aria-invalid={field.invalid || undefined}
      aria-describedby={field.describedBy}
      {...props}
      id={props.id ?? field.id}
      className="input"
    />
  );
}
export function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span>
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </span>
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
export function ErrorNotice({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  if (!error) return null;
  return (
    <Alert variant="destructive" className="notice notice-error">
      <Icon name="info" />
      <div>
        <strong>
          {error instanceof Error
            ? error.message
            : "Something went wrong. Please try again."}
        </strong>
        {error instanceof ApiError && error.body.error.fields && (
          <ul>
            {Object.entries(error.body.error.fields).map(([key, values]) => (
              <li key={key}>{values.join(" ")}</li>
            ))}
          </ul>
        )}
      </div>
      {retry && (
        <Button variant="ghost" onClick={retry}>
          Try again
        </Button>
      )}
    </Alert>
  );
}
export function Loading({
  label = "Loading your workspace…",
}: {
  label?: string;
}) {
  return (
    <div className="loading-state" role="status">
      <Skeleton className="h-4 w-4 rounded-full" />
      {label}
    </div>
  );
}
export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: "right";
}
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  loading,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  loading?: boolean;
}) {
  if (loading) return <Loading />;
  if (!rows.length)
    return (
      <EmptyState title={emptyTitle}>
        {emptyDescription ??
          "Try a different search, or add your first item to get started."}
      </EmptyState>
    );
  return (
    <div className="table-scroll">
      <Table className="data-table">
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead
                scope="col"
                key={c.key}
                className={c.align === "right" ? "align-right" : ""}
              >
                {c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={rowKey(row)}>
              {columns.map((c) => (
                <TableCell
                  key={c.key}
                  className={c.align === "right" ? "align-right" : ""}
                >
                  {c.render(row)}
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
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="pagination">
      <span>
        {total
          ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total.toLocaleString()} results`
          : "0 results"}
      </span>
      <div>
        <Button
          variant="secondary"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span className="page-number">
          {page} / {pages}
        </span>
        <Button
          variant="secondary"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
export function Modal({
  open,
  title,
  children,
  onClose,
  wide = false,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className={`workspace-dialog ${wide ? "workspace-dialog-wide" : ""}`}
      >
        <DialogHeader className="modal-header">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  pending,
  onConfirm,
  onClose,
  error,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  error?: unknown;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      <div className="modal-body">
        <p className="muted">{description}</p>
        <ErrorNotice error={error} />
      </div>
      <div className="modal-footer">
        <Button variant="secondary" disabled={pending} onClick={onClose}>
          Keep it
        </Button>
        <Button variant="danger" disabled={pending} onClick={onConfirm}>
          {pending ? "Saving…" : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
type ToastValue = { notify: (message: string) => void };
const ToastContext = createContext<ToastValue>({ notify: () => {} });
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <ToastContext.Provider
      value={{
        notify: (message) => {
          toast.success(message);
        },
      }}
    >
      {children}
      <Toaster
        position="bottom-right"
        closeButton
        richColors
        toastOptions={{ className: "workspace-toast" }}
      />
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);
export function Form({
  children,
  onSubmit,
  className = "",
}: {
  children: ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  className?: string;
}) {
  return (
    <form className={className} onSubmit={onSubmit}>
      {children}
    </form>
  );
}
