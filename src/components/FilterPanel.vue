<script setup lang="ts">
import { computed } from "vue";
import Button from "@/components/ui/Button.vue";
import Checkbox from "@/components/ui/Checkbox.vue";
import { colorForLabel } from "../lib/colors";
import type { GraphData } from "../lib/types";

const props = defineProps<{
  data: GraphData;
  enabledLabels: Set<string>;
  enabledEdgeTypes: Set<string>;
  showLabels: boolean;
}>();

const emit = defineEmits<{
  toggleLabel: [label: string];
  toggleEdgeType: [type: string];
  toggleShowLabels: [];
  enableAll: [];
  disableAll: [];
}>();

const labelCounts = computed(() => {
  const counts = new Map<string, number>();
  for (const node of props.data.nodes) counts.set(node.label, (counts.get(node.label) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
});

const edgeTypeCounts = computed(() => {
  const counts = new Map<string, number>();
  for (const edge of props.data.edges) counts.set(edge.type, (counts.get(edge.type) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
});
</script>

<template>
  <div class="px-4 py-3 border-b border-border/40 space-y-3">
    <div class="flex items-center justify-between">
      <span class="text-[11px] font-medium text-foreground/50 uppercase tracking-widest">Filters</span>
      <div class="flex items-center gap-2">
        <Button variant="link" size="xs" class="h-auto p-0 text-[10px] text-primary/70 hover:text-primary" @click="emit('enableAll')">All</Button>
        <span class="text-foreground/15">|</span>
        <Button variant="link" size="xs" class="h-auto p-0 text-[10px] text-primary/70 hover:text-primary" @click="emit('disableAll')">None</Button>
      </div>
    </div>

    <div>
      <p class="text-[10px] text-foreground/30 mb-1.5">Nodes</p>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="[label, count] in labelCounts"
          :key="label"
          type="button"
          class="inline-flex items-center gap-1 px-1.5 py-[3px] rounded-md text-[10px] font-medium transition-all border"
          :class="enabledLabels.has(label) ? 'border-white/[0.08] bg-white/[0.04]' : 'border-transparent opacity-25'"
          @click="emit('toggleLabel', label)"
        >
          <span
            class="w-[5px] h-[5px] rounded-full"
            :style="{ backgroundColor: enabledLabels.has(label) ? colorForLabel(label) : '#444' }"
          />
          <span :style="{ color: enabledLabels.has(label) ? colorForLabel(label) : '#555' }">{{ label }}</span>
          <span class="text-foreground/20 tabular-nums">{{ count.toLocaleString() }}</span>
        </button>
      </div>
    </div>

    <div>
      <p class="text-[10px] text-foreground/30 mb-1.5">Edges</p>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="[type, count] in edgeTypeCounts"
          :key="type"
          type="button"
          class="inline-flex items-center gap-1 px-1.5 py-[3px] rounded-md text-[10px] font-medium transition-all border"
          :class="enabledEdgeTypes.has(type) ? 'border-white/[0.06] bg-white/[0.03] text-foreground/60' : 'border-transparent opacity-20 text-foreground/30'"
          @click="emit('toggleEdgeType', type)"
        >
          {{ type.replace(/_/g, " ").toLowerCase() }}
          <span class="text-foreground/15 tabular-nums">{{ count.toLocaleString() }}</span>
        </button>
      </div>
    </div>

    <Button
      variant="ghost"
      size="xs"
      class="inline-flex items-center gap-1.5 text-[11px] font-medium transition-all"
      :class="showLabels ? 'text-primary' : 'text-foreground/30'"
      @click="emit('toggleShowLabels')"
    >
      <Checkbox :model-value="showLabels" class="pointer-events-none size-3.5" />
      Show labels
    </Button>
  </div>
</template>
