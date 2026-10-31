import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
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
    <button
      {...props}
      className={`btn btn-${variant} ${props.className ?? ""}`}
    >
      {children}
    </button>
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
    <span className={`badge badge-${tone}`}>
      <span />
      {value.replaceAll("_", " ").toLowerCase()}
    </span>
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
      <label htmlFor={id}>
        {label}
        {required && <span className="required-mark"> *</span>}
      </label>
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
    <input
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
    <select
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
    <textarea
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
      <input
        type="checkbox"
        className="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
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
    <div className="notice notice-error" role="alert">
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
    </div>
  );
}
export function Loading({
  label = "Loading your workspace…",
}: {
  label?: string;
}) {
  return (
    <div className="loading-state" role="status">
      <span className="spinner" />
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
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                scope="col"
                key={c.key}
                className={c.align === "right" ? "align-right" : ""}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={c.align === "right" ? "align-right" : ""}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current?.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className={`modal ${wide ? "modal-wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
      aria-labelledby={heading}
    >
      <div className="modal-header">
        <h2 id={heading}>{title}</h2>
        <Button variant="ghost" aria-label="Close dialog" onClick={onClose}>
          <Icon name="close" />
        </Button>
      </div>
      {open && children}
    </dialog>
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
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 4500);
    return () => clearTimeout(timer);
  }, [message]);
  return (
    <ToastContext.Provider value={{ notify: setMessage }}>
      {children}
      {message && (
        <div className="toast" role="status">
          <Icon name="check" />
          {message}
          <button
            aria-label="Dismiss notification"
            onClick={() => setMessage("")}
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
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
