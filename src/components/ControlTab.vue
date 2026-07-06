<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import ScrollArea from "@/components/ui/ScrollArea.vue";
import type { ProcessInfo } from "../lib/types";
import { useUiMessages } from "../lib/i18n";

const t = useUiMessages();
const processes = ref<ProcessInfo[]>([]);
const selfMetrics = ref({ rss_mb: 0, user_cpu: 0, sys_cpu: 0 });
const selectedPid = ref<number | null>(null);
const logLines = ref<string[]>([]);
let processTimer = 0;
let logTimer = 0;

const totalCpu = computed(() => processes.value.reduce((sum, proc) => sum + proc.cpu, 0));
const totalRam = computed(() => processes.value.reduce((sum, proc) => sum + proc.rss_mb, 0));

function gaugePercent(value: number, max: number) {
  return Math.min(100, (value / max) * 100);
}

function gaugeColor(value: number, max: number) {
  const pct = gaugePercent(value, max);
  return pct > 80 ? "#e05252" : pct > 50 ? "#eab308" : "#1DA27E";
}

async function fetchProcesses() {
  try {
    const data = await (await fetch("/api/processes")).json();
    processes.value = data.processes ?? [];
    selfMetrics.value = {
      rss_mb: data.self_rss_mb ?? 0,
      user_cpu: data.self_user_cpu_s ?? 0,
      sys_cpu: data.self_sys_cpu_s ?? 0,
    };
  } catch {
    /* ignore */
  }
}

async function fetchLogs() {
  try {
    const data = await (await fetch("/api/logs?lines=200")).json();
    logLines.value = data.lines ?? [];
  } catch {
    /* ignore */
  }
}

async function killProcess(pid: number) {
  if (!confirm(t.value.control.killConfirm(pid))) return;
  try {
    await fetch("/api/process-kill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pid }),
    });
    window.setTimeout(fetchProcesses, 1000);
  } catch {
    /* ignore */
  }
}

onMounted(() => {
  void fetchProcesses();
  void fetchLogs();
  processTimer = window.setInterval(fetchProcesses, 3000);
  logTimer = window.setInterval(fetchLogs, 2000);
});

onBeforeUnmount(() => {
  window.clearInterval(processTimer);
  window.clearInterval(logTimer);
});
</script>

<template>
  <ScrollArea class="h-full">
    <div class="p-8 max-w-4xl mx-auto">
      <h2 class="text-[15px] font-semibold text-foreground/80 mb-6">{{ t.control.panel }}</h2>

      <div class="flex gap-4 mb-8">
        <Card
          v-for="gauge in [
            { label: t.control.totalCpu, value: totalCpu, max: 100 * processes.length || 100, unit: '%', color: 'text-foreground/80' },
            { label: t.control.totalRam, value: totalRam, max: 4096, unit: 'MB', color: 'text-foreground/80' },
            { label: t.control.processes, value: processes.length, max: 10, unit: '', color: 'text-primary' },
            { label: t.control.selfRam, value: selfMetrics.rss_mb, max: 2048, unit: 'MB', color: 'text-primary' },
          ]"
          :key="gauge.label"
          class="flex-1 gap-0 rounded-xl border-border/30 bg-white/[0.02] p-4 py-4"
        >
          <p class="text-[10px] text-foreground/25 uppercase tracking-widest mb-2">{{ gauge.label }}</p>
          <p class="text-[20px] font-semibold tabular-nums" :class="gauge.color">
            {{ Number(gauge.value).toFixed(1) }}<span class="text-[11px] text-foreground/30 ml-1">{{ gauge.unit }}</span>
          </p>
          <div class="mt-2 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-500"
              :style="{ width: `${gaugePercent(Number(gauge.value), Number(gauge.max))}%`, backgroundColor: gaugeColor(Number(gauge.value), Number(gauge.max)) }"
            />
          </div>
        </Card>
      </div>

      <div class="mb-8">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-[13px] font-medium text-foreground/50">{{ t.control.activeProcesses }}</h3>
          <Button variant="link" size="xs" class="h-auto p-0 text-[11px] text-primary/60 hover:text-primary" @click="fetchProcesses">
            {{ t.common.refresh }}
          </Button>
        </div>

        <p v-if="processes.length === 0" class="text-foreground/20 text-[12px] text-center py-8">
          {{ t.control.noProcesses }}
        </p>
        <div v-else class="grid grid-cols-2 gap-3">
          <button
            v-for="proc in processes"
            :key="proc.pid"
            type="button"
            class="w-full text-left rounded-xl border p-4 transition-all"
            :class="selectedPid === proc.pid ? 'border-primary/40 bg-primary/5' : 'border-border/30 bg-white/[0.02] hover:bg-white/[0.04]'"
            @click="selectedPid = selectedPid === proc.pid ? null : proc.pid"
          >
            <div class="flex items-start justify-between mb-2">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full" :class="proc.is_self ? 'bg-primary animate-pulse' : 'bg-emerald-400'" />
                <span class="text-[12px] font-semibold text-foreground/80">PID {{ proc.pid }}</span>
                <span v-if="proc.is_self" class="text-[9px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium">{{ t.control.thisProcess }}</span>
              </div>
              <Button
                v-if="!proc.is_self"
                variant="ghost"
                size="xs"
                class="px-2 py-1 rounded-lg text-[10px] text-foreground/20 hover:text-destructive hover:bg-destructive/10 transition-all"
                @click.stop="killProcess(proc.pid)"
              >
                {{ t.control.kill }}
              </Button>
            </div>
            <div class="grid grid-cols-3 gap-3 mb-2">
              <div>
                <p class="text-[9px] text-foreground/20 uppercase">CPU</p>
                <p class="text-[13px] font-semibold tabular-nums text-foreground/70">{{ proc.cpu.toFixed(1) }}%</p>
              </div>
              <div>
                <p class="text-[9px] text-foreground/20 uppercase">RAM</p>
                <p class="text-[13px] font-semibold tabular-nums text-foreground/70">{{ proc.rss_mb.toFixed(0) }} MB</p>
              </div>
              <div>
                <p class="text-[9px] text-foreground/20 uppercase">{{ t.control.uptime }}</p>
                <p class="text-[13px] font-semibold tabular-nums text-foreground/70">{{ proc.elapsed }}</p>
              </div>
            </div>
            <p class="text-[10px] text-foreground/15 font-mono truncate">{{ proc.command }}</p>
          </button>
        </div>
      </div>

      <Card class="gap-0 rounded-xl border-border/30 bg-black/30 overflow-hidden py-0">
        <div class="px-4 py-2 border-b border-border/20">
          <span class="text-[11px] font-medium text-foreground/40">{{ t.control.processLogs }}</span>
          <span class="text-[10px] text-foreground/15 ml-2">{{ logLines.length }} lines</span>
        </div>
        <ScrollArea class="h-[400px]">
          <div class="p-3 font-mono text-[10px] leading-relaxed">
            <p v-if="logLines.length === 0" class="text-foreground/15 text-center py-8">{{ t.control.noLogs }}</p>
            <template v-else>
              <div
                v-for="(line, index) in logLines"
                :key="index"
                class="py-[1px]"
                :class="line.includes('level=error') ? 'text-red-400/70' : line.includes('level=warn') ? 'text-yellow-400/60' : 'text-foreground/30'"
              >
                {{ line }}
              </div>
            </template>
          </div>
        </ScrollArea>
      </Card>
    </div>
  </ScrollArea>
</template>
