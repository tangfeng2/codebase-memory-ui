<script setup lang="ts">
import { computed, ref } from "vue";
import type { DirNode } from "../lib/fileTree";

const props = defineProps<{
  dir: DirNode;
  depth: number;
  selectedPath: string | null;
}>();

const emit = defineEmits<{
  select: [path: string, nodeIds: Set<number>];
}>();

const expanded = ref(false);
const isSelected = computed(() => props.selectedPath === props.dir.fullPath);
const sorted = computed(() => [...props.dir.children.values()].sort((a, b) => a.name.localeCompare(b.name)));
const sortedNodes = computed(() => [...props.dir.directNodes].sort((a, b) => a.name.localeCompare(b.name)));

function selectDir() {
  expanded.value = !expanded.value;
  emit("select", props.dir.fullPath, props.dir.nodeIds);
}

function forwardSelect(path: string, nodeIds: Set<number>) {
  emit("select", path, nodeIds);
}
</script>

<template>
  <div>
    <button
      type="button"
      class="flex items-center gap-1.5 w-full text-left px-3 py-[5px] text-[12px] transition-colors"
      :class="isSelected ? 'bg-primary/10 text-primary' : 'text-foreground/60 hover:text-foreground/80 hover:bg-white/[0.03]'"
      :style="{ paddingLeft: `${depth * 16 + 12}px` }"
      @click="selectDir"
    >
      <span class="text-foreground/20 w-3 text-center text-[10px] shrink-0">
        {{ dir.children.size > 0 || dir.directNodes.length > 0 ? (expanded ? "▾" : "▸") : "" }}
      </span>
      <span class="truncate font-medium">{{ dir.name }}</span>
      <span class="text-foreground/15 ml-auto text-[10px] tabular-nums shrink-0">{{ dir.nodeIds.size }}</span>
    </button>

    <template v-if="expanded">
      <TreeItem
        v-for="child in sorted"
        :key="child.fullPath"
        :dir="child"
        :depth="depth + 1"
        :selected-path="selectedPath"
        @select="forwardSelect"
      />
      <button
        v-for="node in sortedNodes"
        :key="node.id"
        type="button"
        class="flex items-center gap-1.5 w-full text-left px-3 py-[3px] text-[11px] text-foreground/40 hover:text-foreground/60 hover:bg-white/[0.02] transition-colors"
        :style="{ paddingLeft: `${(depth + 1) * 16 + 12}px` }"
        @click="emit('select', `${dir.fullPath}/${node.name}`, new Set([node.id]))"
      >
        <span class="w-[5px] h-[5px] rounded-full shrink-0" :style="{ backgroundColor: node.color }" />
        <span class="truncate font-mono">{{ node.name }}</span>
        <span class="text-foreground/10 ml-auto text-[10px] shrink-0">{{ node.label }}</span>
      </button>
    </template>
  </div>
</template>
