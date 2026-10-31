import { ApiError } from '../../lib/api';
import { Notice } from './ui';

/** Field errors from a 422 (`{ fields: { 'lines.0.quantity': ['...'] } }`), or an empty object for any other error. */
export function fieldErrors(error: unknown): Record<string, string[]> {
  return error instanceof ApiError ? error.body.error.fields ?? {} : {};
}

/** A human message for any failure; the server's own wording is shown as-is because it is written for people. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Your session has ended. Please sign in again.';
    if (error.status === 403) return 'Your role is not allowed to do this.';
    if (error.status === 501) return 'This feature is not available on the server yet.';
    return error.body.error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

/** Shows an API error, including the per-field messages of a validation failure. */
export function ErrorNotice({ error, title }: { error: unknown; title?: string }) {
  if (!error) return null;
  const fields = fieldErrors(error);
  return <Notice tone="error" title={title ?? errorMessage(error)}>{Object.keys(fields).length > 0 && <ul className="list-disc pl-5">{Object.entries(fields).map(([name, messages]) => <li key={name}><span className="font-medium">{name.replace(/\./g, ' › ')}</span>: {messages.join(' ')}</li>)}</ul>}</Notice>;
}

/** Whether a failure means "ask the server again later" rather than "your input was wrong". */
export const isRetryable = (error: unknown) => !(error instanceof ApiError) || error.status >= 500;
