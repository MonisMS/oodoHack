import type { ReactNode } from 'react';
import { ErrorNotice } from '../../../components/ops/errors';
import { Button, Modal } from '../../../components/ops/ui';

/** Confirmation step for irreversible actions: says exactly what will happen and shows the server's refusal, if any. */
export function ConfirmDialog({ title, confirmLabel, danger, busy, error, onConfirm, onClose, children }: {
  title: string; confirmLabel: string; danger?: boolean; busy?: boolean; error?: unknown; onConfirm: () => void; onClose: () => void; children: ReactNode;
}) {
  return <Modal title={title} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} busy={busy} onClick={onConfirm}>{confirmLabel}</Button></>}>
    <div className="space-y-3 text-sm text-slate-700"><div>{children}</div><ErrorNotice error={error} /></div>
  </Modal>;
}
