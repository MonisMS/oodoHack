import { NativeSelect as LibraryNativeSelect } from "../../../components/ui/primitives/native-select";
import { PageHeader } from "../../../components/ui/PageHeader";
import {
  DataTable,
  Field,
  Pagination,
  inputClass,
} from "../../../components/ops/ui";
import { label } from "../../../components/ops/format";
import { useListParams } from "../../../components/ops/hooks";
import type { SubscriptionStatus } from "../../../types/api";
import { usePortalSubscriptions } from "../api";
import { QueryState, subscriptionColumns } from "../components/Shared";

const STATUSES: SubscriptionStatus[] = [
  "ACTIVE",
  "CONFIRMED",
  "PAUSED",
  "CLOSED",
];

export default function SubscriptionsPage() {
  const { get, set, query } = useListParams(10);
  const result = usePortalSubscriptions({
    ...query(),
    sortBy: "createdAt",
    sortOrder: "desc",
  });
  const filtered = Boolean(get("status"));
  return (
    <div className="space-y-4">
      <PageHeader
        title="My subscriptions"
        description="The plans you are subscribed to."
      />
      <Field label="Status" className="max-w-xs">
        {(p) => (
          <LibraryNativeSelect
            {...p}
            className={inputClass}
            value={get("status")}
            onChange={(e) => set({ status: e.target.value })}
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </LibraryNativeSelect>
        )}
      </Field>
      {result.isError ? (
        <QueryState
          loading={false}
          error={result.error}
          onRetry={() => void result.refetch()}
        />
      ) : (
        <>
          <DataTable
            caption="My subscriptions"
            columns={subscriptionColumns}
            rows={result.data?.data}
            rowKey={(s) => s.id}
            loading={result.isLoading}
            empty={
              filtered
                ? "No subscriptions match this filter."
                : "You have no subscriptions yet."
            }
          />
          {result.data && result.data.total > 0 && (
            <Pagination
              page={result.data.page}
              pageSize={result.data.pageSize}
              total={result.data.total}
              onPage={(page) => set({ page })}
            />
          )}
        </>
      )}
    </div>
  );
}
