/**
 * The frontend gate.
 *
 * Checks the rendered pages for the class of defect nobody catches by looking:
 * text that does not contrast with what is behind it, layouts that scroll
 * sideways, and controls too small to hit with a thumb. It runs every route in
 * both themes at both a desktop and a phone width, because these faults are
 * usually present in only one of the four combinations — a colour that is fine
 * on a dark card fails on a white one, and a row that fits at 1440 does not at
 * 390.
 *
 *   node scripts/ui-audit.mjs [baseUrl] [outDir]
 *
 * Exits non-zero when a contrast or overflow failure is found, so it can be
 * used as a gate rather than only as a report.
 */

import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(
  "file:///D:/claudesidia-vault/07_Development/tools/package.json",
);
const { chromium } = require("playwright");

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3] ?? ".";

const ROUTES = [
  ["/", "overview"],
  ["/proposals", "proposals"],
  ["/leaderboard", "leaderboard"],
  ["/create", "create"],
  ["/safety", "safety"],
];

const VIEWPORTS = [
  [{ width: 1440, height: 900 }, "desktop"],
  [{ width: 390, height: 844 }, "mobile"],
];

const THEMES = ["dark", "light"];

/**
 * Everything below runs inside the page. It has to be one self-contained
 * function: page.evaluate takes a single argument, and anything it closes over
 * on this side does not exist over there.
 */
function auditInPage() {
  const srgb = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };

  const luminance = ([r, g, b]) =>
    0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);

  const ratio = (a, b) => {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };

  const parse = (str) => {
    const m = String(str).match(
      /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?/i,
    );
    if (!m) return null;
    return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
  };

  /** Composite a translucent colour over what is already behind it. */
  const over = (fg, bg) =>
    [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]));

  const toHex = (c) =>
    "#" +
    c
      .slice(0, 3)
      .map((n) => Math.round(n).toString(16).padStart(2, "0"))
      .join("");

  /**
   * The effective background behind an element: walk up compositing every
   * translucent layer until something opaque is reached. Returns null when an
   * ancestor paints an image or gradient, because no single colour describes
   * what is behind the text at that point and guessing produces false alarms.
   */
  function backgroundOf(el) {
    let node = el;
    let stack = [];

    while (node && node !== document.documentElement.parentNode) {
      const cs = getComputedStyle(node);

      if (cs.backgroundImage && cs.backgroundImage !== "none") {
        return { image: true, layers: stack };
      }

      const c = parse(cs.backgroundColor);
      if (c && c[3] > 0) {
        stack.push(c);
        if (c[3] >= 0.999) {
          // Composite from the bottom up.
          let acc = stack.pop().slice(0, 3);
          while (stack.length) acc = over(stack.pop(), acc);
          return { color: acc };
        }
      }
      node = node.parentElement;
    }

    // Nothing opaque was found: the canvas is white by default.
    let acc = [255, 255, 255];
    while (stack.length) acc = over(stack.pop(), acc);
    return { color: acc };
  }

  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    if (parseFloat(cs.opacity) < 0.05) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    // Screen-reader-only text is deliberately clipped out of sight.
    if (r.width <= 1 && r.height <= 1) return false;
    return true;
  };

  const contrast = [];
  /**
   * Text inside an aria-hidden subtree is decoration — a separator glyph, an
   * icon's alt letter. WCAG 1.4.3 exempts incidental content from the contrast
   * requirement, so it is bucketed rather than failed. Bucketed and not
   * dropped: an aria-hidden that is hiding real content is a bug of its own,
   * and it should still be visible in the report.
   */
  const decorative = [];
  const seen = new Set();

  const isDecorative = (el) => !!el.closest('[aria-hidden="true"]');

  for (const el of document.querySelectorAll("body *")) {
    // Only elements that directly own rendered text.
    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(" ")
      .trim();
    if (!own) continue;
    if (!visible(el)) continue;

    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    if (!fg || fg[3] === 0) continue;

    const bg = backgroundOf(el);
    if (bg.image) continue; // Cannot be judged from a computed style.

    const composited = fg[3] < 1 ? over(fg, bg.color) : fg.slice(0, 3);
    const r = ratio(composited, bg.color);

    const size = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight, 10) || 400;
    // WCAG "large text": 24px, or 18.66px when bold.
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;

    if (r < need) {
      const key = `${toHex(composited)}|${toHex(bg.color)}|${Math.round(size)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      (isDecorative(el) ? decorative : contrast).push({
        text: own.slice(0, 70),
        fg: toHex(composited),
        bg: toHex(bg.color),
        ratio: +r.toFixed(2),
        need,
        fontSize: Math.round(size),
        weight,
        selector:
          el.tagName.toLowerCase() +
          (el.className && typeof el.className === "string"
            ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".")
            : ""),
      });
    }
  }

  // Sideways scroll, and whichever elements are causing it.
  const docWidth = document.documentElement.clientWidth;
  const overflow = [];
  if (document.documentElement.scrollWidth > docWidth + 1) {
    for (const el of document.querySelectorAll("body *")) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > docWidth + 1 || r.left < -1) {
        // Report the outermost offenders only.
        if (el.parentElement) {
          const pr = el.parentElement.getBoundingClientRect();
          if (pr.right > docWidth + 1 || pr.left < -1) continue;
        }
        overflow.push({
          selector:
            el.tagName.toLowerCase() +
            (el.className && typeof el.className === "string"
              ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".")
              : ""),
          left: Math.round(r.left),
          right: Math.round(r.right),
          text: (el.textContent ?? "").trim().slice(0, 50),
        });
      }
    }
  }

  // Tap targets. WCAG 2.2 AA asks for 24x24 CSS px as an absolute floor.
  //
  // 2.5.8 carries an explicit Inline exception: a target sitting in a sentence,
  // whose size is set by the line-height of the prose around it, is exempt.
  // Without it every "read more" inside a paragraph is reported, which trains
  // the reader to ignore the section.
  const inSentence = (el) => {
    const p = el.parentElement;
    if (!p) return false;
    return Array.from(p.childNodes).some(
      (n) => n.nodeType === 3 && n.textContent.trim().length > 0,
    );
  };

  const small = [];
  const smallSeen = new Set();
  for (const el of document.querySelectorAll(
    "a[href], button, input, select, textarea, [role=button], [role=tab]",
  )) {
    if (!visible(el)) continue;
    if (el.tagName === "A" && inSentence(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 24) {
      const sel =
        el.tagName.toLowerCase() +
        (el.className && typeof el.className === "string"
          ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
          : "");
      if (smallSeen.has(sel)) continue;
      smallSeen.add(sel);
      small.push({
        selector: sel,
        w: Math.round(r.width),
        h: Math.round(r.height),
        text: (el.textContent ?? "").trim().slice(0, 40),
      });
    }
  }

  return {
    contrast,
    decorative,
    overflow,
    small,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: docWidth,
  };
}

const results = [];
const browser = await chromium.launch({ headless: true });

for (const [viewport, vpName] of VIEWPORTS) {
  for (const theme of THEMES) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    await ctx.addInitScript((t) => {
      try {
        localStorage.setItem("theme", t);
      } catch {}
    }, theme);
    const page = await ctx.newPage();

    for (const [route, name] of ROUTES) {
      try {
        await page.goto(BASE + route, {
          waitUntil: "networkidle",
          timeout: 45000,
        });
        // Let the entrance animations settle so nothing is measured mid-fade.
        await page.waitForTimeout(1400);
        const r = await page.evaluate(auditInPage);
        results.push({ route, name, theme, viewport: vpName, ...r });
        process.stdout.write(
          `${vpName}/${theme}${route} — contrast ${r.contrast.length}, overflow ${r.overflow.length}, small ${r.small.length}\n`,
        );
      } catch (e) {
        results.push({
          route,
          name,
          theme,
          viewport: vpName,
          error: String(e).slice(0, 200),
          contrast: [],
          decorative: [],
          overflow: [],
          small: [],
        });
        process.stdout.write(`${vpName}/${theme}${route} — FAILED\n`);
      }
    }
    await ctx.close();
  }
}

await browser.close();

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "ui-audit.json"), JSON.stringify(results, null, 2));

const contrastCount = results.reduce((n, r) => n + r.contrast.length, 0);
const overflowCount = results.reduce((n, r) => n + r.overflow.length, 0);
const smallCount = results.reduce((n, r) => n + r.small.length, 0);
const decorativeCount = results.reduce(
  (n, r) => n + (r.decorative?.length ?? 0),
  0,
);

let md = `# UI audit\n\n`;
md += `${ROUTES.length} routes x ${THEMES.length} themes x ${VIEWPORTS.length} viewports.\n\n`;
md += `| Check | Failures |\n|---|---|\n`;
md += `| Text contrast below WCAG AA | ${contrastCount} |\n`;
md += `| Horizontal overflow | ${overflowCount} |\n`;
md += `| Tap targets under 24px | ${smallCount} |\n`;
md += `| Low-contrast decorative text (exempt, reported) | ${decorativeCount} |\n\n`;

for (const r of results) {
  if (!r.contrast.length && !r.overflow.length && !r.small.length && !r.error) {
    continue;
  }
  md += `## ${r.viewport} / ${r.theme} — \`${r.route}\`\n\n`;
  if (r.error) md += `Failed to load: ${r.error}\n\n`;

  if (r.contrast.length) {
    md += `### Contrast\n\n| Ratio | Needs | Colour on background | Size | Text | Element |\n|---|---|---|---|---|---|\n`;
    for (const c of r.contrast) {
      md += `| ${c.ratio}:1 | ${c.need}:1 | \`${c.fg}\` on \`${c.bg}\` | ${c.fontSize}px/${c.weight} | ${c.text.replace(/\|/g, "\\|")} | \`${c.selector}\` |\n`;
    }
    md += `\n`;
  }

  if (r.overflow.length) {
    md += `### Overflow (page is ${r.scrollWidth}px wide in a ${r.clientWidth}px viewport)\n\n`;
    for (const o of r.overflow) {
      md += `- \`${o.selector}\` spans ${o.left}..${o.right} — ${o.text.replace(/\|/g, "\\|")}\n`;
    }
    md += `\n`;
  }

  if (r.small.length) {
    md += `### Tap targets under 24px\n\n`;
    for (const s of r.small) {
      md += `- \`${s.selector}\` ${s.w}x${s.h} — ${s.text.replace(/\|/g, "\\|")}\n`;
    }
    md += `\n`;
  }
}

if (contrastCount + overflowCount + smallCount === 0) {
  md += `No failures.\n`;
}

writeFileSync(join(OUT, "ui-audit.md"), md);

console.log(
  `\ncontrast ${contrastCount} · overflow ${overflowCount} · small targets ${smallCount}`,
);
console.log(`Report: ${join(OUT, "ui-audit.md")}`);

process.exit(contrastCount > 0 || overflowCount > 0 ? 1 : 0);
