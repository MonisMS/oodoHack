import { useState, type FormEvent } from "react";
import { useLocation, Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { PageHeader } from "../../../components/ui/PageHeader";
import {
  Button,
  DataTable,
  Pagination,
  FormField,
  Input,
  Modal,
  ErrorNotice,
  StatusBadge,
  Toggle,
  useToast,
} from "../../../components/ui/kit";
import { PasswordInput } from "../../../components/ui/PasswordInput";
import { Icon } from "../../../components/ui/Icon";
import { useSession } from "../../../lib/session";
import {
  useDebounced,
  errorsFrom,
  type Fields,
} from "../../../lib/catalog-client";
import { emailSchema, passwordSchema } from "../../auth/validation";
import type { User } from "../../../types/api";
import { usersApi } from "../api";
export default function IndexPage(_props: { title?: string }) {
  const staff = useLocation().pathname.endsWith("/staff");
  const { role } = useSession();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const page = Math.max(1, Number(params.get("page")) || 1);
  const term = useDebounced(search);
  const [edit, setEdit] = useState<User | null | undefined>();
  const query = {
    page,
    pageSize: 10,
    search: term,
    sortBy: "name" as const,
    sortOrder: "asc" as const,
  };
  const result = useQuery({
    queryKey: ["users", staff ? "staff" : "customers", query],
    queryFn: ({ signal }) =>
      (staff ? usersApi.staff : usersApi.customers)(query, signal),
  });
  const update = (key: string, value: string) =>
    setParams((p) => {
      p.set(key, value);
      if (key === "search") p.set("page", "1");
      return p;
    });
  return (
    <>
      <PageHeader
        eyebrow="People"
        title={staff ? "Your team" : "Customers"}
        description={
          staff
            ? "The people who keep your business running."
            : "A clear view of the people behind your subscriptions."
        }
        actions={
          staff && role === "ADMIN" ? (
            <Button onClick={() => setEdit(null)}>
              <Icon name="plus" size={15} />
              Add staff
            </Button>
          ) : undefined
        }
      />
      <div className="tabs">
        <Link className={`tab ${!staff ? "active" : ""}`} to="/users/customers">
          Customers
        </Link>
        {role === "ADMIN" && (
          <Link className={`tab ${staff ? "active" : ""}`} to="/users/staff">
            Staff
          </Link>
        )}
      </div>
      <section className="panel">
        <div className="toolbar">
          <div className="toolbar-title">
            {staff ? "Team members" : "All customers"}
            <span className="count-pill">{result.data?.total ?? "—"}</span>
          </div>
          <label className="search-field">
            <Icon name="search" size={14} />
            <input
              aria-label={staff ? "Search staff" : "Search customers"}
              value={search}
              placeholder="Search by name or email…"
              onChange={(e) => {
                setSearch(e.target.value);
                update("search", e.target.value);
              }}
            />
          </label>
        </div>
        <div style={{ padding: "0 20px" }}>
          <ErrorNotice error={result.error} retry={() => result.refetch()} />
        </div>
        {!result.error && (
          <>
            <DataTable<User>
              loading={result.isPending}
              rows={result.data?.data ?? []}
              rowKey={(r) => r.id}
              emptyTitle={
                term
                  ? "No matching people"
                  : staff
                    ? "Build your team"
                    : "Your first customer starts here"
              }
              emptyDescription={
                term
                  ? "Try a different name or email."
                  : staff
                    ? "Add a staff member to share the day-to-day work."
                    : "Customers will appear here when they create an account."
              }
              columns={[
                {
                  key: "name",
                  header: "Name",
                  render: (u) => (
                    <div className="identity-cell">
                      <span className="user-initial">
                        {u.name
                          .split(" ")
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join("")}
                      </span>
                      <span className="cell-primary">{u.name}</span>
                    </div>
                  ),
                },
                {
                  key: "email",
                  header: "Email address",
                  render: (u) => u.email,
                },
                {
                  key: "role",
                  header: "Role",
                  render: (u) => (
                    <span style={{ textTransform: "capitalize" }}>
                      {u.role.toLowerCase()}
                    </span>
                  ),
                },
                {
                  key: "active",
                  header: "Status",
                  render: (u) => (
                    <StatusBadge status={u.isActive ? "Active" : "Disabled"} />
                  ),
                },
                {
                  key: "created",
                  header: "Joined",
                  render: (u) =>
                    new Date(u.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    }),
                },
                {
                  key: "action",
                  header: "",
                  align: "right",
                  render: (u) =>
                    role === "ADMIN" && u.role !== "ADMIN" ? (
                      <Button
                        variant="ghost"
                        aria-label={`Edit ${u.name}`}
                        onClick={() => setEdit(u)}
                      >
                        <Icon name="edit" size={15} />
                      </Button>
                    ) : null,
                },
              ]}
            />
            {result.data && (
              <Pagination
                page={page}
                pageSize={10}
                total={result.data.total}
                onPageChange={(p) => update("page", String(p))}
              />
            )}
          </>
        )}
      </section>
      {edit !== undefined && (
        <UserEditor user={edit} onClose={() => setEdit(undefined)} />
      )}
      <p className="footer-note">
        <Icon name="shield" size={12} />
        Access is controlled by each person’s role.
      </p>
    </>
  );
}
function UserEditor({
  user,
  onClose,
}: {
  user: User | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [active, setActive] = useState(user?.isActive ?? true);
  const [fields, setFields] = useState<Fields>({});
  const cache = useQueryClient();
  const { notify } = useToast();
  const mutation = useMutation({
    mutationFn: async () =>
      user
        ? usersApi.update(user.id, { name, isActive: active })
        : usersApi.createStaff({ name, email, password }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["users"] });
      await cache.invalidateQueries({
        queryKey: ["reference", "/users/customers"],
      });
      notify(user ? "Account updated" : "Staff account created");
      onClose();
    },
    onError: (e) => setFields(errorsFrom(e)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const schema = user
      ? z.object({
          name: z
            .string()
            .trim()
            .min(1, "Enter a name")
            .max(120, "Use 120 characters or fewer"),
        })
      : z.object({
          name: z
            .string()
            .trim()
            .min(1, "Enter a name")
            .max(120, "Use 120 characters or fewer"),
          email: emailSchema,
          password: passwordSchema,
        });
    const parsed = schema.safeParse({ name, email, password });
    if (!parsed.success) {
      setFields(errorsFrom(parsed.error));
      return;
    }
    setFields({});
    mutation.mutate();
  };
  return (
    <Modal
      open
      title={user ? "Edit account" : "Add a staff member"}
      onClose={() => {
        if (!mutation.isPending) onClose();
      }}
    >
      <form onSubmit={submit} noValidate>
        <div className="modal-body">
          <ErrorNotice error={mutation.error} />
          <FormField label="Full name" error={fields.name}>
            <Input
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>
          {user ? (
            <>
              <p className="muted small" style={{ margin: "15px 0" }}>
                {user.email}
              </p>
              <Toggle
                label="Account enabled"
                hint="Disabling signs this person out and prevents future sign-ins."
                checked={active}
                onChange={setActive}
              />
            </>
          ) : (
            <>
              <FormField label="Email address" error={fields.email}>
                <Input
                  autoComplete="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </FormField>
              <PasswordInput
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                checklist
                error={fields.password}
              />
              <p className="field-hint" style={{ marginTop: 15 }}>
                This creates a staff account. Share the initial credentials
                securely, or ask the person to use the password reset flow.
              </p>
            </>
          )}
        </div>
        <div className="modal-footer">
          <Button
            type="button"
            variant="secondary"
            disabled={mutation.isPending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button disabled={mutation.isPending}>
            {mutation.isPending
              ? "Saving…"
              : user
                ? "Save changes"
                : "Create staff account"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
