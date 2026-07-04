#!/usr/bin/env node
// Scrape every documented operation and compare the path + HTTP method and
// required-field count against the shipped spec. Designed to run weekly in
// CI — writes a JSON report to stdout and exits non-zero on drift so the
// wrapping workflow can open/update an issue.
//
// This is intentionally narrow: we only flag things that would break a user
// of the CLI (wrong URL, wrong method, field removed). Descriptions /
// restriction strings evolve constantly and are not diff targets.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { parseOperationHtml, fetchHtml } from "../dist/lib/scraper.js";

const here = dirname(fileURLToPath(import.meta.url));
const specDir = join(here, "..", "assets", "spec");

const shared = parseYaml(readFileSync(join(specDir, "_shared.yaml"), "utf8"));
const base = shared.docsBaseUrl;
if (!base) {
  console.error("docsBaseUrl missing from _shared.yaml");
  process.exit(2);
}

const files = readdirSync(specDir)
  .filter((f) => f.endsWith(".yaml") && !f.startsWith("_"));

const drifts = [];
let checked = 0;

for (const f of files) {
  const cat = parseYaml(readFileSync(join(specDir, f), "utf8"));
  for (const op of cat.operations ?? []) {
    checked += 1;
    const url = base + op.docUrl;
    let scraped;
    try {
      scraped = parseOperationHtml(await fetchHtml(url));
    } catch (err) {
      drifts.push({ operationId: op.operationId, kind: "fetch", detail: String(err) });
      continue;
    }

    // Method drift. A null scraped method means the page markup no longer
    // matches what the scraper understands — surface that as a parse failure
    // instead of a false match (old code silently defaulted to GET).
    if (op.method && scraped.method === null) {
      drifts.push({
        operationId: op.operationId,
        kind: "parse",
        detail: "method not found on page",
      });
    } else if (scraped.method && op.method && scraped.method !== op.method) {
      drifts.push({
        operationId: op.operationId,
        kind: "method",
        spec: op.method,
        live: scraped.method,
      });
    }

    // Path drift (ignore live template casing and trailing slash quirks).
    if (scraped.url && op.path) {
      const live = scraped.url.replace(/\/$/, "");
      const spec = op.path.replace(/\/$/, "");
      if (live !== spec) {
        drifts.push({ operationId: op.operationId, kind: "path", spec, live });
      }
    }

    // Required-field count drift (body only — URL fields are template-driven).
    // Body fields live at op.requestBody.fields as a name -> shape mapping.
    const specFields = op.requestBody?.fields;
    if (specFields && scraped.bodyFields.length > 0) {
      const specRequired = Object.values(specFields).filter((f) => f && f.required === true).length;
      const liveRequired = scraped.bodyFields.filter((f) => f.required).length;
      if (specRequired !== liveRequired) {
        drifts.push({
          operationId: op.operationId,
          kind: "required-count",
          spec: specRequired,
          live: liveRequired,
        });
      }
    }
  }
}

const report = { checked, drifts };
console.log(JSON.stringify(report, null, 2));
process.exit(drifts.length === 0 ? 0 : 1);
