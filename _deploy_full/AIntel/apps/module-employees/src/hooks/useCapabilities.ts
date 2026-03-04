export function useCapabilities() {
  return {
    canCreate: true,
    canEdit: true,
    canDelete: true,
  } as const;
}
