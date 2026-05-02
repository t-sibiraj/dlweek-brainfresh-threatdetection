import { useState } from "react";
import { Plus, Camera, Globe } from "lucide-react";
import { createSource } from "../services/api";

interface UploadPanelProps {
  onSourceCreated: () => void;
}

export function UploadPanel({ onSourceCreated }: UploadPanelProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"physical" | "online">("physical");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError("");
    try {
      const result = await createSource({ name: name.trim(), mode });
      setSuccess(
        `Created. ID: ${result.source_id.slice(0, 8)}... Token: ${result.ingestion_token.slice(0, 16)}...`
      );
      setName("");
      setShowCreate(false);
      onSourceCreated();
      setTimeout(() => setSuccess(""), 5000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div />
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#444] bg-white text-black text-[11px] font-bold hover:bg-[#ddd] transition-colors"
        >
          <Plus className="w-3 h-3" />
          New Source
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="border border-[#333] rounded-lg bg-[#0a0a0a] p-4 space-y-3"
        >
          <input
            type="text"
            placeholder="Source name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded bg-[#111] border border-[#333] text-xs text-white placeholder:text-[#666] focus:outline-none focus:border-[#555]"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("physical")}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded text-[11px] font-bold border transition-colors ${
                mode === "physical"
                  ? "bg-white text-black border-white"
                  : "bg-[#111] border-[#333] text-[#ccc] hover:border-[#555]"
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              Physical
            </button>
            <button
              type="button"
              onClick={() => setMode("online")}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded text-[11px] font-bold border transition-colors ${
                mode === "online"
                  ? "bg-white text-black border-white"
                  : "bg-[#111] border-[#333] text-[#ccc] hover:border-[#555]"
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              Online
            </button>
          </div>
          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full px-3 py-2 rounded bg-white text-black text-xs font-bold hover:bg-[#ddd] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Creating..." : "Create"}
          </button>
        </form>
      )}

      {error && (
        <p className="text-[11px] text-[#ff4444] bg-[#1a0000] px-3 py-2 rounded border border-[#440000]">
          {error}
        </p>
      )}
      {success && (
        <p className="text-[11px] text-[#ddd] bg-[#111] px-3 py-2 rounded border border-[#333]">
          {success}
        </p>
      )}
    </div>
  );
}
