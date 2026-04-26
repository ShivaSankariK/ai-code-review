import React from "react";
import { useServerUI } from "./hooks/useServerUI";
import { ServerNode } from "./components/ServerNode";
import { ConnectionStatusView } from "./components/ConnectionStatusView";

export default function App() {
  const { nodes, sendEvent, status } = useServerUI();

  if (status !== "open" || nodes.size === 0) {
    return (
      <>
        <ConnectionStatusView status={status} />
        {status === "open" && nodes.size === 0 && <p>Waiting for server...</p>}
      </>
    );
  }

  // Roots are nodes not referenced as a child of any other node.
  const childIds = new Set<string>();
  for (const node of nodes.values()) {
    for (const childId of node.children) childIds.add(childId);
  }

  const roots = [...nodes.keys()].filter((id) => !childIds.has(id));

  return (
    <>
      {roots.map((id) => (
        <ServerNode key={id} id={id} nodes={nodes} sendEvent={sendEvent} />
      ))}
    </>
  );
}