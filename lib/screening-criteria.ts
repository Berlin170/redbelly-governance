/**
 * The DAO's 11-point checklist for proposals, as written in "DAO Proposal
 * Evaluation Criteria". Kept apart from lib/screening.ts so the browser can
 * render the list without importing anything server-only.
 *
 * `funding` marks the points that only mean something when a proposal asks for
 * DAO money. A signalling vote ("which website design?") has no budget,
 * milestones or co-funding to judge, and failing it for that would block every
 * proposal that is not a grant.
 *
 * `blocking: false` is point 8. The document says to flag missing co-funding
 * but calls it "not a dealbreaker", so a flag there is shown and not enforced.
 */
export interface Criterion {
  id: number;
  title: string;
  checks: string;
  funding: boolean;
  blocking: boolean;
}

export const CRITERIA: Criterion[] = [
  {
    id: 1,
    title: "Budget alignment & limits",
    checks:
      "USDT (external spend) and RBNT (internal rewards) shown separately. " +
      "Request is no more than 25% of the working group's annual allocation. " +
      "Budget is proportional to the work. No buying tokens with DAO funds, " +
      "personal expenses or unverifiable activities. Cost breakdown or " +
      "justification included. The whole DAO has 2,500,000 RBNT and 25,000 " +
      "USDT per quarter across five working groups (Community, Marketing, " +
      "Dev & Builders, Partnerships, Research), and only 90% should ever be " +
      "committed. Flag a missing USDT/RBNT split, an excessive amount, or weak " +
      "justification.",
    funding: true,
    blocking: true,
  },
  {
    id: 2,
    title: "Payment & payout structure",
    checks:
      "Payouts are milestone-based or paid after completion. Any upfront " +
      "payment is clearly justified. Milestones are tied to deliverables. " +
      "Flag large unjustified upfront payments or no milestone structure.",
    funding: true,
    blocking: true,
  },
  {
    id: 3,
    title: "Strategic fit",
    checks:
      "Aligned with a working group (Community, Marketing, Developers/" +
      "Builders) and clearly linked to DAO-wide goals: adoption, awareness, " +
      "infrastructure growth. Flag unclear alignment or vague goals.",
    funding: true,
    blocking: true,
  },
  {
    id: 4,
    title: "Feasibility & timeline",
    checks:
      "Timeline with milestones and deliverables. Scope achievable with the " +
      "budget and resources. Does not duplicate existing efforts. Flag a " +
      "missing timeline, vague milestones or an unrealistic scope.",
    funding: true,
    blocking: true,
  },
  {
    id: 5,
    title: "Oversight & accountability",
    checks:
      "An independent reviewer or oversight lead is nominated. Monthly updates " +
      "in DAO channels are planned. Flag a missing oversight or communication " +
      "plan.",
    funding: true,
    blocking: true,
  },
  {
    id: 6,
    title: "Impact & measurement",
    checks:
      "KPIs or measurable success criteria. Midpoint and final review methods " +
      "defined. Long-term or community value identified. Flag no success " +
      "criteria or a purely short-term focus.",
    funding: true,
    blocking: true,
  },
  {
    id: 7,
    title: "Risk & mitigation",
    checks:
      "Key risks identified and mitigation strategies outlined. Flag if no " +
      "risks or mitigation are described.",
    funding: true,
    blocking: true,
  },
  {
    id: 8,
    title: "Co-funding & leverage",
    checks:
      "Matching funds, sponsorships or in-kind contributions noted. Flag if " +
      "there is no leverage. Not a dealbreaker.",
    funding: true,
    blocking: false,
  },
  {
    id: 9,
    title: "Contribution equity",
    checks:
      "No single contributor dominates payouts. The proposer does not hold " +
      "several paid lead roles without justification. Flag payouts " +
      "concentrated with the same individual(s).",
    funding: true,
    blocking: true,
  },
  {
    id: 10,
    title: "Compliance & ethics",
    checks:
      "No regulatory or reputational risk, consistent with the DAO's code of " +
      "conduct. Flag unclear or non-compliant activities.",
    funding: false,
    blocking: true,
  },
  {
    id: 11,
    title: "Community involvement",
    checks:
      "Evidence of discussion with community members, and co-authors or " +
      "collaborators. Flag if there is no sign of community input.",
    funding: true,
    blocking: true,
  },
];

export type CriterionStatus = "pass" | "flag" | "na";

export interface CriterionResult {
  id: number;
  status: CriterionStatus;
  reason: string;
}

export interface ScreeningResult {
  id: string | null;
  passed: boolean;
  requests_funds: boolean;
  criteria: CriterionResult[];
  model: string;
  created_at?: string;
}

/**
 * Whether a set of answers passes, decided here rather than taken from the
 * model. A model asked "did it pass?" can be talked into yes by the text it is
 * reading; one asked eleven narrow questions and then counted is harder to.
 *
 * A funding proposal needs every blocking point green, and "not applicable"
 * does not count as green there: a grant with no budget section has not
 * earned a pass on budget. A proposal asking for nothing is held only to the
 * points that apply to every proposal.
 */
export function decide(requestsFunds: boolean, results: CriterionResult[]): boolean {
  const byId = new Map(results.map((r) => [r.id, r.status]));
  return CRITERIA.every((c) => {
    if (!c.blocking) return true;
    if (!requestsFunds && c.funding) return true;
    return byId.get(c.id) === "pass";
  });
}
