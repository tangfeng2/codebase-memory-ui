<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Badge from "@/components/ui/Badge.vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import Input from "@/components/ui/Input.vue";
import ScrollArea from "@/components/ui/ScrollArea.vue";
import { useProjects } from "../hooks/useProjects";
import { colorForLabel } from "../lib/colors";
import { useUiMessages } from "../lib/i18n";
import type { SchemaInfo } from "../lib/types";

const emit = defineEmits<{
  selectProject: [project: string];
}>();

const t = useUiMessages();
const { projects, loading, error, refresh } = useProjects();
const showModal = ref(false);
const indexing = ref(false);
const indexJobs = ref<{ slot: number; status: string; path: string }[]>([]);
const health = ref<Record<string, { status: string; info: string }>>({});
let indexTimer = 0;

const aggregate = computed(() => {
  let totalNodes = 0;
  let totalEdges = 0;
  for (const project of projects.value) {
    totalNodes += project.schema?.node_labels?.reduce((sum, label) => sum + label.count, 0) ?? 0;
    totalEdges += project.schema?.edge_types?.reduce((sum, edge) => sum + edge.count, 0) ?? 0;
  }
  return { projects: projects.value.length, nodes: totalNodes, edges: totalEdges };
});

const activeIndexJobs = computed(() => indexJobs.value.filter((job) => job.status === "indexing"));

async function fetchHealth(name: string) {
  try {
    const data = await (await fetch(`/api/project-health?name=${encodeURIComponent(name)}`)).json();
    let info = "";
    if (data.nodes !== undefined) {
      const sizeMB = ((data.size_bytes ?? 0) / 1024 / 1024).toFixed(1);
      info = `${Number(data.nodes ?? 0).toLocaleString()} nodes, ${Number(data.edges ?? 0).toLocaleString()} edges, ${sizeMB} MB`;
    } else if (data.reason) {
      info = data.reason;
    }
    health.value = { ...health.value, [name]: { status: data.status ?? "corrupt", info } };
  } catch {
    health.value = { ...health.value, [name]: { status: "corrupt", info: "" } };
  }
}

watch(
  projects,
  (nextProjects) => {
    for (const item of nextProjects) void fetchHealth(item.project.name);
  },
  { immediate: true },
);

function healthColor(status = "loading") {
  if (status === "healthy") return "#34d399";
  if (status === "missing") return "#fbbf24";
  if (status === "corrupt") return "#f87171";
  return "#555";
}

function healthLabel(status = "loading") {
  if (status === "healthy") return t.value.projects.healthHealthy;
  if (status === "missing") return t.value.projects.healthMissing;
  if (status === "corrupt") return t.value.projects.healthCorrupt;
  return t.value.projects.healthChecking;
}

function schemaNodeCount(schema: Partial<SchemaInfo>) {
  return schema.total_nodes ?? schema.node_labels?.reduce((sum, label) => sum + (label.count ?? 0), 0) ?? 0;
}

function schemaEdgeCount(schema: Partial<SchemaInfo>) {
  return schema.total_edges ?? schema.edge_types?.reduce((sum, edge) => sum + (edge.count ?? 0), 0) ?? 0;
}

async function deleteProject(name: string) {
  if (!confirm(t.value.projects.deleteConfirm(name))) return;
  try {
    await fetch(`/api/project?name=${encodeURIComponent(name)}`, { method: "DELETE" });
    await refresh();
  } catch {
    /* ignore */
  }
}

async function pollIndexStatus() {
  try {
    const data = await (await fetch("/api/index-status")).json();
    indexJobs.value = data;
    if (data.length > 0 && data.every((job: { status: string }) => job.status !== "indexing")) {
      indexing.value = false;
      await refresh();
    }
  } catch {
    /* ignore */
  }
}

onMounted(() => {
  indexTimer = window.setInterval(pollIndexStatus, 2000);
});

onBeforeUnmount(() => {
  window.clearInterval(indexTimer);
});

const currentPath = ref("");
const dirs = ref<string[]>([]);
const roots = ref<string[]>(["/"]);
const parentPath = ref("");
const projectName = ref("");
const filter = ref("");
const activeIndex = ref(0);
const browseLoading = ref(false);
const submitting = ref(false);
const modalError = ref<string | null>(null);

const filteredDirs = computed(() => {
  const q = filter.value.trim().toLowerCase();
  if (!q) return dirs.value;
  return dirs.value.filter((dir) => dir.toLowerCase().includes(q));
});

const segments = computed(() => currentPath.value.replace(/\\/g, "/").split("/").filter(Boolean));

function joinPath(base: string, dir: string): string {
  if (!base || base === "/") return `/${dir}`;
  if (/^[A-Za-z]:[\\/]?$/.test(base)) return `${base[0]}:/${dir}`;
  const slash = base.includes("\\") && !base.includes("/") ? "\\" : "/";
  return `${base.replace(/[\\/]+$/, "")}${slash}${dir}`;
}

async function browse(path?: string) {
  browseLoading.value = true;
  modalError.value = null;
  try {
    const query = path ? `?path=${encodeURIComponent(path)}` : "";
    const data = await (await fetch(`/api/browse${query}`)).json();
    if (data.error) throw new Error(data.error);
    currentPath.value = data.path ?? "";
    dirs.value = (data.dirs ?? []).sort();
    roots.value = data.roots ?? ["/"];
    parentPath.value = data.parent ?? "/";
  } catch (e) {
    modalError.value = e instanceof Error ? e.message : "Browse failed";
  } finally {
    browseLoading.value = false;
  }
}

async function submit(path = currentPath.value) {
  if (!path) return;
  submitting.value = true;
  modalError.value = null;
  try {
    const body: { root_path: string; project_name?: string } = { root_path: path };
    if (projectName.value.trim()) body.project_name = projectName.value.trim();
    const res = await fetch("/api/index", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed");
    indexing.value = true;
    showModal.value = false;
    await refresh();
  } catch (e) {
    modalError.value = e instanceof Error ? e.message : "Failed";
  } finally {
    submitting.value = false;
  }
}

function openModal() {
  showModal.value = true;
  void browse();
}

function onFilterKeyDown(event: KeyboardEvent) {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    activeIndex.value = Math.min(activeIndex.value + 1, Math.max(filteredDirs.value.length - 1, 0));
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    activeIndex.value = Math.max(activeIndex.value - 1, 0);
  } else if (event.key === "Enter" && filteredDirs.value.length > 0) {
    event.preventDefault();
    const dir = filteredDirs.value.length === 1 ? filteredDirs.value[0] : filteredDirs.value[activeIndex.value];
    if (filteredDirs.value.length === 1) void submit(joinPath(currentPath.value, dir));
    else void browse(joinPath(currentPath.value, dir));
  }
}

const adrOpenFor = ref<string | null>(null);
const adrHas = ref<Record<string, boolean>>({});
const adrContent = ref("");
const adrUpdatedAt = ref("");
const adrSaving = ref(false);

async function fetchAdr(project: string) {
  try {
    const data = await (await fetch(`/api/adr?project=${encodeURIComponent(project)}`)).json();
    adrHas.value = { ...adrHas.value, [project]: data.has_adr ?? false };
    adrContent.value = data.content ?? "";
    adrUpdatedAt.value = data.updated_at ?? "";
  } catch {
    adrHas.value = { ...adrHas.value, [project]: false };
  }
}

function openAdr(project: string) {
  adrOpenFor.value = project;
  void fetchAdr(project);
}

async function saveAdr() {
  if (!adrOpenFor.value) return;
  adrSaving.value = true;
  try {
    await fetch("/api/adr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: adrOpenFor.value, content: adrContent.value }),
    });
    await fetchAdr(adrOpenFor.value);
    adrOpenFor.value = null;
  } catch {
    /* ignore */
  } finally {
    adrSaving.value = false;
  }
}

watch(
  projects,
  (nextProjects) => {
    for (const item of nextProjects) void fetchAdr(item.project.name);
  },
  { immediate: true },
);
</script>

<template>
  <ScrollArea class="h-full">
    <div class="p-8 max-w-3xl mx-auto">
      <div v-if="projects.length > 0" class="flex gap-4 mb-8">
        <Card
          v-for="stat in [
            { label: t.tabs.projects, value: aggregate.projects, color: 'text-primary' },
            { label: t.projects.nodes, value: aggregate.nodes, color: 'text-foreground/80' },
            { label: t.projects.edges, value: aggregate.edges, color: 'text-foreground/80' },
          ]"
          :key="stat.label"
          class="flex-1 gap-0 rounded-xl border-border/30 bg-white/[0.02] p-4 py-4"
        >
          <p class="text-[10px] text-foreground/25 uppercase tracking-widest mb-1">{{ stat.label }}</p>
          <p class="text-[22px] font-semibold tabular-nums" :class="stat.color">{{ stat.value.toLocaleString() }}</p>
        </Card>
      </div>

      <Card v-if="indexing && activeIndexJobs.length > 0" class="gap-0 rounded-xl border-primary/20 bg-primary/5 p-4 py-4 mb-6">
        <div v-for="job in activeIndexJobs" :key="job.slot" class="flex items-center gap-3">
          <div class="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin shrink-0" />
          <div>
            <p class="text-[12px] text-primary font-medium">{{ t.projects.indexingInProgress }}</p>
            <p class="text-[11px] text-foreground/30 font-mono">{{ job.path }}</p>
          </div>
        </div>
      </Card>

      <div class="flex items-center justify-between mb-6">
        <h2 class="text-[15px] font-semibold text-foreground/80">{{ t.projects.indexedProjects }}</h2>
        <div class="flex items-center gap-2">
          <Button size="sm" class="bg-primary/15 hover:bg-primary/25 text-primary" @click="openModal">
            + {{ t.index.newIndex }}
          </Button>
          <Button variant="ghost" size="sm" class="bg-white/[0.04] hover:bg-white/[0.07] text-foreground/40" :disabled="loading" @click="refresh">
            {{ loading ? "..." : t.common.refresh }}
          </Button>
        </div>
      </div>

      <Card v-if="error" class="gap-0 rounded-xl border-destructive/20 bg-destructive/5 p-4 py-4 mb-6">
        <p class="text-destructive text-[13px]">{{ error }}</p>
      </Card>

      <div v-if="!loading && projects.length === 0 && !error" class="text-center py-20">
        <p class="text-foreground/25 text-[13px] mb-2">{{ t.projects.noIndexedProjects }}</p>
        <Button class="bg-primary/15 hover:bg-primary/25 text-primary text-[12px]" @click="openModal">
          {{ t.projects.indexFirstRepository }}
        </Button>
      </div>

      <div class="space-y-3">
        <Card v-for="project in projects" :key="project.project.name" class="gap-0 rounded-xl border-border/30 bg-white/[0.02] hover:bg-white/[0.035] transition-all p-5 py-5">
          <div class="flex items-start justify-between gap-3 mb-3">
            <div class="min-w-0 flex items-start gap-2.5">
              <div class="mt-1.5 group relative inline-flex items-center">
                <span class="absolute w-3 h-3 rounded-full animate-pulse opacity-40 blur-[3px]" :style="{ backgroundColor: healthColor(health[project.project.name]?.status) }" />
                <span class="relative w-[8px] h-[8px] rounded-full" :style="{ backgroundColor: healthColor(health[project.project.name]?.status), boxShadow: `0 0 6px ${healthColor(health[project.project.name]?.status)}80` }" />
                <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 hidden group-hover:block z-20 pointer-events-none">
                  <div class="bg-[#0b1920] border border-border/50 rounded-lg px-3 py-2 text-[11px] whitespace-nowrap shadow-xl">
                    <p class="font-medium" :style="{ color: healthColor(health[project.project.name]?.status) }">
                      {{ healthLabel(health[project.project.name]?.status) }}
                    </p>
                    <p v-if="health[project.project.name]?.info" class="text-foreground/35 text-[10px] mt-0.5">
                      {{ health[project.project.name].info }}
                    </p>
                  </div>
                </div>
              </div>
              <div class="min-w-0">
                <h3 class="text-[14px] font-semibold text-foreground/90 mb-0.5">{{ project.project.name }}</h3>
                <p class="text-[11px] text-foreground/20 font-mono truncate">{{ project.project.root_path }}</p>
              </div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <Button size="xs" class="px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all" :class="adrHas[project.project.name] ? 'bg-accent/15 text-accent hover:bg-accent/25' : 'bg-white/[0.03] text-foreground/25 hover:text-foreground/40 hover:bg-white/[0.06]'" @click="openAdr(project.project.name)">
                {{ adrHas[project.project.name] ? "ADR" : "+ ADR" }}
              </Button>
              <Button size="sm" class="bg-primary/15 hover:bg-primary/25 text-primary" @click="emit('selectProject', project.project.name)">
                {{ t.projects.viewGraph }}
              </Button>
              <Button variant="ghost" size="xs" class="px-2 py-1.5 rounded-lg hover:bg-destructive/10 text-foreground/20 hover:text-destructive text-[12px] transition-all" :title="t.projects.deleteTitle" @click="deleteProject(project.project.name)">
                x
              </Button>
            </div>
          </div>

          <template v-if="project.schema">
            <div class="flex gap-6 text-[12px] text-foreground/30 mb-3">
              <span><strong class="text-foreground/55 tabular-nums">{{ schemaNodeCount(project.schema).toLocaleString() }}</strong> {{ t.projects.nodes }}</span>
              <span><strong class="text-foreground/55 tabular-nums">{{ schemaEdgeCount(project.schema).toLocaleString() }}</strong> {{ t.projects.edges }}</span>
            </div>
            <div class="flex flex-wrap gap-1">
              <Badge
                v-for="label in project.schema.node_labels"
                :key="label.label"
                class="inline-flex items-center gap-1 px-1.5 py-[2px] rounded-md text-[10px] font-medium"
                :style="{ backgroundColor: `${colorForLabel(label.label)}10`, color: `${colorForLabel(label.label)}bb` }"
              >
                <span class="w-[4px] h-[4px] rounded-full" :style="{ backgroundColor: colorForLabel(label.label) }" />
                {{ label.label }} {{ (label.count ?? 0).toLocaleString() }}
              </Badge>
            </div>
          </template>
        </Card>
      </div>
    </div>

    <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center" @click="showModal = false">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div class="relative bg-[#0e2028] border border-border/40 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden" style="height: min(82vh, 680px)" @click.stop>
        <div class="px-5 pt-5 pb-3 shrink-0">
          <h3 class="text-[15px] font-semibold text-foreground/90 mb-1">{{ t.index.selectRepositoryFolder }}</h3>
          <p class="text-[12px] text-foreground/30">{{ t.index.instructions }}</p>
        </div>
        <div class="px-5 pb-3 grid grid-cols-[1fr_220px] gap-3 shrink-0">
          <label class="block">
            <span class="block text-[10px] uppercase tracking-widest text-foreground/25 mb-1">{{ t.index.repositoryPath }}</span>
            <Input v-model="currentPath" class="bg-white/[0.04] border-white/[0.06] rounded-lg text-[12px] text-foreground font-mono focus:border-primary/40" />
          </label>
          <label class="block">
            <span class="block text-[10px] uppercase tracking-widest text-foreground/25 mb-1">{{ t.index.projectName }}</span>
            <Input v-model="projectName" :placeholder="t.index.projectNamePlaceholder" class="bg-white/[0.04] border-white/[0.06] rounded-lg text-[12px] text-foreground focus:border-primary/40 placeholder:text-foreground/20" />
          </label>
        </div>
        <div class="px-5 pb-3 flex items-center gap-2 shrink-0">
          <Input v-model="filter" :placeholder="t.index.filterFolders" class="flex-1 bg-white/[0.04] border-white/[0.06] rounded-lg text-[12px] text-foreground focus:border-primary/40 placeholder:text-foreground/20" @keydown="onFilterKeyDown" />
          <Button v-for="root in roots" :key="root" variant="ghost" size="sm" class="px-2.5 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] text-[11px] text-foreground/45 font-mono transition-all" @click="browse(root)">
            {{ root }}
          </Button>
        </div>
        <div class="px-5 py-2 border-y border-border/20 flex items-center gap-0.5 overflow-x-auto text-[11px] shrink-0">
          <Button variant="link" size="xs" class="h-auto p-0 text-primary/60 hover:text-primary shrink-0 transition-colors" @click="browse('/')">/</Button>
          <span v-for="(segment, index) in segments" :key="`${segment}-${index}`" class="flex items-center gap-0.5 shrink-0">
            <span class="text-foreground/15">/</span>
            <Button variant="link" size="xs" class="h-auto p-0 transition-colors" :class="index === segments.length - 1 ? 'text-foreground/70 font-medium' : 'text-primary/50 hover:text-primary'" @click="browse('/' + segments.slice(0, index + 1).join('/'))">
              {{ segment }}
            </Button>
          </span>
        </div>
        <ScrollArea class="flex-1 min-h-0">
          <div class="px-2 py-1">
            <Button v-if="currentPath !== '/'" variant="ghost" class="flex items-center justify-start gap-2 w-full text-left px-3 py-2 rounded-lg hover:bg-white/[0.04] text-[12px] text-foreground/40 transition-colors" @click="browse(parentPath)">
              <span class="text-foreground/20">↑</span><span>..</span>
            </Button>
            <p v-if="browseLoading" class="text-foreground/20 text-[12px] text-center py-8">{{ t.common.loading }}</p>
            <p v-else-if="filteredDirs.length === 0" class="text-foreground/15 text-[12px] text-center py-8">{{ t.index.noSubdirectories }}</p>
            <template v-else>
              <div
                v-for="(dir, index) in filteredDirs"
                :key="dir"
                class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] transition-colors group"
                :class="index === activeIndex ? 'bg-white/[0.05]' : 'hover:bg-white/[0.04]'"
              >
                <button type="button" class="flex min-w-0 flex-1 items-center gap-2 text-left text-foreground/60" @click="browse(joinPath(currentPath, dir))">
                  <span class="text-foreground/20 group-hover:text-foreground/40">/</span>
                  <span class="truncate">{{ dir }}</span>
                </button>
                <Button size="xs" class="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 px-2 py-1 rounded-md bg-primary/15 hover:bg-primary/25 text-primary text-[10px] font-medium transition-all disabled:opacity-30" :disabled="submitting" @click="submit(joinPath(currentPath, dir))">
                  {{ t.index.indexThisFolder }}
                </Button>
              </div>
            </template>
          </div>
        </ScrollArea>
        <div class="px-5 py-4 border-t border-border/20 shrink-0">
          <div v-if="modalError" class="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 mb-3">
            <p class="text-destructive text-[11px]">{{ modalError }}</p>
          </div>
          <div class="flex items-center justify-between">
            <p class="text-[11px] text-foreground/25 font-mono truncate max-w-[250px]">{{ currentPath }}</p>
            <div class="flex gap-2 shrink-0">
              <Button variant="ghost" class="px-3 py-2 rounded-lg text-[12px] text-foreground/40 hover:bg-white/[0.04] font-medium transition-all" @click="showModal = false">{{ t.common.cancel }}</Button>
              <Button class="px-4 py-2 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary text-[12px] font-medium transition-all disabled:opacity-30" :disabled="submitting || !currentPath" @click="submit()">
                {{ submitting ? t.index.starting : t.index.indexThisFolder }}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="adrOpenFor" class="fixed inset-0 z-50 flex items-center justify-center" @click="adrOpenFor = null">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div class="relative bg-[#0e2028] border border-border/40 rounded-2xl p-6 w-full max-w-2xl shadow-2xl max-h-[80vh] flex flex-col" @click.stop>
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="text-[15px] font-semibold text-foreground/90">{{ t.adr.title }}</h3>
            <p class="text-[11px] text-foreground/30 font-mono mt-0.5">{{ adrOpenFor }}</p>
          </div>
          <Button variant="ghost" size="icon-xs" class="text-foreground/20 hover:text-foreground/50 text-[16px] p-1" @click="adrOpenFor = null">x</Button>
        </div>
        <p v-if="adrUpdatedAt" class="text-[10px] text-foreground/20 mb-3">{{ t.adr.lastUpdated }}: {{ adrUpdatedAt }}</p>
        <textarea
          v-model="adrContent"
          class="flex-1 min-h-[300px] bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-[12px] text-foreground font-mono placeholder-foreground/15 outline-none focus:border-primary/30 resize-none leading-relaxed"
          placeholder="# Architecture Decision Record&#10;&#10;## Context&#10;...&#10;&#10;## Decision&#10;...&#10;&#10;## Consequences&#10;..."
        />
        <div class="flex justify-end gap-2 mt-4">
          <Button v-if="adrOpenFor && adrHas[adrOpenFor]" variant="ghost" class="px-3 py-2 rounded-lg text-[12px] text-destructive/60 hover:text-destructive hover:bg-destructive/10 font-medium transition-all" @click="adrContent = ''; saveAdr()">
            {{ t.common.delete }}
          </Button>
          <Button variant="ghost" class="px-4 py-2 rounded-lg text-[12px] text-foreground/40 hover:bg-white/[0.04] font-medium transition-all" @click="adrOpenFor = null">{{ t.common.cancel }}</Button>
          <Button class="px-4 py-2 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary text-[12px] font-medium transition-all disabled:opacity-30" :disabled="adrSaving" @click="saveAdr">
            {{ adrSaving ? t.common.saving : t.common.save }}
          </Button>
        </div>
      </div>
    </div>
  </ScrollArea>
</template>
