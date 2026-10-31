import { useEffect, useState, type FormEvent } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { Brand } from "../../../components/layout/AppLayout";
import { Button, FormField, Input } from "../../../components/ui/kit";
import { Icon } from "../../../components/ui/Icon";
import { PasswordInput } from "../../../components/ui/PasswordInput";
import { useSession } from "../../../lib/session";
import { errorsFrom, type Fields } from "../../../lib/catalog-client";
import { authSchema } from "../validation";
const content = {
  login: {
    eyebrow: "YOUR WORKSPACE, TOGETHER",
    title: "Welcome back.",
    description: "Sign in to keep your subscription business moving.",
    button: "Sign in",
  },
  signup: {
    eyebrow: "A GOOD PLACE TO START",
    title: "Create your account.",
    description: "A little less admin. A lot more clarity.",
    button: "Create account",
  },
  forgot: {
    eyebrow: "LET’S GET YOU BACK IN",
    title: "Forgot your password?",
    description: "Enter your registered email and we’ll help you reset it.",
    button: "Send reset link",
  },
  reset: {
    eyebrow: "A FRESH START",
    title: "Choose a new password.",
    description: "Make it strong and keep it somewhere safe.",
    button: "Update password",
  },
};
export default function IndexPage(_props: { title?: string }) {
  const location = useLocation();
  const mode =
    location.pathname === "/signup"
      ? "signup"
      : location.pathname === "/forgot-password"
        ? "forgot"
        : location.pathname === "/reset-password"
          ? "reset"
          : "login";
  return <AuthForm key={mode} mode={mode} />;
}
// One-click demo sign-in for testers and judges. Shown only when VITE_DEMO_LOGINS=true (the seeded demo accounts; never enable on real data).
const DEMO_PASSWORD = "Brightloop!2026";
const DEMO_ACCOUNTS = [
  { label: "Admin", icon: "shield", email: "admin@brightloop.local", note: "Full access" },
  { label: "Staff", icon: "settings", email: "priya@brightloop.local", note: "Billing work" },
  { label: "Customer", icon: "users", email: "billing@acme.example", note: "Portal view" },
] as const;
function DemoLogins({ disabled, onPick }: { disabled: boolean; onPick: (email: string, password: string) => void }) {
  if (import.meta.env.VITE_DEMO_LOGINS !== "true") return null;
  return (
    <section aria-label="Demo accounts" style={{ marginTop: 26 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--muted)", fontSize: 13 }}>
        <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
        <span>or explore with a demo account</span>
        <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
      </div>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(3, 1fr)", marginTop: 14 }}>
        {DEMO_ACCOUNTS.map((a) => (
          <button key={a.label} type="button" disabled={disabled} onClick={() => onPick(a.email, DEMO_PASSWORD)} title={`Sign in as ${a.email}`}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "14px 6px", borderRadius: 12, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1, font: "inherit" }}>
            <span aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: 999, background: "var(--soft)", color: "var(--accent)" }}><Icon name={a.icon} size={17} /></span>
            <strong style={{ fontSize: 14 }}>{a.label}</strong>
            <span className="small muted" style={{ fontSize: 12 }}>{a.note}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
function AuthForm({ mode }: { mode: keyof typeof content }) {
  const { status, role, signIn, signUp, requestReset, resetPassword } =
    useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [fields, setFields] = useState<Fields>({});
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const c = content[mode];
  useEffect(() => {
    if ((mode === "login" || mode === "signup") && status === "authenticated") {
      const from = (location.state as { from?: string } | null)?.from;
      const safe =
        from?.startsWith("/") && !from.startsWith("//") ? from : undefined;
      navigate(role === "CUSTOMER" ? "/portal" : (safe ?? "/dashboard"), {
        replace: true,
      });
    }
  }, [status, role, mode, navigate, location.state]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const parsed = authSchema(mode).safeParse({ name, email, password });
    if (!parsed.success) {
      setFields(errorsFrom(parsed.error));
      return;
    }
    setFields({});
    if (mode === "reset" && !params.get("token")) {
      setError(
        "This reset link is incomplete. Request a new link to continue.",
      );
      return;
    }
    setPending(true);
    try {
      const input = parsed.data;
      const result =
        mode === "login"
          ? await signIn({ email: input.email, password: input.password })
          : mode === "signup"
            ? await signUp(input)
            : mode === "forgot"
              ? await requestReset({ email: input.email })
              : await resetPassword({
                  token: params.get("token")!,
                  password: input.password,
                });
      if (!result.ok) {
        setError(
          result.code === "INVALID_TOKEN" ||
            result.code === "INVALID_RESET_TOKEN"
            ? "This link has expired or was already used. Please request a new one."
            : result.message,
        );
        setPending(false);
      } else if (mode === "forgot" || mode === "reset") {
        setSuccess(true);
        setPending(false);
      }
    } catch {
      setError("We couldn’t complete that request. Please try again.");
      setPending(false);
    }
  };
  const demoLogin = async (demoEmail: string, demoPassword: string) => {
    setError("");
    setFields({});
    setEmail(demoEmail);
    setPassword(demoPassword);
    setPending(true);
    const result = await signIn({ email: demoEmail, password: demoPassword });
    if (!result.ok) {
      setError(result.code === "INVALID_EMAIL_OR_PASSWORD" ? "The demo accounts are not set up on this server. Run the seed (npm run db:seed)." : result.message);
      setPending(false);
    }
  };
  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <Brand />
        <div className="auth-story-content">
          <div className="orbit-art" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className="eyebrow">A LITTLE MORE CLARITY</p>
          <h1>
            Your subscriptions.
            <br />
            In good order.
          </h1>
          <p>
            One considered workspace for your plans, customers and recurring
            revenue.
          </p>
        </div>
        <div className="auth-story-footer">
          <span>Brightloop Software</span>
          <span>Made for the everyday.</span>
        </div>
      </aside>
      <main className="auth-form-wrap">
        <div className="auth-form">
          <div className="auth-mobile-brand">
            <Brand />
          </div>
          <p className="eyebrow">{c.eyebrow}</p>
          {success ? (
            <div className="auth-success">
              <span className="empty-icon">
                <Icon name={mode === "forgot" ? "mail" : "check"} size={25} />
              </span>
              <h2>
                {mode === "forgot" ? "Check your email." : "Password updated."}
              </h2>
              <p className="auth-subtitle">
                {mode === "forgot"
                  ? "If an account matches that address, a reset link will be sent. For your security, the response is the same for every email."
                  : "Your new password is ready. Sign in to return to your workspace."}
              </p>
              <Link to="/login" className="btn btn-primary">
                Back to sign in
                <Icon name="arrow" size={14} />
              </Link>
            </div>
          ) : (
            <>
              <h1>{c.title}</h1>
              <p className="auth-subtitle">{c.description}</p>
              <form onSubmit={submit} noValidate>
                <div className="auth-fields">
                  {mode === "signup" && (
                    <FormField label="Full name" error={fields.name}>
                      <Input
                        autoComplete="name"
                        value={name}
                        placeholder="Your name"
                        onChange={(e) => setName(e.target.value)}
                      />
                    </FormField>
                  )}
                  {mode !== "reset" && (
                    <FormField label="Email address" error={fields.email}>
                      <Input
                        type="email"
                        autoComplete="email"
                        value={email}
                        placeholder="you@company.com"
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </FormField>
                  )}
                  {mode !== "forgot" && (
                    <PasswordInput
                      value={password}
                      onChange={setPassword}
                      checklist={mode !== "login"}
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                      error={fields.password}
                    />
                  )}
                </div>
                {error && (
                  <div className="notice notice-error" role="alert">
                    <Icon name="info" size={16} />
                    <span>
                      {error}
                      {mode === "reset" && (
                        <>
                          {" "}
                          <Link className="text-link" to="/forgot-password">
                            Request a new link
                          </Link>
                        </>
                      )}
                    </span>
                  </div>
                )}
                <Button
                  type="submit"
                  disabled={
                    pending ||
                    ((mode === "login" || mode === "signup") &&
                      status === "loading")
                  }
                  style={{ marginTop: 25 }}
                >
                  {pending ? "Please wait…" : c.button}
                  <Icon name="arrow" size={15} />
                </Button>
              </form>
              {mode === "login" && <DemoLogins disabled={pending || status === "loading"} onPick={demoLogin} />}
              <div className="auth-links">
                {mode === "login" ? (
                  <>
                    <span>
                      New here?{" "}
                      <Link className="text-link" to="/signup">
                        Create an account
                      </Link>
                    </span>
                    <Link className="text-link" to="/forgot-password">
                      Forgot password?
                    </Link>
                  </>
                ) : (
                  <Link className="text-link" to="/login">
                    ← Back to sign in
                  </Link>
                )}
              </div>
              <p className="auth-footer">
                <Icon
                  name="shield"
                  size={12}
                  style={{
                    display: "inline-block",
                    verticalAlign: "middle",
                    marginRight: 5,
                  }}
                />
                Your account. Your subscriptions. Securely connected.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
