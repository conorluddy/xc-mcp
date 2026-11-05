import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommandWithArgs } from '../../utils/command.js';
import { parseFlexibleJson } from '../../utils/json-parser.js';
import { parseAXFrame } from '../../utils/ax-frame.js';
import { resolveIdbUdid, validateTargetBooted } from '../../utils/idb-device-detection.js';
import { IDBTargetCache } from '../../state/idb-target-cache.js';

interface Node {
  AXUniqueId?: string;
  AXLabel?: string;
  AXValue?: string | number | boolean;
  type?: string;
  frame?: unknown;
  AXFrame?: string;
  children?: Node[];
}
export function flattenNodes(nodes: Node[]): Node[] {
  return nodes.flatMap(node => [node, ...flattenNodes(node.children || [])]);
}
export function uniqueMarker(element: Node, nodes: Node[]): string[] | undefined {
  for (const key of ['AXUniqueId', 'AXLabel'] as const) {
    const marker = element[key];
    if (
      marker &&
      !marker.startsWith('-') &&
      nodes.filter(node => String(node[key] ?? '').includes(marker)).length === 1
    )
      return [marker, '--match-key', key];
  }
  return undefined;
}
export async function idbSemanticActionTool(args: {
  udid?: string;
  query: string;
  exact?: boolean;
  operation: 'press' | 'set-value';
  value?: string;
  expect?: string;
}) {
  if (!args.query.trim() || (args.operation === 'set-value' && args.value === undefined))
    throw new McpError(ErrorCode.InvalidRequest, 'query and, for set-value, value are required');
  const udid = await resolveIdbUdid(args.udid);
  await validateTargetBooted(udid);
  const reply = (success: boolean, details: object) => ({
    content: [{ type: 'text' as const, text: JSON.stringify({ success, ...details }) }],
    isError: !success,
  });
  const read = async () => {
    const result = await executeCommandWithArgs('idb', ['ui', 'describe-all', '--udid', udid], {
      timeout: 30000,
    });
    if (result.code) throw new Error(result.stderr || 'Accessibility tree read failed');
    return flattenNodes(parseFlexibleJson(result.stdout));
  };
  try {
    const nodes = await read();
    const query = args.query.toLowerCase();
    const matches = nodes.filter(node =>
      [node.AXUniqueId, node.AXLabel].some(
        value =>
          value &&
          (args.exact !== false
            ? value.toLowerCase() === query
            : value.toLowerCase().includes(query))
      )
    );
    if (matches.length !== 1)
      return reply(false, {
        error: matches.length
          ? 'Ambiguous target; use a unique accessibility identifier.'
          : 'Element not found. If the accessibility tree is empty after relaunch, retry or explicitly use a deep read.',
      });
    const element = matches[0];
    if (args.expect !== undefined && String(element.AXValue ?? '') !== args.expect)
      return reply(false, { error: 'Expected value does not match; no action performed.' });
    const marker = uniqueMarker(element, nodes);
    const frame = parseAXFrame(element.frame ?? element.AXFrame);
    const coordinates =
      frame && frame.width > 0 && frame.height > 0
        ? [String(frame.centerX), String(frame.centerY)]
        : undefined;
    if (!marker && !coordinates)
      return reply(false, { error: 'Target has neither a unique marker nor usable coordinates.' });
    const operation = args.operation === 'press' ? 'tap' : 'set-value';
    const valueArgs = args.operation === 'set-value' ? ['--value', args.value!] : [];
    const run = (target: string[], ax: boolean) =>
      executeCommandWithArgs(
        'idb',
        ['ui', operation, ...target, ...valueArgs, ...(ax ? ['--api', 'ax'] : []), '--udid', udid],
        { timeout: 15000 }
      );
    let method = marker ? 'accessibility' : 'coordinates';
    let result = await run(marker || coordinates!, !!marker || args.operation === 'set-value');
    if (result.code && marker && coordinates && args.operation === 'press') {
      result = await run(coordinates, false);
      method = 'coordinates';
    }
    if (result.code)
      return reply(false, {
        error: result.stderr,
        guidance: 'Check idb CLI and companion support accessibility actions (idb 1.7+).',
      });
    let verified = false;
    if (args.operation === 'set-value' && !/secure/i.test(element.type || '')) {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt) await new Promise(resolve => setTimeout(resolve, 300));
        const current = await read();
        verified = current.some(
          node =>
            node.type === element.type &&
            (!element.AXUniqueId || node.AXUniqueId === element.AXUniqueId) &&
            String(node.AXValue ?? '') === args.value
        );
        if (verified) break;
      }
      if (!verified) return reply(false, { error: 'Value did not stick on read-back.' });
    }
    IDBTargetCache.recordSuccess(udid);
    return reply(true, {
      method,
      verified,
      warning:
        args.operation === 'set-value' && !verified
          ? 'Secure field value cannot be verified.'
          : method === 'coordinates' && /switch|checkbox/i.test(element.type || '')
            ? 'Coordinate tap sent; toggle effect is unverified.'
            : undefined,
    });
  } catch (error) {
    return reply(false, { error: error instanceof Error ? error.message : String(error) });
  }
}
export const IDB_SEMANTIC_ACTION_DOCS = `
# idb-semantic-action
Press a uniquely identified control or replace and verify a field value.

query matches AXUniqueId or AXLabel exactly, case-insensitively; exact:false enables substring search.
Ambiguous targets fail before mutation. operation is press or set-value; the latter requires value.
expect optionally guards the current AXValue. udid is optional.
Marker uniqueness includes untyped nodes. Failed accessibility presses fall back to coordinates.
Field updates are read back up to three times; secure fields explicitly report unverified success.
`;
export const IDB_SEMANTIC_ACTION_DOCS_MINI =
  'Press a unique accessibility target or replace a field with read-back verification.';
