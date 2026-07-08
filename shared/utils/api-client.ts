export type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  error?: string | null;
};

const DEFAULT_ERROR = "Neznana napaka pri komunikaciji s strežnikom.";

export async function parseApiEnvelope<T>(response: Response, fallbackMessage = DEFAULT_ERROR): Promise<T> {
  let payload: ApiEnvelope<T> | null = null;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new Error(fallbackMessage);
  }

  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error ?? fallbackMessage);
  }

  return payload.data;
}

export async function fetchApi<T>(input: RequestInfo | URL, init?: RequestInit, fallbackMessage = DEFAULT_ERROR) {
  const response = await fetch(input, init);
  return parseApiEnvelope<T>(response, fallbackMessage);
}
