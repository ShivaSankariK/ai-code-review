import type { NodeData, TreeState } from "../types/ui";

// Keys that must never be merged from untrusted payloads to prevent prototype pollution.
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function safeMergeProps(
  base: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...base };
  for (const key of Object.keys(patch)) {
    if (!UNSAFE_KEYS.has(key)) {
      merged[key] = patch[key];
    }
  }
  return merged;
}

/**
 * Applies a single server message to the node tree, returning the updated map.
 * Kept as a pure utility so it can be tested independently of the hook.
 */
function applyMessage(
  next: TreeState,
  m: Record<string, unknown>
): void {
  if (m.type === "create") {
    next.set(m.id as string, {
      id: m.id as string,
      kind: m.kind as NodeData["kind"],
      props: m.props as Record<string, unknown>,
      events: m.events as string[],
      children: m.children as string[],
    });
  } else if (m.type === "update") {
    const existing = next.get(m.id as string);
    if (existing) {
      next.set(m.id as string, {
        ...existing,
        props: safeMergeProps(existing.props, m.props as Record<string, unknown>),
      });
    }
  } else if (m.type === "children") {
    const existing = next.get(m.id as string);
    if (existing) {
      next.set(m.id as string, {
        ...existing,
        children: m.children as string[],
      });
    }
  } else if (m.type === "destroy") {
    next.delete(m.id as string);
  }
}

/**
 * Dispatches a raw parsed server message (single or batch) against the tree.
 */
export function applyServerMessage(
  prev: TreeState,
  msg: Record<string, unknown>
): TreeState {
  const next = new Map(prev);
  if (msg.type === "batch") {
    if (!Array.isArray(msg.messages)) {
      console.error("Received batch message with non-array messages field");
      return next;
    }
    for (const m of msg.messages) {
      if (m !== null && typeof m === "object" && !Array.isArray(m)) {
        applyMessage(next, m as Record<string, unknown>);
      }
    }
  } else {
    applyMessage(next, msg);
  }
  return next;
}
