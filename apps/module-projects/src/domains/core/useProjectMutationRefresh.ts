import { useCallback } from "react";
import { triggerProjectRefresh } from "./useProject";

type RefreshCallback = (() => Promise<void> | void) | null | undefined;

export function useProjectMutationRefresh(projectId?: string | null) {
  return useCallback(
    async (...callbacks: RefreshCallback[]) => {
      const tasks: Promise<unknown>[] = [];

      callbacks.forEach((callback) => {
        if (typeof callback === "function") {
          tasks.push(
            Promise.resolve()
              .then(() => callback())
              .catch((error) => {
                console.error("Domain refresh failed", error);
              }),
          );
        }
      });

      if (projectId) {
        tasks.push(
          triggerProjectRefresh(projectId).catch((error) => {
            console.error("Project refresh failed", error);
          }),
        );
      }

      if (tasks.length === 0) {
        return;
      }

      await Promise.allSettled(tasks);
    },
    [projectId],
  );
}
