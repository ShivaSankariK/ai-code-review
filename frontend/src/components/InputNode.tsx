import React, { useEffect, useState } from "react";
import type { NodeData } from "../types/ui";
import type { SendEvent } from "../hooks/useServerUI";

type Props = {
  node: NodeData;
  sendEvent: SendEvent;
};

/**
 * Controlled input that keeps local state so typing is instant, but syncs
 * whenever the server pushes a value update.
 */
export function InputNode({ node, sendEvent }: Props) {
  const [localValue, setLocalValue] = useState(
    (node.props.value as string) ?? ""
  );

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