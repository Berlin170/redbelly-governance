import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const styles = {
  active:
    "border-status-active/30 bg-status-active/10 text-status-active",
  pending:
    "border-status-pending/30 bg-status-pending/10 text-status-pending",
  closed: "border-border bg-secondary/60 text-muted-foreground",
} as const;

const labels = {
  active: "Active",
  pending: "Not open yet",
  closed: "Closed",
} as const;

export function StatusBadge({
  state,
  className,
}: {
  state: keyof typeof styles;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(styles[state], className)}>
      {state === "active" && (
        <span className="mr-1.5 size-1.5 rounded-full bg-status-active" />
      )}
      {labels[state]}
    </Badge>
  );
}
