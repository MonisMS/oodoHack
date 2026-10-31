import { Input as LibraryInput } from "../ui/primitives/input";
import { NativeSelect as LibraryNativeSelect } from "../ui/primitives/native-select";
import { useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api, queryString } from "../../lib/api";
import {
  formatMoney,
  addDisplayMoney,
  useDebounced,
  normalizeMoney,
  moneySchema,
  errorsFrom,
  type Fields,
} from "../../lib/catalog-client";
import { useSession } from "../../lib/session";
import type {
  Data,
  Page,
  Product,
  Plan,
  Discount,
  ProductVariant,
} from "../../types/api";
import { PageHeader } from "../ui/PageHeader";
import {
  Button,
  StatusBadge,
  DataTable,
  Pagination,
  ErrorNotice,
  Loading,
  ConfirmDialog,
  Modal,
  FormField,
  Input,
  Toggle,
  useToast,
  type Column,
} from "../ui/kit";
import { Icon } from "../ui/Icon";
import { CatalogForm, singular, type Kind, type Item } from "./CatalogForm";
const descriptions = {
  products: "Your products, variants and pricing, in one place.",
  plans: "Set the rhythm of your subscription business.",
  discounts: "Thoughtful offers. Applied automatically.",
};
const icons = { products: "box", plans: "layers", discounts: "tag" };
const titles = { products: "Products", plans: "Plans", discounts: "Discounts" };
export function CatalogWorkspace({ kind }: { kind: Kind }) {
  const params = useParams();
  const isNew = window.location.pathname.endsWith("/new");
  return params.id ? (
    <CatalogDetail kind={kind} id={params.id} />
  ) : isNew ? (
    <>
      <Link className="back-link" to={"/" + kind}>
        <Icon name="arrow" size={13} />
        Back to {kind}
      </Link>
      <PageHeader
        title={`New ${singular[kind]}`}
        description={`Add a ${singular[kind]} to your catalog.`}
        eyebrow="Catalog"
      />
      <CatalogForm kind={kind} />
    </>
  ) : (
    <CatalogList kind={kind} />
  );
}
function CatalogList({ kind }: { kind: Kind }) {
  const [params, setParams] = useSearchParams();
  const rawPage = Number(params.get("page") ?? 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const [search, setSearch] = useState(params.get("search") ?? "");
  const debounced = useDebounced(search);
  const sort =
    params.get("sort") === "oldest"
      ? "oldest"
      : params.get("sort") === "name"
        ? "name"
        : "newest";
  const { role } = useSession();
  const query = {
    search: debounced,
    page,
    pageSize: 10,
    sortBy: sort === "name" ? "name" : "createdAt",
    sortOrder: sort === "oldest" || sort === "name" ? "asc" : "desc",
  };
  const result = useQuery({
    queryKey: [kind, query],
    queryFn: ({ signal }) =>
      api<Page<Item>>("/" + kind + queryString(query), { signal }),
  });
  const update = (values: Record<string, string>) =>
    setParams((old) => {
      const next = new URLSearchParams(old);
      for (const [k, v] of Object.entries(values)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      return next;
    });
  const columns: Column<Item>[] = [
    {
      key: "name",
      header:
        kind === "products"
          ? "Product"
          : kind === "plans"
            ? "Plan"
            : "Discount",
      render: (item) => (
        <div className="identity-cell">
          <span className={`item-icon ${kind === "plans" ? "alt" : ""}`}>
            <Icon name={icons[kind]} size={17} />
          </span>
          <div>
            <Link className="cell-primary" to={`/${kind}/${item.id}`}>
              {item.name}
            </Link>
            <p className="cell-secondary">
              {kind === "products"
                ? (item as Product).type.toLowerCase()
                : kind === "plans"
                  ? `${(item as Plan).billingPeriod.toLowerCase()} billing`
                  : (item as Discount).scope === "PRODUCT"
                    ? "Selected products"
                    : "Whole subscription"}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "price",
      header: kind === "discounts" ? "Discount" : "Price",
      render: (item) => (
        <span className="number">
          {kind === "products"
            ? formatMoney((item as Product).salesPrice)
            : kind === "plans"
              ? formatMoney((item as Plan).price)
              : (item as Discount).type === "PERCENTAGE"
                ? `${Number((item as Discount).value)}%`
                : formatMoney((item as Discount).value)}
        </span>
      ),
    },
    {
      key: "details",
      header:
        kind === "products"
          ? "Variants"
          : kind === "plans"
            ? "Minimum quantity"
            : "Usage",
      render: (item) =>
        kind === "products"
          ? `${(item as Product).variants.filter((v) => v.isActive).length} options`
          : kind === "plans"
            ? `${(item as Plan).minQuantity} units`
            : `${(item as Discount).usedCount} / ${(item as Discount).usageLimit ?? "unlimited"}`,
    },
    {
      key: "status",
      header: "Status",
      render: (item) => <StatusBadge status={item.isActive} />,
    },
    {
      key: "date",
      header: kind === "discounts" ? "Starts on" : "Created",
      render: (item) =>
        new Intl.DateTimeFormat("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }).format(
          new Date(
            kind === "discounts" ? (item as Discount).startsAt : item.createdAt,
          ),
        ),
    },
    {
      key: "action",
      header: <span className="sr-only">View details</span>,
      align: "right",
      render: (item) => (
        <Link
          className="btn btn-ghost"
          to={`/${kind}/${item.id}`}
          aria-label={`View ${item.name}`}
        >
          <Icon name="arrow" size={15} />
        </Link>
      ),
    },
  ];
  return (
    <>
      <PageHeader
        title={titles[kind]}
        description={descriptions[kind]}
        eyebrow="Catalog"
        actions={
          role === "ADMIN" ? (
            <Link to={`/${kind}/new`} className="btn btn-primary">
              <Icon name="plus" size={15} />
              New {singular[kind]}
            </Link>
          ) : undefined
        }
      />
      <div className="panel">
        <div className="toolbar">
          <div className="toolbar-title">
            All {kind}
            <span className="count-pill">{result.data?.total ?? "—"}</span>
          </div>
          <div className="toolbar-controls">
            <label className="search-field">
              <Icon name="search" size={14} />
              <LibraryInput
                aria-label={`Search ${kind}`}
                placeholder={`Search ${kind}…`}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  update({ search: e.target.value, page: "1" });
                }}
              />
            </label>
            <LibraryNativeSelect
              className="sort-select"
              aria-label={`Sort ${kind}`}
              value={sort}
              onChange={(e) => update({ sort: e.target.value, page: "1" })}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name, A–Z</option>
            </LibraryNativeSelect>
          </div>
        </div>
        <div style={{ padding: result.error ? "0 20px" : 0 }}>
          <ErrorNotice error={result.error} retry={() => result.refetch()} />
        </div>
        {!result.error && (
          <>
            <DataTable
              columns={columns}
              rows={result.data?.data ?? []}
              rowKey={(r) => r.id}
              loading={result.isPending}
              emptyTitle={
                debounced ? "No matches found" : `Your ${kind} start here`
              }
              emptyDescription={
                debounced
                  ? "Try a different name or clear your search."
                  : `Add your first ${singular[kind]} to build your subscription catalog.`
              }
            />
            {result.data && (
              <Pagination
                page={page}
                pageSize={10}
                total={result.data.total}
                onPageChange={(p) => update({ page: String(p) })}
              />
            )}
          </>
        )}
      </div>
      <p className="footer-note">
        <Icon name="shield" size={12} />
        Catalog changes keep existing invoices intact.
      </p>
    </>
  );
}
function CatalogDetail({ kind, id }: { kind: Kind; id: string }) {
  const { role } = useSession();
  const [editing, setEditing] = useState(false);
  const [archive, setArchive] = useState<{
    id: string;
    variant?: boolean;
  } | null>(null);
  const [variant, setVariant] = useState<ProductVariant | null | undefined>();
  const cache = useQueryClient();
  const { notify } = useToast();
  const result = useQuery({
    queryKey: [kind, id],
    queryFn: async () => (await api<Data<Item>>(`/${kind}/${id}`)).data,
  });
  const remove = useMutation({
    mutationFn: async () => {
      if (!archive) return;
      await api(
        `/${kind}/${id}${archive.variant ? "/variants/" + archive.id : ""}`,
        { method: "DELETE" },
      );
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: [kind] });
      setArchive(null);
      notify("Archived. Your historical records are preserved.");
    },
  });
  if (result.isPending) return <Loading />;
  if (result.error)
    return <ErrorNotice error={result.error} retry={() => result.refetch()} />;
  const item = result.data!;
  if (editing)
    return (
      <>
        <Link className="back-link" to={"/" + kind}>
          <Icon name="arrow" size={13} />
          Back to {kind}
        </Link>
        <PageHeader
          title={`Edit ${singular[kind]}`}
          description={item.name}
          eyebrow="Catalog"
        />
        <CatalogForm
          key={item.id}
          kind={kind}
          item={item}
          onCancel={() => setEditing(false)}
        />
      </>
    );
  const details: [string, string | number][] =
    kind === "products"
      ? [
          ["Sales price", formatMoney((item as Product).salesPrice)],
          ["Cost price", formatMoney((item as Product).costPrice)],
          ["Product type", (item as Product).type.toLowerCase()],
          ["Linked taxes", (item as Product).taxIds.length],
          ["Status", item.isActive ? "Active" : "Archived"],
          ["Notes", (item as Product).notes || "No notes added"],
        ]
      : kind === "plans"
        ? [
            ["Plan fee", formatMoney((item as Plan).price)],
            ["Frequency", (item as Plan).billingPeriod.toLowerCase()],
            ["Minimum quantity", (item as Plan).minQuantity],
            ["Available from", (item as Plan).availableFrom ?? "Any date"],
            ["Available until", (item as Plan).availableTo ?? "No end date"],
            ["Linked taxes", (item as Plan).taxIds.length],
          ]
        : [
            [
              "Discount",
              (item as Discount).type === "PERCENTAGE"
                ? `${Number((item as Discount).value)}%`
                : formatMoney((item as Discount).value),
            ],
            [
              "Applies to",
              (item as Discount).scope === "PRODUCT"
                ? `${(item as Discount).productIds.length} selected products`
                : "Whole subscription",
            ],
            [
              "Usage",
              `${(item as Discount).usedCount} / ${(item as Discount).usageLimit ?? "unlimited"}`,
            ],
            ["Starts on", (item as Discount).startsAt],
            ["Ends on", (item as Discount).endsAt ?? "No end date"],
            [
              "Minimum purchase",
              (item as Discount).minPurchase
                ? formatMoney((item as Discount).minPurchase!)
                : "No minimum",
            ],
            [
              "Minimum quantity",
              (item as Discount).minQuantity ?? "No minimum",
            ],
          ];
  return (
    <>
      <Link className="back-link" to={"/" + kind}>
        <Icon name="arrow" size={13} />
        Back to {kind}
      </Link>
      <PageHeader
        title={item.name}
        description={descriptions[kind]}
        eyebrow={titles[kind]}
        actions={
          <>
            <StatusBadge status={item.isActive} />
            {role === "ADMIN" && (
              <>
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  <Icon name="edit" size={14} />
                  Edit {singular[kind]}
                </Button>
                {item.isActive && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      remove.reset();
                      setArchive({ id });
                    }}
                  >
                    Archive
                  </Button>
                )}
              </>
            )}
          </>
        }
      />
      <div className="stack">
        <section className="panel">
          <div className="panel-title">
            <h2>Overview</h2>
            <Icon name={icons[kind]} size={17} />
          </div>
          <dl className="detail-grid">
            {details.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
        {kind === "plans" && (
          <section className="panel">
            <div className="panel-title">
              <h2>Lifecycle permissions</h2>
            </div>
            <div className="detail-grid">
              {[
                ["autoClose", "Automatic closure"],
                ["closableEarly", "Early closure"],
                ["pausable", "Pause & resume"],
                ["renewable", "Renewal"],
              ].map(([key, label]) => (
                <div key={key}>
                  <p className="small muted" style={{ marginBottom: 8 }}>
                    {label}
                  </p>
                  <StatusBadge
                    status={
                      (item as unknown as Record<string, boolean>)[key]
                        ? "Enabled"
                        : "Disabled"
                    }
                  />
                </div>
              ))}
            </div>
          </section>
        )}
        {kind === "products" && (
          <section className="panel">
            <div className="panel-title">
              <div>
                <h2>Variants</h2>
                <p className="cell-secondary">
                  Options that add to the base product price.
                </p>
              </div>
              {role === "ADMIN" && (
                <Button variant="secondary" onClick={() => setVariant(null)}>
                  <Icon name="plus" size={14} />
                  Add variant
                </Button>
              )}
            </div>
            <DataTable<ProductVariant>
              rows={(item as Product).variants}
              rowKey={(v) => v.id}
              emptyTitle="Add another option"
              emptyDescription="Offer a brand, package or service level with its own extra price."
              columns={[
                {
                  key: "name",
                  header: "Variant",
                  render: (v) => (
                    <div>
                      <strong className="cell-primary">{v.value}</strong>
                      <p className="cell-secondary">{v.attribute}</p>
                    </div>
                  ),
                },
                {
                  key: "extra",
                  header: "Extra price",
                  render: (v) => (
                    <span className="number">
                      + {formatMoney(v.extraPrice)}
                    </span>
                  ),
                },
                {
                  key: "effective",
                  header: "Effective price",
                  render: (v) => (
                    <span className="number">
                      {formatMoney(
                        addDisplayMoney(
                          (item as Product).salesPrice,
                          v.extraPrice,
                        ),
                      )}
                    </span>
                  ),
                },
                {
                  key: "status",
                  header: "Status",
                  render: (v) => <StatusBadge status={v.isActive} />,
                },
                {
                  key: "action",
                  header: "",
                  align: "right",
                  render: (v) =>
                    role === "ADMIN" ? (
                      <div className="page-actions">
                        <Button
                          variant="ghost"
                          aria-label={`Edit variant ${v.value}`}
                          onClick={() => setVariant(v)}
                        >
                          <Icon name="edit" size={14} />
                        </Button>
                        {v.isActive && (
                          <Button
                            variant="ghost"
                            onClick={() => {
                              remove.reset();
                              setArchive({ id: v.id, variant: true });
                            }}
                          >
                            Archive
                          </Button>
                        )}
                      </div>
                    ) : null,
                },
              ]}
            />
          </section>
        )}
      </div>
      <ConfirmDialog
        open={archive !== null}
        title={`Archive this ${archive?.variant ? "variant" : singular[kind]}?`}
        description="It will no longer be available for new selections. Existing subscriptions and invoices will keep their records."
        confirmLabel="Archive"
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setArchive(null)}
        error={remove.error}
      />
      {variant !== undefined && (
        <VariantEditor
          productId={id}
          variant={variant}
          onClose={() => setVariant(undefined)}
        />
      )}
    </>
  );
}
function VariantEditor({
  productId,
  variant,
  onClose,
}: {
  productId: string;
  variant: ProductVariant | null;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState({
    attribute: variant?.attribute ?? "",
    value: variant?.value ?? "",
    extraPrice: variant?.extraPrice ?? "0.00",
    isActive: variant?.isActive ?? true,
  });
  const [fields, setFields] = useState<Fields>({});
  const cache = useQueryClient();
  const { notify } = useToast();
  const mutation = useMutation({
    mutationFn: async (data: unknown) =>
      api(`/products/${productId}/variants${variant ? "/" + variant.id : ""}`, {
        method: variant ? "PUT" : "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["products"] });
      notify(variant ? "Variant updated" : "Variant added");
      onClose();
    },
    onError: (error) => setFields(errorsFrom(error)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = z
      .object({
        attribute: z
          .string()
          .trim()
          .min(1, "Enter an attribute")
          .max(80, "Use 80 characters or fewer"),
        value: z
          .string()
          .trim()
          .min(1, "Enter a variant value")
          .max(80, "Use 80 characters or fewer"),
        extraPrice: moneySchema,
        isActive: z.boolean(),
      })
      .safeParse({ ...draft, extraPrice: normalizeMoney(draft.extraPrice) });
    if (!parsed.success) {
      setFields(errorsFrom(parsed.error));
      return;
    }
    setFields({});
    mutation.mutate(parsed.data);
  };
  return (
    <Modal
      open
      title={variant ? "Edit variant" : "Add a variant"}
      onClose={() => {
        if (!mutation.isPending) onClose();
      }}
    >
      <form onSubmit={submit} noValidate>
        <div className="modal-body">
          <ErrorNotice error={mutation.error} />
          <FormField label="Attribute" required error={fields.attribute}>
            <Input
              placeholder="e.g. Brand"
              value={draft.attribute}
              onChange={(e) =>
                setDraft({ ...draft, attribute: e.target.value })
              }
            />
          </FormField>
          <FormField label="Value" required error={fields.value}>
            <Input
              placeholder="e.g. Odoo"
              value={draft.value}
              onChange={(e) => setDraft({ ...draft, value: e.target.value })}
            />
          </FormField>
          <FormField
            label="Extra price · INR"
            required
            error={fields.extraPrice}
            hint="Added once to the product’s base sales price."
          >
            <Input
              inputMode="decimal"
              value={draft.extraPrice}
              onChange={(e) =>
                setDraft({ ...draft, extraPrice: e.target.value })
              }
            />
          </FormField>
          <Toggle
            label="Active"
            checked={draft.isActive}
            onChange={(v) => setDraft({ ...draft, isActive: v })}
          />
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
            {mutation.isPending ? "Saving…" : "Save variant"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
