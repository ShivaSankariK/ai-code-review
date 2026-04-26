import React, { useCallback, useEffect, useRef, useState } from "react";

type NodeData = {
  id: string;
  kind: "Button" | "Text" | "Container" | "Input";
  props: Record<string, unknown>;
  events: string[];
  children: string[];
};

type TreeState = Map<string, NodeData>;

function useServerUI() {
  const [nodes, setNodes] = useState<TreeState>(new Map());
  const wsRef = useRef<WebSocket | null>(null);

  const sendEvent = useCallback(
    (id: string, event: string, payload?: unknown) => {
      wsRef.current?.send(
        JSON.stringify({ type: "event", id, event, payload: payload ?? null })
      );
    },
    []
  );

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:3001");
    wsRef.current = ws;

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      setNodes((prev) => {
        const next = new Map(prev);
        const apply = (m: typeof msg) => {
          if (m.type === "create") {
            next.set(m.id, { id: m.id, kind: m.kind, props: m.props, events: m.events, children: m.children });
          } else if (m.type === "update") {
            const existing = next.get(m.id);
            if (existing) next.set(m.id, { ...existing, props: { ...existing.props, ...m.props } });
          } else if (m.type === "children") {
            const existing = next.get(m.id);
            if (existing) next.set(m.id, { ...existing, children: m.children });
          } else if (m.type === "destroy") {
            next.delete(m.id);
          }
        };
        if (msg.type === "batch") {
          for (const m of msg.messages) apply(m);
        } else {
          apply(msg);
        }
        return next;
      });
    };

    return () => ws.close();
  }, []);

  return { nodes, sendEvent };
}

// Input needs local state so typing is instant, but syncs when server pushes a value update.
function InputNode({
  node,
  sendEvent,
}: {
  node: NodeData;
  sendEvent: (id: string, event: string, payload?: unknown) => void;
}) {
  const [localValue, setLocalValue] = useState((node.props.value as string) ?? "");

  useEffect(() => {
    setLocalValue((node.props.value as string) ?? "");
  }, [node.props.value]);

  return (
    <input
      style={node.props.style as React.CSSProperties}
      placeholder={node.props.placeholder as string}
      value={localValue}
      onChange={(e) => {
        setLocalValue(e.target.value);
        if (node.events.includes("change")) {
          sendEvent(node.id, "change", e.target.value);
        }
      }}
    />
  );
}

function ServerNode({
  id,
  nodes,
  sendEvent,
}: {
  id: string;
  nodes: TreeState;
  sendEvent: (id: string, event: string, payload?: unknown) => void;
}) {
  const node = nodes.get(id);
  if (!node) return null;

  const { kind, props, events, children } = node;

  const childElements = children.map((childId) => (
    <ServerNode key={childId} id={childId} nodes={nodes} sendEvent={sendEvent} />
  ));

  if (kind === "Input") {
    return <InputNode node={node} sendEvent={sendEvent} />;
  }

  if (kind === "Button") {
    return (
      <button
        style={props.style as React.CSSProperties}
        onClick={
          events.includes("click") ? () => sendEvent(id, "click") : undefined
        }
      >
        {props.text as string}
        {childElements}
      </button>
    );
  }

  if (kind === "Text") {
    return (
      <span style={props.style as React.CSSProperties}>
        {props.text as string}
        {childElements}
      </span>
    );
  }

  if (kind === "Container") {
    return <div style={props.style as React.CSSProperties}>{childElements}</div>;
  }

  return null;
}

export default function App() {
  const { nodes, sendEvent } = useServerUI();

  // Roots are nodes not referenced as a child of any other node.
  const childIds = new Set<string>();
  for (const node of nodes.values()) {
    for (const childId of node.children) childIds.add(childId);
  }
  const roots = [...nodes.keys()].filter((id) => !childIds.has(id));

  if (nodes.size === 0) return <p>Waiting for server...</p>;

  return (
    <>
      {roots.map((id) => (
        <ServerNode key={id} id={id} nodes={nodes} sendEvent={sendEvent} />
      ))}
    </>
  );
}
