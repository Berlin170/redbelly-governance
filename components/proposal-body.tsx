"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Proposal bodies are markdown — imported ones especially, which arrive with
 * headings, tables and links. Rendering them raw turns a written proposal
 * into a wall of asterisks, so they go through a renderer with the element
 * styles set explicitly rather than relying on a typography plugin.
 */
export function ProposalBody({ body }: { body: string }) {
  return (
    <div className="text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (props) => (
            <h2 className="mb-3 mt-6 text-lg font-semibold first:mt-0" {...props} />
          ),
          h2: (props) => (
            <h3 className="mb-2 mt-6 text-base font-semibold first:mt-0" {...props} />
          ),
          h3: (props) => (
            <h4 className="mb-2 mt-5 text-sm font-semibold first:mt-0" {...props} />
          ),
          p: (props) => <p className="mb-3 last:mb-0" {...props} />,
          ul: (props) => (
            <ul className="mb-3 list-disc space-y-1 pl-5 marker:text-muted-foreground" {...props} />
          ),
          ol: (props) => (
            <ol className="mb-3 list-decimal space-y-1 pl-5 marker:text-muted-foreground" {...props} />
          ),
          a: (props) => (
            <a
              className="text-primary underline underline-offset-2 hover:no-underline"
              target="_blank"
              rel="noreferrer"
              {...props}
            />
          ),
          strong: (props) => <strong className="font-semibold" {...props} />,
          blockquote: (props) => (
            <blockquote
              className="mb-3 border-l-2 border-border pl-4 text-muted-foreground"
              {...props}
            />
          ),
          code: (props) => (
            <code
              className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[0.85em]"
              {...props}
            />
          ),
          pre: (props) => (
            <pre
              className="mb-3 overflow-x-auto rounded-lg bg-secondary p-3 text-xs"
              {...props}
            />
          ),
          hr: () => <hr className="my-5 border-border" />,
          img: (props) => (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img className="my-3 max-w-full rounded-lg" {...props} alt={props.alt ?? ""} />
          ),
          // Wide tables must scroll inside the card, never widen the page.
          table: (props) => (
            <div className="mb-3 overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs" {...props} />
            </div>
          ),
          th: (props) => (
            <th className="border border-border bg-secondary/50 px-2.5 py-1.5 font-medium" {...props} />
          ),
          td: (props) => (
            <td className="border border-border px-2.5 py-1.5 align-top" {...props} />
          ),
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
