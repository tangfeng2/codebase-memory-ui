import { ref, type Ref } from "vue";
import type { GraphData } from "../lib/types";

interface UseGraphDataResult {
  data: Ref<GraphData | null>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  fetchOverview: (project: string) => void;
  fetchDetail: (project: string, centerNode: string) => void;
}

export const GRAPH_RENDER_NODE_LIMIT = 2000;

export async function fetchLayout(
  project: string,
  maxNodes = GRAPH_RENDER_NODE_LIMIT,
): Promise<GraphData> {
  const params = new URLSearchParams({ project, max_nodes: String(maxNodes) });
  const res = await fetch(`/api/layout?${params}`);

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  return res.json();
}

export function useGraphData(): UseGraphDataResult {
  const data = ref<GraphData | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const fetchOverview = async (project: string) => {
    loading.value = true;
    error.value = null;
    try {
      const result = await fetchLayout(project);
      data.value = result;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to fetch layout";
    } finally {
      loading.value = false;
    }
  };

  const fetchDetail = async (project: string, _centerNode: string) => {
      loading.value = true;
      error.value = null;
      try {
        /* TODO: detail level with center_node filtering */
        const result = await fetchLayout(project);
        data.value = result;
      } catch (e) {
        error.value = e instanceof Error ? e.message : "Failed to fetch layout";
      } finally {
        loading.value = false;
      }
    };

  return { data, loading, error, fetchOverview, fetchDetail };
}
