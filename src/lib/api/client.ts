const BASE_URL = "/api";

interface FetchOptions extends RequestInit {
  timeout?: number;
}

async function fetchWithTimeout(url: string, options: FetchOptions = {}) {
  const { timeout = 15000, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...fetchOptions.headers,
      },
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const apiClient = {
  get: async <T>(url: string): Promise<T> => {
    const res = await fetchWithTimeout(`${BASE_URL}${url}`);
    if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
    return res.json();
  },

  post: async <T>(url: string, body?: unknown): Promise<T> => {
    const res = await fetchWithTimeout(`${BASE_URL}${url}`, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`POST ${url} failed: ${res.status}`);
    return res.json();
  },

  put: async <T>(url: string, body?: unknown): Promise<T> => {
    const res = await fetchWithTimeout(`${BASE_URL}${url}`, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`PUT ${url} failed: ${res.status}`);
    return res.json();
  },

  delete: async <T>(url: string): Promise<T> => {
    const res = await fetchWithTimeout(`${BASE_URL}${url}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`DELETE ${url} failed: ${res.status}`);
    return res.json();
  },
};
