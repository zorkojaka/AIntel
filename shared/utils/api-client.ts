export type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  error?: string | null;
};

const DEFAULT_ERROR = "Neznana napaka pri komunikaciji s strežnikom.";
const DEFAULT_RETRY_STATUSES = [408, 429, 500, 502, 503, 504];

export type FetchApiOptions = {
  fallbackMessage?: string;
  retries?: number;
  retryDelayMs?: number;
  retryStatuses?: number[];
  fetchImpl?: typeof fetch;
  onError?: (message: string, error: unknown) => void;
};

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeFetchOptions(fallbackMessageOrOptions?: string | FetchApiOptions): Required<Omit<FetchApiOptions, "fetchImpl" | "onError">> & Pick<FetchApiOptions, "fetchImpl" | "onError"> {
  if (typeof fallbackMessageOrOptions === "string" || fallbackMessageOrOptions === undefined) {
    return {
      fallbackMessage: fallbackMessageOrOptions ?? DEFAULT_ERROR,
      retries: 0,
      retryDelayMs: 250,
      retryStatuses: DEFAULT_RETRY_STATUSES,
    };
  }
  return {
    fallbackMessage: fallbackMessageOrOptions.fallbackMessage ?? DEFAULT_ERROR,
    retries: Math.max(0, fallbackMessageOrOptions.retries ?? 0),
    retryDelayMs: Math.max(0, fallbackMessageOrOptions.retryDelayMs ?? 250),
    retryStatuses: fallbackMessageOrOptions.retryStatuses ?? DEFAULT_RETRY_STATUSES,
    fetchImpl: fallbackMessageOrOptions.fetchImpl,
    onError: fallbackMessageOrOptions.onError,
  };
}

export async function fetchApi<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  fallbackMessageOrOptions?: string | FetchApiOptions,
) {
  const options = normalizeFetchOptions(fallbackMessageOrOptions);
  const fetcher = options.fetchImpl ?? fetch;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    try {
      const response = await fetcher(input, init);
      if (
        attempt < options.retries &&
        options.retryStatuses.includes(response.status)
      ) {
        await sleep(options.retryDelayMs);
        continue;
      }
      return await parseApiEnvelope<T>(response, options.fallbackMessage);
    } catch (error) {
      lastError = error;
      if (attempt < options.retries) {
        await sleep(options.retryDelayMs);
        continue;
      }
    }
  }

  const message = lastError instanceof Error ? lastError.message : options.fallbackMessage;
  options.onError?.(message, lastError);
  throw lastError instanceof Error ? lastError : new Error(message);
}
