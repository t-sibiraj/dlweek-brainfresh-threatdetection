const API_BASE = "/api";

// ─── Token management ─────────────────────────────────────
let _accessToken: string | null = localStorage.getItem("accessToken");
let _refreshToken: string | null = localStorage.getItem("refreshToken");

export function setTokens(access: string | null, refresh: string | null) {
  _accessToken = access;
  _refreshToken = refresh;
  if (access) localStorage.setItem("accessToken", access);
  else localStorage.removeItem("accessToken");
  if (refresh) localStorage.setItem("refreshToken", refresh);
  else localStorage.removeItem("refreshToken");
}

export function getAccessToken() {
  return _accessToken;
}

export function clearTokens() {
  setTokens(null, null);
}

async function request<T>(
  path: string,
  options?: RequestInit & { skipAuth?: boolean }
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };

  // Add auth header if token available
  if (_accessToken && !options?.skipAuth) {
    headers["Authorization"] = `Bearer ${_accessToken}`;
  }

  let res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  // If 401, try refreshing the token
  if (res.status === 401 && _refreshToken && !options?.skipAuth) {
    try {
      const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: _refreshToken }),
      });
      if (refreshRes.ok) {
        const tokens = await refreshRes.json();
        setTokens(tokens.accessToken, tokens.refreshToken);
        headers["Authorization"] = `Bearer ${tokens.accessToken}`;
        res = await fetch(`${API_BASE}${path}`, { ...options, headers });
      } else {
        clearTokens();
      }
    } catch {
      clearTokens();
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ─── Sources ──────────────────────────────────────────────
export async function fetchSources() {
  return request<any[]>("/sources");
}

export async function createSource(data: {
  name: string;
  mode: string;
  context_limit?: number;
  threat_threshold?: number;
}) {
  return request<{ source_id: string; ingestion_token: string }>("/sources", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getSourceStatus(sourceId: string) {
  return request<any>(`/sources/${sourceId}`);
}

export async function updateSource(
  sourceId: string,
  data: Record<string, any>
) {
  return request<any>(`/sources/${sourceId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteSource(sourceId: string) {
  return request<any>(`/sources/${sourceId}`, { method: "DELETE" });
}

// ─── Upload ───────────────────────────────────────────────
export async function uploadMedia(sourceId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/sources/${sourceId}/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Upload failed: ${res.status}`);
  }

  return res.json() as Promise<{ job_ids: string[] }>;
}

// ─── Jobs ─────────────────────────────────────────────────
export async function fetchJobs(sourceId?: string) {
  const qs = sourceId ? `?source_id=${sourceId}` : "";
  return request<any[]>(`/jobs${qs}`);
}

// ─── Dashboard ────────────────────────────────────────────
export async function fetchDashboard() {
  return request<any>("/dashboard");
}

// ─── Threats ──────────────────────────────────────────────
export async function fetchThreats(sourceId?: string, limit = 50) {
  const params = new URLSearchParams();
  if (sourceId) params.set("source_id", sourceId);
  params.set("limit", String(limit));
  return request<any[]>(`/threats?${params}`);
}

// ─── Config: Weights ──────────────────────────────────────
export async function fetchWeights() {
  return request<any>("/config/weights");
}

export async function updateWeight(data: {
  mode: string;
  category: string;
  weight?: number;
  active?: boolean;
}) {
  return request<any>("/config/weights", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteWeight(id: string) {
  return request<any>(`/config/weights/${id}`, { method: "DELETE" });
}

// ─── Config: Thresholds ───────────────────────────────────
export async function fetchThresholds() {
  return request<any>("/config/thresholds");
}

export async function updateThresholds(data: Record<string, number>) {
  return request<any>("/config/thresholds", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// ─── Config: System ───────────────────────────────────────
export async function fetchSystemConfig() {
  return request<Record<string, any>>("/config/system");
}

export async function updateSystemConfig(key: string, value: any) {
  return request<any>("/config/system", {
    method: "PUT",
    body: JSON.stringify({ key, value }),
  });
}

// ─── Config: Escalation ──────────────────────────────────
export async function fetchEscalationRules() {
  return request<any[]>("/config/escalation");
}

export async function updateEscalationRule(
  id: string,
  data: { config?: any; active?: boolean }
) {
  return request<any>(`/config/escalation/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// ─── Audit Log ────────────────────────────────────────────
export async function fetchAuditLog(limit = 50) {
  return request<any[]>(`/config/audit-log?limit=${limit}`);
}

// ─── Auth ─────────────────────────────────────────────────
export async function login(email: string, password: string) {
  return request<{
    user: { id: string; email: string; role: string; displayName: string };
    accessToken: string;
    refreshToken: string;
  }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    skipAuth: true,
  });
}

export async function register(
  email: string,
  password: string,
  displayName: string
) {
  return request<{
    user: { id: string; email: string; role: string; displayName: string };
    accessToken: string;
    refreshToken: string;
  }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, displayName }),
    skipAuth: true,
  });
}

export async function logout(refreshToken: string) {
  return request<{ success: boolean }>("/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
}

export async function fetchMe() {
  return request<{ user: any }>("/auth/me");
}

export async function fetchUsers() {
  return request<any[]>("/auth/users");
}

export async function updateUser(
  id: string,
  data: { role?: string; active?: boolean }
) {
  return request<any>(`/auth/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ─── Alerts: Webhooks ─────────────────────────────────────
export async function fetchWebhooks() {
  return request<any[]>("/alerts/webhooks");
}

export async function createWebhook(url: string, events: string[]) {
  return request<any>("/alerts/webhooks", {
    method: "POST",
    body: JSON.stringify({ url, events }),
  });
}

export async function deleteWebhook(id: string) {
  return request<any>(`/alerts/webhooks/${id}`, { method: "DELETE" });
}

export async function testWebhook(id: string) {
  return request<any>(`/alerts/webhooks/${id}/test`, { method: "POST" });
}

export async function fetchAlertLog(limit = 50) {
  return request<any[]>(`/alerts/log?limit=${limit}`);
}

// ─── Analytics ────────────────────────────────────────────
export async function fetchTrend(hours = 24) {
  return request<any[]>(`/analytics/trend?hours=${hours}`);
}

export async function fetchSourceAnalytics() {
  return request<any[]>("/analytics/sources");
}

export async function fetchCategoryBreakdown(hours = 24) {
  return request<any[]>(`/analytics/categories?hours=${hours}`);
}

export async function fetchLatencyStats() {
  return request<any>("/analytics/latency");
}

export async function fetchAIProviders() {
  return request<any[]>("/config/ai-providers");
}

export async function setAIProvider(provider: string) {
  return request<any>("/config/ai-provider", {
    method: "PUT",
    body: JSON.stringify({ provider }),
  });
}
