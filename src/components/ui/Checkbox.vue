<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { cn } from "@/lib/utils";

defineOptions({ inheritAttrs: false });

const model = defineModel<boolean>({ default: false });
const attrs = useAttrs();
const checkboxClass = computed(() =>
  cn(
    "peer size-4 shrink-0 rounded-[4px] border border-input shadow-xs transition-shadow outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
    model.value ? "border-primary bg-primary text-primary-foreground" : "dark:bg-input/30",
    attrs.class as string | undefined,
  ),
);
</script>

<template>
  <button
    v-bind="{ ...attrs, class: undefined }"
    data-slot="checkbox"
    type="button"
    role="checkbox"
    :aria-checked="model"
    :class="checkboxClass"
    @click="model = !model"
  >
    <span v-if="model" class="grid place-content-center text-current text-[11px] leading-none">✓</span>
  </button>
</template>
