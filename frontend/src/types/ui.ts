export type NodeData = {
  id: string;
  kind: "Button" | "Text" | "Input" | "Container";
  props: Record<string, unknown>;
  events: string[];
  children: string[];
};

export type TreeState = Map<string, NodeData>;
export type ConnectionStatus = "connecting" | "open" | "closed";
