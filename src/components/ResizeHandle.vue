<script setup lang="ts">
const props = defineProps<{
  side: "left" | "right";
}>();

const emit = defineEmits<{
  resize: [delta: number];
}>();

let dragging = false;
let lastX = 0;

function onPointerDown(event: PointerEvent) {
  dragging = true;
  lastX = event.clientX;
  (event.target as HTMLElement).setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent) {
  if (!dragging) return;
  const delta = event.clientX - lastX;
  lastX = event.clientX;
  emit("resize", props.side === "left" ? delta : -delta);
}

function onPointerUp() {
  dragging = false;
}
</script>

<template>
  <div
    class="w-1 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors shrink-0"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
  />
</template>
