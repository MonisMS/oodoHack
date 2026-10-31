import { Input as LibraryInput } from "./primitives/input";
import { useState, useId } from "react";
import { Icon } from "./Icon";
export const passwordRules = [
  { label: "9+ characters", check: (v: string) => v.length >= 9 },
  { label: "Uppercase letter", check: (v: string) => /[A-Z]/.test(v) },
  { label: "Lowercase letter", check: (v: string) => /[a-z]/.test(v) },
  {
    label: "Special character",
    check: (v: string) => /[^A-Za-z0-9\s]/.test(v),
  },
];
export function PasswordInput({
  value,
  onChange,
  label = "Password",
  checklist = false,
  autoComplete = "current-password",
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  checklist?: boolean;
  autoComplete?: string;
  error?: string[];
}) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  return (
    <div className={`field ${error?.length ? "field-invalid" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <div className="password-wrap">
        <LibraryInput
          className="input"
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error?.length)}
          aria-describedby={error?.length ? id + "-error" : undefined}
        />
        <button
          type="button"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          <Icon name="eye" size={17} />
        </button>
      </div>
      {checklist && (
        <div className="password-checks">
          {passwordRules.map((rule) => (
            <span key={rule.label} className={rule.check(value) ? "met" : ""}>
              <Icon name={rule.check(value) ? "check" : "info"} />
              {rule.label}
            </span>
          ))}
        </div>
      )}
      {error?.length ? (
        <p className="field-error" id={id + "-error"} role="alert">
          {error.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
