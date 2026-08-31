import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Per-proposal metadata. The page itself is a client component because it
 * polls for votes, so the title and share card live here where they can be
 * resolved on the server.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  const { data } = await supabaseAdmin()
    .from("proposals")
    .select("title, body")
    .eq("id", id)
    .maybeSingle();

  if (!data) return { title: "Proposal — Redbelly DAO" };

  /*
    Cut at a word, not at a character.

    A flat slice ends wherever 180 characters happen to land, which in Discord
    read "...tick EVERY candidate y" — the truncation looked like a broken
    page rather than a summary. Back up to the last space and add an ellipsis
    so the description ends on a word and says it was shortened. A body with
    no space in its first 180 characters keeps the hard cut, since there is
    nowhere better to break it.
  */
  const flat = (data.body ?? "").replace(/\s+/g, " ").trim();
  let summary = flat;
  if (flat.length > 180) {
    const cut = flat.slice(0, 180);
    const lastSpace = cut.lastIndexOf(" ");
    summary = (lastSpace > 100 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.—-]+$/, "") + "…";
  }
  if (!summary) summary = "Gasless signature voting for the Redbelly DAO.";

  return {
    title: `${data.title} — Redbelly DAO`,
    description: summary,
    openGraph: { title: data.title, description: summary, type: "article" },
    twitter: { card: "summary_large_image", title: data.title, description: summary },
  };
}

export default function ProposalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
