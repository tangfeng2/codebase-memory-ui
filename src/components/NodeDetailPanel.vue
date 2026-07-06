<script setup lang="ts">
import { computed } from "vue";
import Button from "@/components/ui/Button.vue";
import ScrollArea from "@/components/ui/ScrollArea.vue";
import { colorForLabel } from "../lib/colors";
import type { GraphEdge, GraphNode } from "../lib/types";

interface Connection {
  node: GraphNode;
  edgeType: string;
  direction: "inbound" | "outbound";
}

const props = defineProps<{
  node: GraphNode;
  allNodes: GraphNode[];
  allEdges: GraphEdge[];
}>();

const emit = defineEmits<{
  close: [];
  navigate: [node: GraphNode];
}>();

const connections = computed(() => {
  const nodeMap = new Map<number, GraphNode>();
  for (const node of props.allNodes) nodeMap.set(node.id, node);

  const conns: Connection[] = [];
  for (const edge of props.allEdges) {
    if (edge.source === props.node.id) {
      const target = nodeMap.get(edge.target);
      if (target) conns.push({ node: target, edgeType: edge.type, direction: "outbound" });
    }
    if (edge.target === props.node.id) {
      const source = nodeMap.get(edge.source);
      if (source) conns.push({ node: source, edgeType: edge.type, direction: "inbound" });
    }
  }
  return conns;
});

const outbound = computed(() => connections.value.filter((connection) => connection.direction === "outbound"));
const inbound = computed(() => connections.value.filter((connection) => connection.direction === "inbound"));

function groupByType(conns: Connection[]) {
  const groups = new Map<string, Connection[]>();
  for (const connection of conns) {
    groups.set(connection.edgeType, [...(groups.get(connection.edgeType) ?? []), connection]);
  }
  return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
}

const outboundGroups = computed(() => groupByType(outbound.value));
const inboundGroups = computed(() => groupByType(inbound.value));
</script>

<template>
  <div class="w-full bg-[#0b1920]/95 backdrop-blur-xl flex flex-col h-full min-h-0 overflow-hidden">
    <div class="px-4 pt-4 pb-3 border-b border-border/30">
      <div class="flex items-start justify-between gap-2 mb-2">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 mb-1.5">
            <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ backgroundColor: colorForLabel(node.label) }" />
            <h3 class="text-[13px] font-semibold text-foreground truncate">{{ node.name }}</h3>
          </div>
          <span
            class="inline-block px-2 py-0.5 rounded-md text-[10px] font-medium"
            :style="{ backgroundColor: `${colorForLabel(node.label)}18`, color: colorForLabel(node.label) }"
          >
            {{ node.label }}
          </span>
        </div>
        <Button variant="ghost" size="icon-xs" class="text-foreground/20 hover:text-foreground/50 transition-colors text-[16px] leading-none p-1" @click="emit('close')">
          x
        </Button>
      </div>

      <p v-if="node.file_path" class="text-[11px] text-foreground/30 font-mono mt-2 break-all leading-relaxed">
        {{ node.file_path }}
      </p>

      <div class="flex gap-5 mt-3">
        <div>
          <p class="text-[9px] text-foreground/25 uppercase tracking-widest">Out</p>
          <p class="text-[18px] font-semibold tabular-nums text-primary">{{ outbound.length }}</p>
        </div>
        <div>
          <p class="text-[9px] text-foreground/25 uppercase tracking-widest">In</p>
          <p class="text-[18px] font-semibold tabular-nums text-accent">{{ inbound.length }}</p>
        </div>
        <div>
          <p class="text-[9px] text-foreground/25 uppercase tracking-widest">Total</p>
          <p class="text-[18px] font-semibold tabular-nums text-foreground">{{ connections.length }}</p>
        </div>
      </div>
    </div>

    <ScrollArea class="flex-1 min-h-0">
      <div class="px-4 py-3 space-y-4">
        <section v-if="outbound.length > 0">
          <p class="text-[11px] font-medium text-foreground/40 mb-2">
            References <span class="text-foreground/15">({{ outbound.length }})</span>
          </p>
          <div v-for="[type, conns] in outboundGroups" :key="type" class="mb-2">
            <p class="text-[9px] text-foreground/20 uppercase tracking-wider mb-1 font-medium">{{ type.replace(/_/g, " ").toLowerCase() }}</p>
            <button
              v-for="(connection, index) in conns.slice(0, 25)"
              :key="`${connection.node.id}-${index}`"
              type="button"
              class="flex items-center gap-1.5 w-full text-left px-2 py-[4px] rounded-md hover:bg-white/[0.04] text-[11px] transition-colors group"
              @click="emit('navigate', connection.node)"
            >
              <span class="text-foreground/15 text-[10px] group-hover:text-foreground/30">→</span>
              <span class="w-[5px] h-[5px] rounded-full shrink-0" :style="{ backgroundColor: colorForLabel(connection.node.label) }" />
              <span class="text-foreground/55 group-hover:text-foreground/80 truncate">{{ connection.node.name }}</span>
              <span class="text-foreground/10 ml-auto text-[10px] shrink-0">{{ connection.node.label }}</span>
            </button>
            <p v-if="conns.length > 25" class="text-[10px] text-foreground/15 px-2 py-1">+{{ conns.length - 25 }} more</p>
          </div>
        </section>

        <section v-if="inbound.length > 0">
          <p class="text-[11px] font-medium text-foreground/40 mb-2">
            Referenced by <span class="text-foreground/15">({{ inbound.length }})</span>
          </p>
          <div v-for="[type, conns] in inboundGroups" :key="type" class="mb-2">
            <p class="text-[9px] text-foreground/20 uppercase tracking-wider mb-1 font-medium">{{ type.replace(/_/g, " ").toLowerCase() }}</p>
            <button
              v-for="(connection, index) in conns.slice(0, 25)"
              :key="`${connection.node.id}-${index}`"
              type="button"
              class="flex items-center gap-1.5 w-full text-left px-2 py-[4px] rounded-md hover:bg-white/[0.04] text-[11px] transition-colors group"
              @click="emit('navigate', connection.node)"
            >
              <span class="text-foreground/15 text-[10px] group-hover:text-foreground/30">←</span>
              <span class="w-[5px] h-[5px] rounded-full shrink-0" :style="{ backgroundColor: colorForLabel(connection.node.label) }" />
              <span class="text-foreground/55 group-hover:text-foreground/80 truncate">{{ connection.node.name }}</span>
              <span class="text-foreground/10 ml-auto text-[10px] shrink-0">{{ connection.node.label }}</span>
            </button>
            <p v-if="conns.length > 25" class="text-[10px] text-foreground/15 px-2 py-1">+{{ conns.length - 25 }} more</p>
          </div>
        </section>

        <p v-if="connections.length === 0" class="text-[12px] text-foreground/20 text-center py-8">No connections</p>
      </div>
    </ScrollArea>
  </div>
</template>
