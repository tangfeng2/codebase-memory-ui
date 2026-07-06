<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { colorForLabel } from "../lib/colors";
import type { CameraTarget } from "../lib/graphCamera";
import type { GraphData, GraphEdge, GraphNode, LinkedProject } from "../lib/types";

const props = defineProps<{
  data: GraphData;
  highlightedIds: Set<number> | null;
  cameraTarget: CameraTarget | null;
  showLabels: boolean;
}>();

const emit = defineEmits<{
  nodeClick: [node: GraphNode];
}>();

const root = ref<HTMLDivElement | null>(null);
const tooltip = ref<{ node: GraphNode; x: number; y: number } | null>(null);

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let composer: EffectComposer | null = null;
let controls: OrbitControls | null = null;
let frameId = 0;
let resizeObserver: ResizeObserver | null = null;
let nodeMesh: THREE.InstancedMesh | null = null;
let nodeLookup: GraphNode[] = [];
let labelGroup: THREE.Group | null = null;
let graphGroup: THREE.Group | null = null;
let target: CameraTarget | null = null;
let targetProgress = 1;
let lastInteraction = Date.now();

const IDLE_TIMEOUT_MS = 60_000;
const BLOOM_STRENGTH = 0.18;
const BLOOM_RADIUS = 0.12;
const BLOOM_THRESHOLD = 0.72;
const EDGE_TYPE_COLORS: Record<string, string> = {
  CALLS: "#1DA27E",
  IMPORTS: "#3b82f6",
  DEFINES: "#a855f7",
  DEFINES_METHOD: "#a855f7",
  CONTAINS_FILE: "#22c55e",
  CONTAINS_FOLDER: "#22c55e",
  CONTAINS_PACKAGE: "#22c55e",
  HANDLES: "#eab308",
  IMPLEMENTS: "#f97316",
  HTTP_CALLS: "#e11d48",
  ASYNC_CALLS: "#ec4899",
  GRPC_CALLS: "#f59e0b",
  GRAPHQL_CALLS: "#e879f9",
  TRPC_CALLS: "#a78bfa",
  CROSS_HTTP_CALLS: "#fb923c",
  CROSS_ASYNC_CALLS: "#fb7185",
  CROSS_GRPC_CALLS: "#fbbf24",
  CROSS_GRAPHQL_CALLS: "#f0abfc",
  CROSS_TRPC_CALLS: "#c4b5fd",
  CROSS_CHANNEL: "#fdba74",
  MEMBER_OF: "#64748b",
  TESTS_FILE: "#06b6d4",
};

function getClusterKey(filePath?: string): string {
  if (!filePath) return "";
  const parts = filePath.split("/");
  return parts.slice(0, Math.min(2, parts.length)).join("/");
}

function clearObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) {
      for (const item of material) item.dispose();
    } else {
      material?.dispose?.();
    }
  });
  object.clear();
}

function makeNodeMesh(nodes: GraphNode[], opacity = 1) {
  const geometry = new THREE.SphereGeometry(1, 24, 16);
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const mesh = new THREE.InstancedMesh(geometry, material, nodes.length);
  const temp = new THREE.Object3D();
  const color = new THREE.Color();
  const colors = new Float32Array(nodes.length * 3);
  const hasHighlight = Boolean(props.highlightedIds?.size);

  nodes.forEach((node, index) => {
    temp.position.set(node.x, node.y, node.z);
    const isHighlighted = !hasHighlight || props.highlightedIds?.has(node.id);
    const scale = node.size * (isHighlighted ? 0.5 : 0.2);
    temp.scale.set(scale, scale, scale);
    temp.updateMatrix();
    mesh.setMatrixAt(index, temp.matrix);

    color.set(node.color);
    if (hasHighlight && !props.highlightedIds?.has(node.id)) {
      color.multiplyScalar(0.15);
    } else {
      const brightness = (color.r + color.g + color.b) / 3;
      color.multiplyScalar(1.08 + brightness * 0.22);
    }
    colors[index * 3] = color.r * opacity;
    colors[index * 3 + 1] = color.g * opacity;
    colors[index * 3 + 2] = color.b * opacity;
  });

  geometry.setAttribute("color", new THREE.InstancedBufferAttribute(colors, 3));
  mesh.frustumCulled = false;
  mesh.userData.nodes = nodes;
  return mesh;
}

function makeEdges(nodes: GraphNode[], edges: GraphEdge[], highlightedIds: Set<number> | null, opacity = 1, targetNodes?: GraphNode[]) {
  const sourceMap = new Map(nodes.map((node, index) => [node.id, index]));
  const targetList = targetNodes ?? nodes;
  const targetMap = targetNodes ? new Map(targetNodes.map((node, index) => [node.id, index])) : sourceMap;
  const hasHighlight = Boolean(highlightedIds?.size);
  const positions: number[] = [];
  const colors: number[] = [];
  const color = new THREE.Color();

  for (const edge of edges) {
    const sourceIndex = sourceMap.get(edge.source);
    const targetIndex = targetMap.get(edge.target);
    if (sourceIndex === undefined || targetIndex === undefined) continue;

    const source = nodes[sourceIndex];
    const destination = targetList[targetIndex];
    const sourceHighlighted = !hasHighlight || highlightedIds?.has(source.id);
    const targetHighlighted = !hasHighlight || highlightedIds?.has(destination.id);
    if (hasHighlight && !sourceHighlighted && !targetHighlighted) continue;

    let intensity = getClusterKey(source.file_path) === getClusterKey(destination.file_path) ? 0.25 : 0.06;
    if (hasHighlight) intensity = sourceHighlighted && targetHighlighted ? 0.5 : 0.04;

    positions.push(source.x, source.y, source.z, destination.x, destination.y, destination.z);
    color.set(EDGE_TYPE_COLORS[edge.type] ?? "#1C8585").multiplyScalar(intensity);
    colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
}

function makeLabelTexture(name: string, colorValue: string) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return null;

  const fontSize = 64;
  const font = `600 ${fontSize}px Inter, system-ui, -apple-system, "Segoe UI", sans-serif`;
  context.font = font;
  let text = name;
  while (context.measureText(text).width > 720 && text.length > 4) {
    text = `${text.slice(0, -4)}...`;
  }
  const width = Math.ceil(context.measureText(text).width + 64);
  const height = 100;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  context.scale(ratio, ratio);
  context.font = font;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineWidth = 8;
  context.strokeStyle = "rgba(0,0,0,0.9)";
  context.fillStyle = colorValue;
  context.strokeText(text, width / 2, height / 2);
  context.fillText(text, width / 2, height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return { texture, width, height };
}

function addLabels(parent: THREE.Group, nodes: GraphNode[]) {
  labelGroup = new THREE.Group();
  const hasHighlight = Boolean(props.highlightedIds?.size);
  const labeled = [...nodes]
    .filter((node) => !hasHighlight || props.highlightedIds?.has(node.id))
    .sort((a, b) => b.size - a.size)
    .slice(0, 80);

  for (const node of labeled) {
    const label = makeLabelTexture(node.name, node.color);
    if (!label) continue;
    const worldFontSize = Math.max(1.8, node.size * 0.4);
    const worldHeight = worldFontSize * (label.height / 64);
    const worldWidth = worldHeight * (label.width / label.height);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: label.texture, transparent: true, depthWrite: false, toneMapped: false }),
    );
    sprite.position.set(node.x, node.y + node.size * 0.7 + worldHeight / 2, node.z);
    sprite.scale.set(worldWidth, worldHeight, 1);
    sprite.renderOrder = 20;
    sprite.frustumCulled = false;
    labelGroup.add(sprite);
  }
  parent.add(labelGroup);
}

function offsetNodes(project: LinkedProject) {
  return project.nodes.map((node) => ({
    ...node,
    x: node.x + project.offset.x,
    y: node.y + project.offset.y,
    z: node.z + project.offset.z,
  }));
}

function rebuildGraph() {
  if (!scene) return;
  if (graphGroup) {
    scene.remove(graphGroup);
    clearObject(graphGroup);
  }

  graphGroup = new THREE.Group();
  graphGroup.add(makeEdges(props.data.nodes, props.data.edges, props.highlightedIds));
  nodeLookup = props.data.nodes;
  nodeMesh = makeNodeMesh(props.data.nodes);
  graphGroup.add(nodeMesh);

  for (const linkedProject of props.data.linked_projects ?? []) {
    const shifted = offsetNodes(linkedProject);
    graphGroup.add(makeEdges(shifted, linkedProject.edges, null, 0.3));
    graphGroup.add(makeNodeMesh(shifted, 0.5));
    if (linkedProject.cross_edges.length > 0) {
      graphGroup.add(makeEdges(props.data.nodes, linkedProject.cross_edges, props.highlightedIds, 0.85, shifted));
    }
  }

  if (props.showLabels) addLabels(graphGroup, props.data.nodes);
  scene.add(graphGroup);
}

function resize() {
  if (!root.value || !renderer || !camera) return;
  const { width, height } = root.value.getBoundingClientRect();
  renderer.setSize(width, height, false);
  composer?.setSize(width, height);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function updatePointer(event: PointerEvent) {
  if (!root.value) return;
  const rect = root.value.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function pickNode(event: PointerEvent) {
  if (!camera || !nodeMesh) return null;
  updatePointer(event);
  raycaster.setFromCamera(pointer, camera);
  const [hit] = raycaster.intersectObject(nodeMesh);
  if (!hit || hit.instanceId === undefined) return null;
  return nodeLookup[hit.instanceId] ?? null;
}

function onPointerMove(event: PointerEvent) {
  const node = pickNode(event);
  tooltip.value = node ? { node, x: event.offsetX + 14, y: event.offsetY + 14 } : null;
}

function onPointerLeave() {
  tooltip.value = null;
}

function onClick(event: PointerEvent) {
  resetInteractionTimer();
  const node = pickNode(event);
  if (node) emit("nodeClick", node);
}

function resetInteractionTimer() {
  lastInteraction = Date.now();
  if (controls) controls.autoRotate = false;
}

function animate() {
  frameId = window.requestAnimationFrame(animate);
  if (!renderer || !scene || !camera) return;

  if (target && targetProgress < 1) {
    targetProgress = Math.min(1, targetProgress + 0.02);
    const eased = 1 - Math.pow(1 - targetProgress, 3);
    camera.position.lerp(target.position, eased * 0.08);
    camera.lookAt(target.lookAt);
    controls?.target.lerp(target.lookAt, eased * 0.08);
  }

  if (controls) {
    controls.autoRotate = Date.now() - lastInteraction > IDLE_TIMEOUT_MS;
    controls.update();
  }
  if (composer) composer.render();
  else renderer.render(scene, camera);
}

onMounted(async () => {
  await nextTick();
  if (!root.value) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color("#06090f");
  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100000);
  camera.position.set(0, 0, 800);
  renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  root.value.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight("#ffffff", 0.5));
  const lightA = new THREE.PointLight("#ffffff", 0.6);
  lightA.position.set(500, 500, 500);
  scene.add(lightA);
  const lightB = new THREE.PointLight("#6040ff", 0.4);
  lightB.position.set(-300, -200, -300);
  scene.add(lightB);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.5;
  controls.zoomSpeed = 1.5;
  controls.minDistance = 10;
  controls.maxDistance = 50000;
  controls.autoRotateSpeed = 0.4;

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD));
  composer.addPass(new OutputPass());

  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerleave", onPointerLeave);
  renderer.domElement.addEventListener("click", onClick);
  renderer.domElement.addEventListener("pointerdown", resetInteractionTimer);
  renderer.domElement.addEventListener("wheel", resetInteractionTimer);
  controls.addEventListener("start", resetInteractionTimer);
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(root.value);
  resize();
  rebuildGraph();
  animate();
});

watch(
  () => [props.data, props.highlightedIds, props.showLabels],
  () => rebuildGraph(),
  { deep: false },
);

watch(
  () => props.cameraTarget,
  (nextTarget) => {
    if (!nextTarget) return;
    target = nextTarget;
    targetProgress = 0;
  },
);

onBeforeUnmount(() => {
  if (frameId) window.cancelAnimationFrame(frameId);
  resizeObserver?.disconnect();
  if (renderer) {
    renderer.domElement.removeEventListener("pointermove", onPointerMove);
    renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
    renderer.domElement.removeEventListener("click", onClick);
    renderer.domElement.removeEventListener("pointerdown", resetInteractionTimer);
    renderer.domElement.removeEventListener("wheel", resetInteractionTimer);
  }
  controls?.removeEventListener("start", resetInteractionTimer);
  controls?.dispose();
  if (graphGroup) clearObject(graphGroup);
  composer?.dispose();
  renderer?.dispose();
  renderer?.domElement.remove();
});
</script>

<template>
  <div ref="root" class="absolute inset-0 bg-[#06090f]">
    <div
      v-if="tooltip"
      class="absolute z-10 bg-[#1a1a2e]/95 backdrop-blur border border-white/10 rounded-lg px-3 py-2 text-xs whitespace-nowrap shadow-xl max-w-[350px] pointer-events-none"
      :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
    >
      <div class="flex items-center gap-1.5 mb-1">
        <span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: colorForLabel(tooltip.node.label) }" />
        <span class="text-white font-medium truncate">{{ tooltip.node.name }}</span>
        <span class="text-white/30 ml-1 shrink-0">{{ tooltip.node.label }}</span>
      </div>
      <p v-if="tooltip.node.file_path" class="text-white/30 font-mono truncate">{{ tooltip.node.file_path }}</p>
    </div>
  </div>
</template>
