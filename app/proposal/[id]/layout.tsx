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

  const summary =
    (data.body ?? "").replace(/\s+/g, " ").trim().slice(0, 180) ||
    "Gasless signature voting for the Redbelly DAO.";

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
