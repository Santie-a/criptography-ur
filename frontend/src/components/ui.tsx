// Componentes base del sistema de diseño. Solo usan tokens semánticos.
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";

export function Card({ title, hint, actions, children, flush, tone, className = "" }: {
  title?: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  tone?: "ok" | "bad";
  className?: string;
}) {
  return (
    <section className={`card ${tone ? `tone-${tone}` : ""} ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {hint && <div className="hint">{hint}</div>}
          </div>
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      <div className={`card-body ${flush ? "flush" : ""}`}>{children}</div>
    </section>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "danger" | "ghost" | "default";
  size?: "sm" | "md";
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({ variant = "default", size = "md", loading, icon, children, className = "", disabled, ...rest }: BtnProps) {
  return (
    <button
      className={`btn ${variant !== "default" ? variant : ""} ${size === "sm" ? "sm" : ""} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <span className="spinner" aria-hidden /> : icon}
      {children}
    </button>
  );
}

/** Botón que ejecuta una promesa y muestra el estado de carga. */
export function AsyncButton({ onRun, ...rest }: Omit<BtnProps, "onClick"> & { onRun: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      {...rest}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onRun();
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

export function Badge({ tone, children }: { tone?: "accent" | "ok" | "bad" | "warn"; children: ReactNode }) {
  return <span className={`badge ${tone ?? ""}`}>{children}</span>;
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
      title={copied ? "Copiado" : `${value}\n(clic para copiar)`}
      onClick={() => {
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

/** Campo con rótulo. Usa `group` cuando el contenido no es un único input
 *  (por ejemplo botones): un <label> activaría el primero al hacer clic. */
export function Field({ label, children, group }: { label: ReactNode; children: ReactNode; group?: boolean }) {
  if (group) {
    return (
      <div className="field" role="group" aria-label={typeof label === "string" ? label : undefined}>
        <span>{label}</span>
        {children}
      </div>
    );
  }
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value}
          className={value === o.value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Callout({ tone, title, children }: { tone?: "ok" | "bad" | "warn"; title?: ReactNode; children?: ReactNode }) {
  const Icon = tone === "ok" ? CheckCircle2 : tone === "bad" ? XCircle : tone === "warn" ? AlertTriangle : Info;
  return (
    <div className={`callout ${tone ?? ""}`}>
      <Icon size={16} />
      <div className="stack" style={{ gap: 4 }}>
        {title && <strong>{title}</strong>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}

export function Stat({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function PageHead({ eyebrow, title, children, actions }: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}

export function NonceBadge({ kind }: { kind: string }) {
  const map: Record<string, [string, "ok" | "bad" | "accent" | "warn"]> = {
    rfc6979: ["RFC 6979", "ok"],
    random: ["Aleatorio", "accent"],
    weak: ["RNG débil", "bad"],
    constant: ["k fijo", "bad"],
  };
  const [label, tone] = map[kind] ?? [kind, "warn"];
  return <Badge tone={tone}>{label}</Badge>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
}
