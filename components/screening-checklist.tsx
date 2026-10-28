import { CircleAlert, CircleCheck, CircleMinus } from "lucide-react";
import { CRITERIA, type ScreeningResult } from "@/lib/screening-criteria";

/**
 * The 11-point check, one row per point: what the reviewer saw and, for a
 * flag, what to add. Shared by /create, where the author fixes flags, and the
 * proposal page, where voters can see what a proposal passed on.
 */
export function ScreeningChecklist({ result }: { result: ScreeningResult }) {
  const byId = new Map(result.criteria.map((c) => [c.id, c]));

  return (
    <ol className="space-y-2.5">
      {CRITERIA.map((criterion) => {
        const answer = byId.get(criterion.id);
        const status = answer?.status ?? "flag";
        const advisory = status === "flag" && !criterion.blocking;

        return (
          <li key={criterion.id} className="flex gap-2.5 text-sm">
            {status === "pass" ? (
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-status-passed" aria-label="Pass" />
            ) : status === "na" ? (
              <CircleMinus className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Not applicable" />
            ) : (
              <CircleAlert
                className={`mt-0.5 size-4 shrink-0 ${advisory ? "text-status-pending" : "text-status-rejected"}`}
                aria-label="Flagged"
              />
            )}
            <div className="min-w-0 space-y-0.5">
              <p className="font-medium">
                {criterion.id}. {criterion.title}
                {advisory && (
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    advisory, does not block
                  </span>
                )}
                {status === "na" && (
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    no funds requested
                  </span>
                )}
              </p>
              {answer?.reason && (
                <p className="text-xs leading-relaxed text-muted-foreground">{answer.reason}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
