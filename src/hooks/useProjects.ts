import { onMounted, ref, type Ref } from "vue";
import { callTool } from "../api/rpc";
import type { Project, SchemaInfo } from "../lib/types";

interface ProjectInfo {
  project: Project;
  schema: SchemaInfo | null;
}

interface UseProjectsResult {
  projects: Ref<ProjectInfo[]>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  refresh: () => void;
}

export function useProjects(): UseProjectsResult {
  const projects = ref<ProjectInfo[]>([]);
  const loading = ref(true);
  const error = ref<string | null>(null);

  const fetchProjects = async () => {
    loading.value = true;
    error.value = null;
    try {
      const result = await callTool<{ projects: Project[] }>("list_projects");
      const list = result.projects ?? [];

      /* Fetch schema for each project */
      const infos: ProjectInfo[] = await Promise.all(
        list.map(async (p) => {
          try {
            const schema = await callTool<SchemaInfo>("get_graph_schema", {
              project: p.name,
            });
            return { project: p, schema };
          } catch {
            return { project: p, schema: null };
          }
        }),
      );

      projects.value = infos;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to fetch projects";
    } finally {
      loading.value = false;
    }
  };

  onMounted(fetchProjects);

  return { projects, loading, error, refresh: fetchProjects };
}
