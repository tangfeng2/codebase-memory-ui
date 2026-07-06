<script setup lang="ts">
import { computed, ref } from "vue";
import Button from "@/components/ui/Button.vue";
import GraphTab from "./components/GraphTab.vue";
import StatsTab from "./components/StatsTab.vue";
import ControlTab from "./components/ControlTab.vue";
import type { TabId } from "./lib/types";
import { useUiMessages } from "./lib/i18n";

const t = useUiMessages();
const activeTab = ref<TabId>("stats");
const selectedProject = ref<string | null>(null);

const tabs = computed(() => [
  { id: "graph" as const, label: t.value.tabs.graph },
  { id: "stats" as const, label: t.value.tabs.projects },
  { id: "control" as const, label: t.value.tabs.control },
]);

function selectProject(project: string) {
  selectedProject.value = project;
  activeTab.value = "graph";
}

function clearProject() {
  selectedProject.value = null;
  activeTab.value = "stats";
}
</script>

<template>
  <div class="h-screen flex flex-col bg-background text-foreground">
    <header class="flex items-center justify-between px-5 h-12 border-b border-border bg-[#0b1920]/80 backdrop-blur-md shrink-0">
      <div class="flex items-center gap-6">
        <div class="flex items-center gap-2.5">
          <div class="w-[7px] h-[7px] rounded-full bg-primary" />
          <span class="text-[13px] font-semibold text-foreground/90 tracking-tight">
            Codebase Memory
          </span>
        </div>

        <nav class="flex items-center gap-0.5">
          <Button
            v-for="tab in tabs"
            :key="tab.id"
            variant="ghost"
            size="xs"
            class="px-3 py-1 rounded-md text-[12px] font-medium transition-all"
            :class="activeTab === tab.id ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]'"
            @click="activeTab = tab.id"
          >
            {{ tab.label }}
          </Button>
        </nav>
      </div>

      <div
        v-if="selectedProject"
        class="flex items-center gap-2 px-3 py-1 rounded-lg bg-white/[0.04] border border-border/30"
      >
        <span class="text-[10px] text-foreground/30 uppercase tracking-wider">
          {{ t.graph.selectedLabel }}
        </span>
        <span class="text-[11px] text-primary font-mono truncate max-w-[300px]">
          {{ selectedProject }}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          class="text-foreground/20 hover:text-foreground/50 text-[12px] ml-1 transition-colors"
          @click="clearProject"
        >
          x
        </Button>
      </div>
    </header>

    <main class="flex-1 min-h-0">
      <GraphTab v-if="activeTab === 'graph'" :project="selectedProject" />
      <ControlTab v-else-if="activeTab === 'control'" />
      <StatsTab v-else @select-project="selectProject" />
    </main>
  </div>
</template>
