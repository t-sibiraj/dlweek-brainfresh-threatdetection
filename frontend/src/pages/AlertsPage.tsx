import { useState, useEffect } from "react";
import {
  Bell,
  Plus,
  Trash2,
  TestTube2,
  Loader2,
  Check,
  X,
} from "lucide-react";
import {
  fetchWebhooks,
  createWebhook,
  deleteWebhook,
  testWebhook,
  fetchAlertLog,
} from "../services/api";
import type { WebhookEndpoint, AlertLogEntry } from "../types";

const EVENT_TYPES = [
  "threat_high",
  "threat_medium",
  "escalation",
  "source_offline",
  "system_error",
  "*",
];

export function AlertsPage() {
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([]);
  const [logs, setLogs] = useState<AlertLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newEvents, setNewEvents] = useState<string[]>(["*"]);
  const [adding, setAdding] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    id: string;
    success: boolean;
  } | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const [wh, lg] = await Promise.all([
        fetchWebhooks(),
        fetchAlertLog(30),
      ]);
      setWebhooks(wh);
      setLogs(lg);
    } catch (err) {
      console.error("Failed to load alerts:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleAdd() {
    if (!newUrl.trim()) return;
    setAdding(true);
    try {
      await createWebhook(newUrl.trim(), newEvents);
      setNewUrl("");
      setNewEvents(["*"]);
      setShowAdd(false);
      await loadData();
    } catch (err) {
      console.error("Failed to create webhook:", err);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteWebhook(id);
      await loadData();
    } catch (err) {
      console.error("Failed to delete webhook:", err);
    }
  }

  async function handleTest(id: string) {
    setTesting(id);
    setTestResult(null);
    try {
      const result = await testWebhook(id);
      setTestResult({ id, success: result.success });
    } catch {
      setTestResult({ id, success: false });
    } finally {
      setTesting(null);
      setTimeout(() => setTestResult(null), 3000);
    }
  }

  function toggleEvent(event: string) {
    setNewEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-[#ccc]" />
          <span className="text-xs font-bold tracking-[0.15em] uppercase text-white">
            Alert Configuration
          </span>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#444] bg-[#111] text-[11px] text-white font-bold uppercase tracking-wider hover:border-[#666] transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add Webhook
        </button>
      </div>

      {/* Add webhook form */}
      {showAdd && (
        <div className="border border-[#333] rounded-lg bg-[#0a0a0a] p-4 space-y-3">
          <input
            type="url"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://example.com/webhook"
            className="w-full px-3 py-2 rounded border border-[#333] bg-[#111] text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#555]"
          />

          <div>
            <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-[#ccc] block mb-2">
              Events
            </span>
            <div className="flex flex-wrap gap-2">
              {EVENT_TYPES.map((ev) => (
                <button
                  key={ev}
                  onClick={() => toggleEvent(ev)}
                  className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                    newEvents.includes(ev)
                      ? "border-white bg-[#1a1a1a] text-white"
                      : "border-[#333] text-[#999] hover:text-[#ccc]"
                  }`}
                >
                  {ev === "*" ? "All Events" : ev.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={adding || !newUrl.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded bg-white text-black text-[11px] font-bold uppercase tracking-wider hover:bg-[#ddd] transition-colors disabled:opacity-40"
            >
              {adding ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Check className="w-3 h-3" />
              )}
              Save
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="flex items-center gap-1.5 px-4 py-2 rounded border border-[#333] text-[11px] text-[#ccc] font-bold uppercase tracking-wider hover:border-[#555] transition-colors"
            >
              <X className="w-3 h-3" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Webhook list */}
      <div className="border border-[#333] rounded-lg bg-[#0a0a0a] divide-y divide-[#2a2a2a]">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-4 h-4 text-[#999] animate-spin" />
          </div>
        ) : webhooks.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-[11px] text-[#999] uppercase tracking-wider">
              No webhooks configured
            </p>
          </div>
        ) : (
          webhooks.map((wh) => (
            <div
              key={wh.id}
              className="flex items-center justify-between px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-white font-medium truncate">
                  {wh.url}
                </p>
                <div className="flex gap-1 mt-1">
                  {(wh.events as string[]).map((ev) => (
                    <span
                      key={ev}
                      className="px-1.5 py-0.5 rounded bg-[#1a1a1a] text-[8px] text-[#ccc] border border-[#333] uppercase"
                    >
                      {ev === "*" ? "all" : ev.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-3">
                {testResult?.id === wh.id && (
                  <span
                    className={`text-[10px] ${testResult.success ? "text-green-500" : "text-red-400"}`}
                  >
                    {testResult.success ? "OK" : "Failed"}
                  </span>
                )}
                <button
                  onClick={() => handleTest(wh.id)}
                  disabled={testing === wh.id}
                  className="p-1.5 rounded border border-[#333] text-[#ccc] hover:text-white hover:border-[#555] transition-colors"
                  title="Test webhook"
                >
                  {testing === wh.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <TestTube2 className="w-3 h-3" />
                  )}
                </button>
                <button
                  onClick={() => handleDelete(wh.id)}
                  className="p-1.5 rounded border border-[#333] text-[#ccc] hover:text-red-400 hover:border-[#555] transition-colors"
                  title="Delete webhook"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Alert Log */}
      <div className="border border-[#333] rounded-lg bg-[#0a0a0a] p-4">
        <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-[#ccc] block mb-3">
          Recent Alert Deliveries
        </span>
        {logs.length === 0 ? (
          <p className="text-[11px] text-[#999] text-center py-4">
            No alert deliveries yet
          </p>
        ) : (
          <div className="space-y-1 max-h-[300px] overflow-y-auto">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between px-2.5 py-1.5 rounded bg-[#111] border border-[#2a2a2a]"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      log.status === "sent"
                        ? "bg-green-500"
                        : log.status === "failed"
                        ? "bg-red-500"
                        : "bg-yellow-500"
                    }`}
                  />
                  <span className="text-[10px] text-[#ccc] uppercase">
                    {log.type}
                  </span>
                  <span className="text-[10px] text-white">
                    {log.event_type.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {log.error && (
                    <span className="text-[9px] text-red-400 truncate max-w-[150px]">
                      {log.error}
                    </span>
                  )}
                  <span className="text-[9px] text-[#999]">
                    {new Date(log.created_at).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
