<script setup lang="ts">
import { computed, ref, watch } from "vue";
import GraphScene from "./GraphScene.vue";
import FilterPanel from "./FilterPanel.vue";
import Sidebar from "./Sidebar.vue";
import ResizeHandle from "./ResizeHandle.vue";
import NodeDetailPanel from "./NodeDetailPanel.vue";
import Button from "@/components/ui/Button.vue";
import { useGraphData } from "../hooks/useGraphData";
import { computeCameraTarget, type CameraTarget } from "../lib/graphCamera";
import type { GraphData, GraphNode } from "../lib/types";

const props = defineProps<{
  project: string | null;
}>();

const { data, loading, error, fetchOverview } = useGraphData();
const highlightedIds = ref<Set<number> | null>(null);
const selectedPath = ref<string | null>(null);
const selectedNode = ref<GraphNode | null>(null);
const cameraTarget = ref<CameraTarget | null>(null);
const showLabels = ref(true);
const enabledLabels = ref(new Set<string>());
const enabledEdgeTypes = ref(new Set<string>());
const leftWidth = ref(loadWidth("cbm-left-w", 260));
const rightWidth = ref(loadWidth("cbm-right-w", 280));

function loadWidth(key: string, fallback: number): number {
  try {
    const value = localStorage.getItem(key);
    if (value) return Math.max(150, Math.min(600, Number.parseInt(value, 10)));
  } catch {
    /* ignore */
  }
  return fallback;
}

function saveWidth(key: string, value: number) {
  try {
    localStorage.setItem(key, String(Math.round(value)));
  } catch {
    /* ignore */
  }
}

function formatGraphLimitNotice(value: GraphData | null): string | null {
  if (!value || value.total_nodes <= value.nodes.length) return null;
  return `Showing ${value.nodes.length.toLocaleString()} of ${value.total_nodes.toLocaleString()} nodes. Use filters to narrow.`;
}

const limitNotice = computed(() => formatGraphLimitNotice(data.value));

watch(
  data,
  (nextData) => {
    if (!nextData) return;
    const labels = new Set(nextData.nodes.map((node) => node.label));
    const types = new Set(nextData.edges.map((edge) => edge.type));
    for (const linkedProject of nextData.linked_projects ?? []) {
      for (const node of linkedProject.nodes) labels.add(node.label);
      for (const edge of linkedProject.edges) types.add(edge.type);
      for (const edge of linkedProject.cross_edges) types.add(edge.type);
    }
    enabledLabels.value = labels;
    enabledEdgeTypes.value = types;
  },
  { immediate: true },
);

const filteredData = computed<GraphData | null>(() => {
  if (!data.value) return null;
  const nodes = data.value.nodes.filter((node) => enabledLabels.value.has(node.label));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = data.value.edges.filter(
    (edge) => enabledEdgeTypes.value.has(edge.type) && nodeIds.has(edge.source) && nodeIds.has(edge.target),
  );
  const linked_projects = data.value.linked_projects?.map((linkedProject) => {
    const lpNodes = linkedProject.nodes.filter((node) => enabledLabels.value.has(node.label));
    const lpIds = new Set(lpNodes.map((node) => node.id));
    return {
      ...linkedProject,
      nodes: lpNodes,
      edges: linkedProject.edges.filter(
        (edge) => enabledEdgeTypes.value.has(edge.type) && lpIds.has(edge.source) && lpIds.has(edge.target),
      ),
      cross_edges: linkedProject.cross_edges.filter(
        (edge) => enabledEdgeTypes.value.has(edge.type) && nodeIds.has(edge.source) && lpIds.has(edge.target),
      ),
    };
  });
  return { nodes, edges, total_nodes: data.value.total_nodes, linked_projects };
});

watch(
  () => props.project,
  (project) => {
    if (!project) return;
    void fetchOverview(project);
    highlightedIds.value = null;
    selectedPath.value = null;
    selectedNode.value = null;
    cameraTarget.value = null;
  },
  { immediate: true },
);

function selectPath(path: string, nodeIds: Set<number>) {
  if (!filteredData.value || !path || nodeIds.size === 0) {
    highlightedIds.value = null;
    selectedPath.value = null;
    cameraTarget.value = null;
    return;
  }
  selectedPath.value = path;
  highlightedIds.value = nodeIds;
  cameraTarget.value = computeCameraTarget(filteredData.value.nodes, nodeIds);
}

function selectNode(node: GraphNode) {
  if (!filteredData.value) return;
  selectedNode.value = node;
  const connectedIds = new Set([node.id]);
  for (const edge of filteredData.value.edges) {
    if (edge.source === node.id) connectedIds.add(edge.target);
    if (edge.target === node.id) connectedIds.add(edge.source);
  }
  highlightedIds.value = connectedIds;
  selectedPath.value = node.file_path ?? null;
  cameraTarget.value = computeCameraTarget(filteredData.value.nodes, connectedIds);
}

function toggleLabel(label: string) {
  const next = new Set(enabledLabels.value);
  if (next.has(label)) next.delete(label);
  else next.add(label);
  enabledLabels.value = next;
}

function toggleEdgeType(type: string) {
  const next = new Set(enabledEdgeTypes.value);
  if (next.has(type)) next.delete(type);
  else next.add(type);
  enabledEdgeTypes.value = next;
}

function enableAll() {
  if (!data.value) return;
  const labels = new Set(data.value.nodes.map((node) => node.label));
  const types = new Set(data.value.edges.map((edge) => edge.type));
  for (const linkedProject of data.value.linked_projects ?? []) {
    for (const node of linkedProject.nodes) labels.add(node.label);
    for (const edge of linkedProject.edges) types.add(edge.type);
    for (const edge of linkedProject.cross_edges) types.add(edge.type);
  }
  enabledLabels.value = labels;
  enabledEdgeTypes.value = types;
}

function disableAll() {
  enabledLabels.value = new Set();
  enabledEdgeTypes.value = new Set();
}

function clearSelection() {
  highlightedIds.value = null;
  selectedPath.value = null;
  selectedNode.value = null;
  cameraTarget.value = null;
}

function refresh() {
  if (!props.project) return;
  clearSelection();
  void fetchOverview(props.project);
}

function resizeLeft(delta: number) {
  leftWidth.value = Math.max(150, Math.min(500, leftWidth.value + delta));
  saveWidth("cbm-left-w", leftWidth.value);
}

function resizeRight(delta: number) {
  rightWidth.value = Math.max(200, Math.min(500, rightWidth.value + delta));
  saveWidth("cbm-right-w", rightWidth.value);
}
</script>

<template>
  <div v-if="!project" class="flex items-center justify-center h-full">
    <p class="text-white/30 text-sm">Select a project from the Stats tab</p>
  </div>

  <div v-else-if="loading" class="flex items-center justify-center h-full">
    <div class="text-center">
      <div class="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin mx-auto mb-3" />
      <p class="text-white/40 text-sm">Computing layout...</p>
    </div>
  </div>

  <div v-else-if="error" class="flex items-center justify-center h-full">
    <div class="text-center p-8">
      <p class="text-red-400 text-sm mb-2">{{ error }}</p>
      <Button variant="outline" size="sm" class="text-foreground/60" @click="refresh">
        Retry
      </Button>
    </div>
  </div>

  <div v-else-if="!data || !filteredData || filteredData.nodes.length === 0" class="flex items-center justify-center h-full">
    <div class="text-center">
      <p class="text-white/30 text-sm mb-3">
        {{ data && filteredData?.nodes.length === 0 ? "All nodes filtered out" : "No nodes in this project" }}
      </p>
      <Button
        v-if="data && filteredData?.nodes.length === 0"
        size="sm"
        class="bg-primary/15 text-primary hover:bg-primary/25"
        @click="enableAll"
      >
        Reset Filters
      </Button>
    </div>
  </div>

  <div v-else class="h-full flex">
    <div
      class="border-r border-border/30 flex flex-col h-full bg-[#0b1920]/90 backdrop-blur-md shrink-0"
      :style="{ width: `${leftWidth}px` }"
    >
      <FilterPanel
        :data="data"
        :enabled-labels="enabledLabels"
        :enabled-edge-types="enabledEdgeTypes"
        :show-labels="showLabels"
        @toggle-label="toggleLabel"
        @toggle-edge-type="toggleEdgeType"
        @toggle-show-labels="showLabels = !showLabels"
        @enable-all="enableAll"
        @disable-all="disableAll"
      />
      <Sidebar :nodes="filteredData.nodes" :selected-path="selectedPath" @select-path="selectPath" />
    </div>
    <ResizeHandle side="left" @resize="resizeLeft" />

    <div class="flex-1 relative overflow-hidden">
      <GraphScene
        :data="filteredData"
        :highlighted-ids="highlightedIds"
        :camera-target="cameraTarget"
        :show-labels="showLabels"
        @node-click="selectNode"
      />

      <div class="absolute top-4 left-4 text-[11px] text-white/30 pointer-events-none font-mono">
        <p>{{ filteredData.nodes.length.toLocaleString() }} nodes / {{ filteredData.edges.length.toLocaleString() }} edges</p>
        <p v-if="data.nodes.length > filteredData.nodes.length" class="text-white/25 mt-0.5">
          filtered from {{ data.nodes.length.toLocaleString() }}
        </p>
        <p v-if="limitNotice" class="text-amber-300/80 mt-0.5">{{ limitNotice }}</p>
        <p v-if="highlightedIds && highlightedIds.size > 0" class="text-cyan-400/50 mt-0.5">
          {{ highlightedIds.size }} selected
        </p>
      </div>

      <div class="absolute top-4 right-4 flex gap-2">
        <Button
          v-if="highlightedIds"
          size="sm"
          class="bg-primary/15 text-primary hover:bg-primary/25"
          @click="clearSelection"
        >
          Clear
        </Button>
        <Button variant="outline" size="sm" class="text-foreground/60" @click="refresh">
          Refresh
        </Button>
      </div>
    </div>

    <template v-if="selectedNode && filteredData">
      <ResizeHandle side="right" @resize="resizeRight" />
      <div class="border-l border-border shrink-0 h-full overflow-hidden" :style="{ width: `${rightWidth}px`, maxHeight: '100%' }">
        <NodeDetailPanel
          :node="selectedNode"
          :all-nodes="filteredData.nodes"
          :all-edges="filteredData.edges"
          @close="clearSelection"
          @navigate="selectNode"
        />
      </div>
    </template>
  </div>
</template>
