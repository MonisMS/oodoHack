import { NativeSelect as LibraryNativeSelect } from "../ui/primitives/native-select";
import { useEffect, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { nav } from "../../config/nav";
import { useSession } from "../../lib/session";
import { Button, ToastProvider, useToast } from "../ui/kit";
import { Icon } from "../ui/Icon";
import type { Role } from "../../types/api";
export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Brightloop home">
      <span className="brand-mark">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <path d="M7 7a5 5 0 1 1 0 10H5V7h2Zm10 0a5 5 0 1 0 0 10h2V7h-2Z" />
        </svg>
      </span>
      brightloop<span style={{ color: "#8c8e96", fontSize: 18 }}>.</span>
    </Link>
  );
}
const icons: Record<string, string> = {
  "/dashboard": "grid",
  "/portal": "grid",
  "/subscriptions": "repeat",
  "/quotation-templates": "file",
  "/invoices": "file",
  "/billing": "refresh",
  "/payments": "credit",
  "/products": "box",
  "/plans": "layers",
  "/discounts": "tag",
  "/taxes": "settings",
  "/users/customers": "users",
  "/users/staff": "shield",
  "/portal/subscriptions": "repeat",
  "/portal/invoices": "file",
};
const groups = [
  {
    label: "Workspace",
    paths: [
      "/portal",
      "/dashboard",
      "/portal/subscriptions",
      "/portal/invoices",
    ],
  },
  {
    label: "Revenue",
    paths: [
      "/subscriptions",
      "/quotation-templates",
      "/invoices",
      "/payments",
      "/billing",
    ],
  },
  { label: "Catalog", paths: ["/products", "/plans", "/discounts", "/taxes"] },
  { label: "People", paths: ["/users/customers", "/users/staff"] },
];
function Shell() {
  const { user, role, dev, setRole, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const asideRef = useRef<HTMLElement>(null);
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width: 760px)").matches,
  );
  const [leaving, setLeaving] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const { notify } = useToast();
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => setMobile(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!mobile || !open) return;
    const controls = () =>
      Array.from(
        asideRef.current?.querySelectorAll<HTMLElement>(
          "a[href],button:not(:disabled),select,input:not(:disabled)",
        ) ?? [],
      );
    controls()[0]?.focus();
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        requestAnimationFrame(() =>
          document.getElementById("workspace-menu-toggle")?.focus(),
        );
      }
      if (event.key === "Tab") {
        const items = controls();
        const first = items[0],
          last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keys);
    return () => document.removeEventListener("keydown", keys);
  }, [mobile, open]);
  const authPage = [
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
  ].includes(location.pathname);
  if (authPage) return <Outlet />;
  const current = [...nav]
    .sort((a, b) => b.to.length - a.to.length)
    .find(
      (n) =>
        location.pathname === n.to || location.pathname.startsWith(n.to + "/"),
    );
  const group = groups.find((g) => current && g.paths.includes(current.to));
  const logout = async () => {
    setLeaving(true);
    const result = await signOut();
    setLeaving(false);
    if (result.ok) {
      cache.clear();
      navigate("/login");
    } else notify(result.message);
  };
  return (
    <div>
      <a href="#main" className="sr-only focus:not-sr-only">
        Skip to content
      </a>
      {open && (
        <button
          className="nav-overlay"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        ref={asideRef}
        inert={mobile && !open}
        aria-hidden={mobile && !open ? true : undefined}
        className={`app-sidebar ${open ? "is-open" : ""}`}
        aria-label="Main navigation"
      >
        <Brand />
        <p className="workspace-name">Brightloop Software</p>
        <nav className="sidebar-nav">
          {groups.map((g) => {
            const items = nav.filter(
              (n) => g.paths.includes(n.to) && role && n.roles.includes(role),
            );
            return items.length ? (
              <div className="nav-group" key={g.label}>
                <p className="nav-label">{g.label}</p>
                {items.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.to === "/portal"}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      `nav-link ${isActive ? "active" : ""}`
                    }
                  >
                    <Icon name={icons[n.to]} />
                    {n.label === "Run billing" ? "Billing runs" : n.label}
                  </NavLink>
                ))}
              </div>
            ) : null;
          })}
        </nav>
        {dev && (
          <label className="small muted" style={{ marginBottom: 16 }}>
            Development role
            <LibraryNativeSelect
              className="input"
              value={role ?? "ADMIN"}
              onChange={(e) => {
                cache.clear();
                setRole(e.target.value as Role);
              }}
            >
              <option>ADMIN</option>
              <option>STAFF</option>
              <option>CUSTOMER</option>
            </LibraryNativeSelect>
          </label>
        )}
        <div className="sidebar-footer">
          <div className="avatar">
            {(user?.name ?? "Workspace")
              .split(" ")
              .map((n) => n[0])
              .slice(0, 2)
              .join("")}
          </div>
          <div className="sidebar-user">
            <strong>{user?.name ?? "Your workspace"}</strong>
            <span>{role?.toLowerCase() ?? "Signed out"}</span>
          </div>
          {user ? (
            <Button
              variant="ghost"
              aria-label="Sign out"
              disabled={leaving}
              onClick={logout}
            >
              <Icon name="logout" size={16} />
            </Button>
          ) : (
            <Link to="/login" className="text-link small">
              Sign in
            </Link>
          )}
        </div>
      </aside>
      <div className="app-main" inert={mobile && open}>
        <header className="app-topbar">
          <div className="breadcrumb">
            <Button
              variant="ghost"
              className="mobile-nav-button"
              aria-label="Open navigation"
              id="workspace-menu-toggle"
              onClick={() => setOpen(true)}
            >
              <Icon name="menu" />
            </Button>
            <span>{group?.label ?? "Workspace"}</span>
            <Icon name="chevron" size={11} />
            <strong>{current?.label ?? "Brightloop"}</strong>
          </div>
          <div className="topbar-right">
            <span className="date-label">
              {new Intl.DateTimeFormat("en-IN", {
                month: "long",
                day: "numeric",
                year: "numeric",
              }).format(new Date())}
            </span>
            <span>
              <i className="workspace-dot" />
              INR
            </span>
          </div>
        </header>
        <main id="main" className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
export function AppLayout() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}
