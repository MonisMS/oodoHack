import { NativeSelect as LibraryNativeSelect } from "../../../components/ui/primitives/native-select";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ErrorNotice } from "../../../components/ops/errors";
import {
  Button,
  Field,
  inputClass,
  Modal,
  Notice,
} from "../../../components/ops/ui";
import { CreateSubscriptionModal } from "../../quotation-templates/components/CreateSubscriptionModal";
import { useActiveTemplates } from "../api";

/** Step 1: choose an active template. Step 2: the template module's own create-subscription form. */
export function FromTemplateModal({ onClose }: { onClose: () => void }) {
  const { data, isLoading, error } = useActiveTemplates(true);
  const [templateId, setTemplateId] = useState("");
  const templates = data?.data.filter((t) => t.isActive) ?? [];
  const chosen = templates.find((t) => t.id === templateId);
  const [confirmed, setConfirmed] = useState(false);
  if (chosen && confirmed)
    return <CreateSubscriptionModal template={chosen} onClose={onClose} />;
  return (
    <Modal
      title="Create subscription from a template"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!chosen}
            onClick={() => setConfirmed(true)}
          >
            Continue
          </Button>
        </>
      }
    >
      {error ? (
        <ErrorNotice error={error} title="Templates could not be loaded" />
      ) : !isLoading && templates.length === 0 ? (
        <Notice tone="info" title="No active templates">
          Create one first on the{" "}
          <Link className="underline" to="/quotation-templates/new">
            new template
          </Link>{" "}
          page.
        </Notice>
      ) : (
        <Field label="Template">
          {(f) => (
            <LibraryNativeSelect
              {...f}
              className={inputClass}
              value={templateId}
              disabled={isLoading}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              <option value="">
                {isLoading ? "Loading templates…" : "Select a template"}
              </option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.planName}
                </option>
              ))}
            </LibraryNativeSelect>
          )}
        </Field>
      )}
    </Modal>
  );
}
