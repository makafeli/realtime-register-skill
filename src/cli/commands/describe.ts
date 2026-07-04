import { loadSpec, findOperation } from "../../lib/spec.js";
import { renderOperation } from "../../lib/generator.js";
import { buildOperationSchemas } from "../../lib/schema.js";

interface Options {
  format?: string;
}

export function describeCommand(operationId: string, opts: Options = {}): void {
  const spec = loadSpec();
  const hit = findOperation(spec, operationId);
  if (!hit) {
    console.error(`Unknown operationId: ${operationId}`);
    process.exitCode = 1;
    return;
  }

  if (opts.format === "json") {
    const payload = {
      category: hit.category.category,
      ...hit.op,
      docUrl: spec.shared.docsBaseUrl + hit.op.docUrl,
      auth: spec.shared.auth ?? null,
      schemas: buildOperationSchemas(hit.op, spec.shared),
    };
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(renderOperation(hit.op, spec.shared).join("\n"));
}
