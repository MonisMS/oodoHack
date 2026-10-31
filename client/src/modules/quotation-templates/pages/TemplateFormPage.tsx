import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ErrorNotice } from '../../../components/ops/errors';
import { Spinner } from '../../../components/ops/ui';
import { useSaveTemplate, useTemplate } from '../api';
import { TemplateForm } from '../components/TemplateForm';

export default function TemplateFormPage() {
  const { id } = useParams(); const navigate = useNavigate();
  const existing = useTemplate(id);
  const save = useSaveTemplate(id);
  const back = id ? `/quotation-templates/${id}` : '/quotation-templates';
  if (id && existing.isLoading) return <div className="flex justify-center p-10"><Spinner /></div>;
  if (id && existing.error) return <ErrorNotice error={existing.error} title="The template could not be loaded" />;
  return <>
    <PageHeader title={id ? 'Edit template' : 'New template'} />
    <TemplateForm template={existing.data} saving={save.isPending} error={save.error} onCancel={() => navigate(back)}
      onSubmit={input => save.mutate(input, { onSuccess: t => navigate(`/quotation-templates/${t.id}`) })} />
  </>;
}
