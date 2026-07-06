import * as THREE from "three";
import type { GraphNode } from "./types";

export interface CameraTarget {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
}

export function computeCameraTarget(nodes: GraphNode[], ids: Set<number>): CameraTarget | null {
  if (ids.size === 0) return null;

  let cx = 0;
  let cy = 0;
  let cz = 0;
  let count = 0;
  for (const node of nodes) {
    if (!ids.has(node.id)) continue;
    cx += node.x;
    cy += node.y;
    cz += node.z;
    count++;
  }
  if (count === 0) return null;

  cx /= count;
  cy /= count;
  cz /= count;

  let maxDist = 0;
  for (const node of nodes) {
    if (!ids.has(node.id)) continue;
    const distance = Math.sqrt((node.x - cx) ** 2 + (node.y - cy) ** 2 + (node.z - cz) ** 2);
    maxDist = Math.max(maxDist, distance);
  }

  const distance = Math.max(count <= 5 ? 300 : 200, maxDist * 3);
  const lookAt = new THREE.Vector3(cx, cy, cz);
  const position = new THREE.Vector3(cx + distance * 0.2, cy + distance * 0.15, cz + distance);
  return { position, lookAt };
}
