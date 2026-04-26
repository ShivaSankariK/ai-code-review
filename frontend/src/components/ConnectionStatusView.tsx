import React from "react";
import type { ConnectionStatus } from "../types/ui";

type Props = {
  status: ConnectionStatus;
};

/**
 * Renders a status placeholder when the server tree is not yet available.
 * Returns null when the connection is open so the caller can render the tree.
 */
export function ConnectionStatusView({ status }: Props) {
  if (status === "connecting") return <p>Connecting to server...</p>;
  if (status === "closed") return <p>Connection lost — reconnecting...</p>;
  return null;
}