import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ErrorNotice } from '../../../components/ops/errors';
import { Notice, Spinner } from '../../../components/ops/ui';
import { useSaveSubscription, useSubscription } from '../api';
import { SubscriptionForm } from '../components/SubscriptionForm';

export default function SubscriptionFormPage() {
  const { id } = useParams(); const navigate = useNavigate();
  const existing = useSubscription(id);
  const save = useSaveSubscription(id);
  const back = id ? `/subscriptions/${id}` : '/subscriptions';
  if (id && existing.isLoading) return <div className="flex justify-center p-10"><Spinner /></div>;
  if (id && (existing.error || !existing.data)) return <ErrorNotice error={existing.error} title="The subscription could not be loaded" />;
  const editable = !existing.data || existing.data.status === 'DRAFT' || existing.data.status === 'QUOTATION';
  return <>
    <PageHeader title={existing.data ? `Edit ${existing.data.number}` : 'New subscription'} />
    {editable
      ? <SubscriptionForm subscription={existing.data} saving={save.isPending} error={save.error} onCancel={() => navigate(back)} onSubmit={input => save.mutate(input, { onSuccess: s => navigate(`/subscriptions/${s.id}`) })} />
      : <Notice tone="warning" title="This subscription can no longer be edited">Only draft and quotation subscriptions can be edited. Use &ldquo;Change seats / products&rdquo; on the <Link className="underline" to={back}>subscription page</Link> instead.</Notice>}
  </>;
}
