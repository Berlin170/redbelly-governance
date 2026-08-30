import { LatticePanel } from "@/components/art/lattice";

/**
 * The title block every route except the overview wears.
 *
 * The overview has the full drawn hero; these pages had a bare `h1` on the
 * page background, so moving between them felt like moving between two
 * different products. This is the same visual language at a fraction of the
 * volume — a quiet lattice behind the title, enough to belong, not enough to
 * compete with a form or a table sitting directly beneath it.
 */
export function PageHead({
  title,
  children,
  action,
}: {
  title: string;
  /** Supporting line under the title. */
  children?: React.ReactNode;
  /** Optional control pinned to the right. */
  action?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card px-5 py-5 shadow-card sm:px-6">
      <LatticePanel className="pointer-events-none absolute inset-0" />

      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="display-wide text-2xl leading-tight">{title}</h1>
          {children && (
            <div className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {children}
            </div>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}
