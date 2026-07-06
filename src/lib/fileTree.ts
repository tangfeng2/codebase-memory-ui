import type { GraphNode } from "./types";

export interface DirNode {
  name: string;
  fullPath: string;
  children: Map<string, DirNode>;
  nodeIds: Set<number>;
  directNodes: GraphNode[];
}

export function buildFileTree(nodes: GraphNode[]): DirNode {
  const root: DirNode = { name: "/", fullPath: "", children: new Map(), nodeIds: new Set(), directNodes: [] };
  for (const node of nodes) {
    if (!node.file_path) continue;
    const parts = node.file_path.split("/");
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!parts[i]) continue;
      let child = cur.children.get(parts[i]);
      if (!child) {
        const prefix = parts.slice(0, i + 1).join("/");
        child = { name: parts[i], fullPath: prefix, children: new Map(), nodeIds: new Set(), directNodes: [] };
        cur.children.set(parts[i], child);
      }
      cur = child;
    }
    cur.directNodes.push(node);
  }

  function collect(dir: DirNode): Set<number> {
    const ids = new Set<number>();
    for (const node of dir.directNodes) ids.add(node.id);
    for (const child of dir.children.values()) {
      for (const id of collect(child)) ids.add(id);
    }
    dir.nodeIds = ids;
    return ids;
  }

  collect(root);
  return root;
}

export function flattenSingleChild(dir: DirNode): DirNode {
  const children = new Map<string, DirNode>();
  for (const [key, child] of dir.children) {
    let flat = flattenSingleChild(child);
    while (flat.children.size === 1 && flat.directNodes.length === 0) {
      const [[segment, nested]] = [...flat.children.entries()];
      const nestedFlat = flattenSingleChild(nested);
      flat = { ...nestedFlat, name: `${flat.name}/${segment}` };
    }
    children.set(key, flat);
  }
  return { ...dir, children };
}
