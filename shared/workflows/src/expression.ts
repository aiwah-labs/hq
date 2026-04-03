// @ts-nocheck — baseline: schema/dep mismatches tracked in GH issue
import type { WorkflowExecutionContext } from './types.js';

/**
 * Resolve a dot-path like "steps.enrich.output.industry" against a nested object.
 */
function getByPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Whitelisted env vars — never expose secrets */
const ALLOWED_ENV_KEYS = new Set(['NODE_ENV']);

/**
 * Build the resolution context from the execution context.
 * Available roots: trigger, input, steps, variables, loop, env
 */
function buildResolutionContext(ctx: WorkflowExecutionContext): Record<string, unknown> {
  const env: Record<string, string | undefined> = {};
  for (const key of ALLOWED_ENV_KEYS) {
    env[key] = process.env[key];
  }

  return {
    trigger: ctx.triggerPayload,
    input: ctx.input,
    steps: ctx.steps,
    variables: ctx.variables,
    loop: ctx.loop,
    env,
  };
}

/**
 * Resolve a template expression against the workflow execution context.
 *
 * Supports:
 * - `{{path.to.value}}` — replaced with the resolved value
 * - Plain string with no `{{` — returned as-is
 * - Single `{{path}}` with nothing else — returns the raw value (not stringified)
 *
 * Examples:
 *   resolveExpression("{{steps.enrich.output.industry}}", ctx) → "SaaS"
 *   resolveExpression("Hello {{input.name}}", ctx) → "Hello Acme"
 *   resolveExpression("{{steps.score.output}}", ctx) → { score: 87, verdict: "strong" }
 */
export function resolveExpression(expr: string, ctx: WorkflowExecutionContext): unknown {
  const trimmed = expr.trim();

  // Fast path: no template syntax at all
  if (!trimmed.includes('{{')) {
    return trimmed;
  }

  // Single expression: return raw value (preserves objects, numbers, booleans).
  // [^{}]+ prevents over-greedy matching when multiple {{}} are present in one string.
  const singleMatch = trimmed.match(/^\{\{([^{}]+)\}\}$/);
  if (singleMatch) {
    const path = singleMatch[1].trim();
    const resCtx = buildResolutionContext(ctx);
    return getByPath(resCtx, path);
  }

  // Template with multiple expressions or surrounding text: string interpolation.
  const resCtx = buildResolutionContext(ctx);
  return trimmed.replace(/\{\{([^{}]+)\}\}/g, (_match, path: string) => {
    const value = getByPath(resCtx, path.trim());
    if (value === undefined || value === null) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  });
}

/**
 * Resolve an input map: { paramKey: expression } → { paramKey: resolvedValue }
 */
export function resolveInputMap(
  inputMap: Record<string, string>,
  ctx: WorkflowExecutionContext
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, expr] of Object.entries(inputMap)) {
    result[key] = resolveExpression(expr, ctx);
  }
  return result;
}

/**
 * Evaluate an expression as a boolean (for conditions and edge guards).
 * Resolves the expression then casts to truthy/falsy.
 *
 * Examples:
 *   "{{steps.score.output.verdict}}" — truthy if non-empty string
 *   "{{steps.fetch-website.output.text}}" — falsy if null/undefined
 */
export function evaluateCondition(expr: string, ctx: WorkflowExecutionContext): boolean {
  const value = resolveExpression(expr, ctx);
  return !!value;
}
