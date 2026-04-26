import React from "react";
import type { TreeState } from "../types/ui";
import type { SendEvent } from "../hooks/useServerUI";
import { InputNode } from "./InputNode";

type Props = {
  id: string;
  nodes: TreeState;
  sendEvent: SendEvent;
};

/**
 * Recursively renders a server-driven node by looking it up in the tree.
 * Delegates to specialised components (InputNode) where local state is needed.
 */
export function ServerNode({ id, nodes, sendEvent }: Props) {
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
    return (
      <div style={props.style as React.CSSProperties}>{childElements}</div>
    );
  }

  return null;
}
