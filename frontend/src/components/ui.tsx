// Componentes base. Solo usan tokens semánticos (styles/tokens.css).
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

/* ---------------------------------------------------------------- botones */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "danger" | "ghost" | "default";
  size?: "sm" | "md";
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({ variant = "default", size = "md", loading, icon, children, className = "", disabled, ...rest }: BtnProps) {
  const cls = ["btn", variant !== "default" && variant, size === "sm" && "sm", !children && "icon", className].filter(Boolean).join(" ");
  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {loading ? <span className="spinner" aria-hidden /> : icon}
      {children}
    </button>
  );
}

/** Botón que ejecuta una promesa y muestra la carga mientras espera. */
export function AsyncButton({ onRun, ...rest }: Omit<BtnProps, "onClick"> & { onRun: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button {...rest} loading={busy} onClick={async () => {
      setBusy(true);
      try {
        await onRun();
      } finally {
        setBusy(false);
      }
    }} />
  );
}

/* ---------------------------------------------------------------- estructura */

export interface Crumb {
  label: string;
  href?: string;
}

export function PageHeader({ crumbs, title, sub, actions, tabs }: {
  crumbs: Crumb[];
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
}) {
  return (
    <header className="page-header">
      <nav className="breadcrumb" aria-label="Ruta">
        {crumbs.map((c, i) => (
          <Fragment key={i}>
            {i > 0 && <span className="sep">/</span>}
            {c.href ? <a href={c.href}>{c.label}</a> : <span>{c.label}</span>}
          </Fragment>
        ))}
      </nav>
      <div className="page-title">
        <div>
          <h1>{title}</h1>
          {sub && <div className="sub">{sub}</div>}
        </div>
        {actions && <div className="row">{actions}</div>}
      </div>
      {tabs}
    </header>
  );
}

export function Panel({ title, meta, actions, children, flush, tone, className = "" }: {
  title?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  tone?: "ok" | "bad";
  className?: string;
}) {
  return (
    <section className={`panel ${tone ? `tone-${tone}` : ""} ${className}`}>
      {(title || actions) && (
        <div className="panel-head">
          <h2>{title}{meta && <span className="meta">{meta}</span>}</h2>
          {actions && <div className="row-nowrap">{actions}</div>}
        </div>
      )}
      <div className={`panel-body ${flush ? "flush" : ""}`}>{children}</div>
    </section>
  );
}

export function Inspector({ title, actions, onClose, children }: {
  title: ReactNode;
  actions?: ReactNode;
  onClose?: () => void;
  children: ReactNode;
}) {
  return (
    <aside className="inspector" aria-label="Detalle">
      <div className="inspector-head">
        <h2>{title}</h2>
        <div className="row-nowrap">
          {actions}
          {onClose && <Button variant="ghost" size="sm" icon={<X size={14} />} onClick={onClose} aria-label="Cerrar detalle" />}
        </div>
      </div>
      <div className="inspector-body">{children}</div>
    </aside>
  );
}

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="inspector-section">
      <div className="spread"><div className="section-title">{title}</div>{actions}</div>
      {children}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: ReactNode }[];
}) {
  return (
    <div className="tabs" role="tablist">
      {items.map((it) => (
        <button key={it.value} role="tab" aria-selected={value === it.value} className={value === it.value ? "on" : ""}
          onClick={() => onChange(it.value)}>{it.label}</button>
      ))}
    </div>
  );
}

export function Switcher<T extends string>({ value, onChange, items, label }: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: ReactNode }[];
  label: string;
}) {
  return (
    <div className="switcher" role="radiogroup" aria-label={label}>
      {items.map((it) => (
        <button key={it.value} type="button" role="radio" aria-checked={value === it.value}
          className={value === it.value ? "on" : ""} onClick={() => onChange(it.value)}>{it.label}</button>
      ))}
    </div>
  );
}

/** Diálogo modal nativo (<dialog>): foco atrapado y Esc para cerrar sin JS extra. */
export function Modal({ open, onClose, kicker, title, children, footer }: {
  open: boolean;
  onClose: () => void;
  kicker?: string;
  title: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" onClose={onClose} onCancel={onClose}>
      <div className="modal-head">
        <div>
          {kicker && <div className="kicker">{kicker}</div>}
          <h2>{title}</h2>
        </div>
        <Button variant="ghost" icon={<X size={16} />} onClick={onClose} aria-label="Cerrar" />
      </div>
      <div className="modal-body">{children}</div>
      <div className="modal-foot">{footer}</div>
    </dialog>
  );
}

/* ---------------------------------------------------------------- datos */

export function Field({ label, help, children, group }: { label: ReactNode; help?: ReactNode; children: ReactNode; group?: boolean }) {
  const content = (
    <>
      <span className="label">{label}</span>
      {children}
      {help && <span className="help">{help}</span>}
    </>
  );
  // Un <label> que envuelve botones activaría el primero al hacer clic en el rótulo.
  return group
    ? <div className="field" role="group" aria-label={typeof label === "string" ? label : undefined}>{content}</div>
    : <label className="field">{content}</label>;
}

export function Tag({ tone, children }: { tone?: "accent" | "ok" | "bad" | "warn"; children: ReactNode }) {
  return <span className={`tag ${tone ?? ""}`}>{children}</span>;
}

export function NonceTag({ kind }: { kind: string }) {
  const map: Record<string, [string, "ok" | "bad" | "accent" | "warn"]> = {
    rfc6979: ["RFC 6979", "ok"],
    random: ["Aleatorio", "accent"],
    weak: ["RNG débil", "bad"],
    constant: ["k fijo", "bad"],
  };
  const [label, tone] = map[kind] ?? [kind, "warn"];
  return <Tag tone={tone}>{label}</Tag>;
}

export function shortHex(h: string, n = 8): string {
  return h.length <= 2 * n + 1 ? h : `${h.slice(0, n)}…${h.slice(-n)}`;
}

/** Valor hexadecimal abreviado; clic para copiarlo completo. */
export function Hex({ value, n = 8, full, tone }: { value: string; n?: number; full?: boolean; tone?: "bad" | "ok" | "accent" }) {
  const [copied, setCopied] = useState(false);
  return (
    <code
      className={`hex ${full ? "full" : ""} ${tone ? `hl-${tone}` : ""}`}
      title={copied ? "Copiado" : `${value}\nClic para copiar`}
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      {full ? value : shortHex(value, n)}
    </code>
  );
}

export function Notice({ tone, title, children, actions }: {
  tone?: "ok" | "bad" | "warn";
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const Icon = tone === "ok" ? CheckCircle2 : tone === "bad" ? XCircle : tone === "warn" ? AlertTriangle : Info;
  return (
    <div className={`notice ${tone ?? ""}`} role={tone === "bad" ? "alert" : undefined}>
      <Icon size={16} />
      <div className="stack-sm" style={{ gap: 2 }}>
        {title && <strong>{title}</strong>}
        {children && <div>{children}</div>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function Metrics({ items }: { items: { label: string; value: ReactNode; sub?: ReactNode; tone?: "bad" }[] }) {
  return (
    <div className="metrics">
      {items.map((m) => (
        <div key={m.label} className="metric">
          <div className="label">{m.label}</div>
          <div className={`value ${m.tone ?? ""}`}>{m.value}</div>
          {m.sub && <div className="sub">{m.sub}</div>}
        </div>
      ))}
    </div>
  );
}

export function Empty({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return <div className="empty">{icon && <div>{icon}</div>}{children}</div>;
}

export function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
}

export function fmtAgo(ts: number): string {
  const s = Math.max(0, Math.round(Date.now() / 1000 - ts));
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} d`;
}

export function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}
