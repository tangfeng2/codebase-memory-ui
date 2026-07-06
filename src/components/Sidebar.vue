<script setup lang="ts">
import { computed, ref } from "vue";
import TreeItem from "./TreeItem.vue";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import ScrollArea from "@/components/ui/ScrollArea.vue";
import { buildFileTree, flattenSingleChild } from "../lib/fileTree";
import type { GraphNode } from "../lib/types";
import { useUiMessages } from "../lib/i18n";

const props = defineProps<{
  nodes: GraphNode[];
  selectedPath: string | null;
}>();

const emit = defineEmits<{
  selectPath: [path: string, nodeIds: Set<number>];
}>();

const t = useUiMessages();
const search = ref("");

const tree = computed(() => flattenSingleChild(buildFileTree(props.nodes)));
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return null;
  return props.nodes
    .filter((node) => node.name.toLowerCase().includes(q) || (node.file_path ?? "").toLowerCase().includes(q))
    .slice(0, 50);
});
const topLevel = computed(() => [...tree.value.children.values()].sort((a, b) => a.name.localeCompare(b.name)));
</script>

<template>
  <div class="flex flex-col flex-1 min-h-0">
    <div class="px-3 py-2.5 border-b border-border/30">
      <Input
        v-model="search"
        type="text"
        :placeholder="t.graph.search"
        class="h-auto bg-white/[0.04] border-white/[0.06] rounded-lg py-1.5 text-[12px] text-foreground placeholder-foreground/25 focus:border-primary/40 focus:bg-white/[0.06]"
      />
    </div>

    <ScrollArea class="flex-1 min-h-0">
      <div class="py-1">
        <template v-if="filtered">
          <p v-if="filtered.length === 0" class="text-foreground/20 text-[12px] px-4 py-6 text-center">
            {{ t.common.noMatches }}
          </p>
          <template v-else>
            <button
              v-for="node in filtered"
              :key="node.id"
              type="button"
              class="flex items-center gap-2 w-full text-left px-4 py-1.5 text-[11px] hover:bg-white/[0.03] transition-colors"
              @click="emit('selectPath', node.file_path ?? '', new Set([node.id]))"
            >
              <span class="w-[5px] h-[5px] rounded-full shrink-0" :style="{ backgroundColor: node.color }" />
              <span class="text-foreground/60 truncate">{{ node.name }}</span>
              <span class="text-foreground/15 ml-auto text-[10px] font-mono truncate max-w-[100px]">{{ node.file_path }}</span>
            </button>
          </template>
        </template>
        <template v-else>
          <TreeItem
            v-for="child in topLevel"
            :key="child.fullPath"
            :dir="child"
            :depth="0"
            :selected-path="selectedPath"
            @select="(path, ids) => emit('selectPath', path, ids)"
          />
        </template>
      </div>
    </ScrollArea>

    <div v-if="selectedPath" class="px-3 py-2 border-t border-border/30">
      <Button
        variant="ghost"
        size="sm"
        class="w-full px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] text-[11px] text-foreground/40 font-medium transition-all"
        @click="emit('selectPath', '', new Set())"
      >
        {{ t.graph.clearSelection }}
      </Button>
    </div>
  </div>
</template>
