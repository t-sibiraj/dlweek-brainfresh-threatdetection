import { useState, useRef } from "react";
import { Upload, Pencil, Copy, Check, ArrowRight, Loader2, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { ThreatGauge } from "./ThreatGauge";
import { PipelineEditModal } from "./PipelineEditModal";
import { StreamCapture } from "./StreamCapture";
import { uploadMedia, deleteSource } from "../services/api";
import type { SourceState } from "../types";
import type { Socket } from "socket.io-client";

interface PipelineCardProps {
  source: SourceState;
  getSocket: () => Socket | null;
  onDeleted?: () => void;
}

export function PipelineCard({ source, getSocket, onDeleted }: PipelineCardProps) {
  const [showEdit, setShowEdit] = useState(false);
  const [showApi, setShowApi] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isProcessing = source.processingCount > 0;
  const hasResults = source.lastThreatScore !== undefined;
  const score = source.lastThreatScore ?? 0;

  // Find top contributing threat category
  const topCategory = source.lastCategories?.[0]?.replace(/_/g, " ") ?? null;

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      fileRef.current?.click();
      return;
    }

    setUploading(true);
    setUploadMsg("");
    try {
      const result = await uploadMedia(source.id, file);
      setUploadMsg(`${result.job_ids.length} job(s) queued`);
      if (fileRef.current) fileRef.current.value = "";
      setTimeout(() => setUploadMsg(""), 3000);
    } catch (err: any) {
      setUploadMsg(err.message);
    } finally {
      setUploading(false);
    }
  }

  function handleFileChange() {
    if (fileRef.current?.files?.[0]) {
      handleUpload();
    }
  }

  function copyApiExample() {
    const cmd = `curl -X POST http://localhost:4000/api/ingest \\
  -H "Authorization: Bearer <INGESTION_TOKEN>" \\
  -F "source_id=${source.id}" \\
  -F "file=@/path/to/file"`;
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDelete() {
    if (!confirm(`Delete source "${source.name}"? This will also delete all its jobs.`)) return;
    setDeleting(true);
    try {
      await deleteSource(source.id);
      onDeleted?.();
    } catch (err) {
      console.error("Failed to delete source:", err);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="border border-[#333] rounded-lg bg-[#0a0a0a] overflow-hidden">
        {/* Mode Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#2a2a2a]">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-[#ccc]">
              Mode:
            </span>
            <span className="text-[11px] font-bold tracking-[0.1em] uppercase text-white">
              {source.mode}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isProcessing && (
              <Loader2 className="w-3.5 h-3.5 text-[#ccc] animate-processing" />
            )}
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="p-1 rounded text-[#888] hover:text-red-400 transition-colors disabled:opacity-40"
              title="Delete source"
            >
              {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            </button>
            <div className={`w-2 h-2 rounded-full ${source.active ? "bg-white animate-pulse-dot" : "bg-[#555]"}`} />
            <span className="text-[10px] text-[#ccc]">{source.name}</span>
          </div>
        </div>

        {/* Main 3-column layout */}
        <div className="flex divide-x divide-[#2a2a2a]">
          {/* ── LEFT: Input ── */}
          <div className="w-1/4 p-4 flex flex-col gap-3">
            <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-[#ccc]">
              Input
            </span>

            {/* Upload button */}
            <input
              ref={fileRef}
              type="file"
              accept={source.mode === "physical" ? "video/*" : "image/*"}
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded border border-[#444] bg-[#111] hover:bg-[#1a1a1a] hover:border-[#555] text-xs text-white font-medium transition-all disabled:opacity-40"
            >
              {uploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-processing" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              {uploading ? "Uploading..." : "Upload"}
            </button>

            <div className="text-[10px] text-[#bbb] text-center">or</div>

            {/* Send via API */}
            <button
              onClick={() => setShowApi(!showApi)}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded border border-[#444] bg-[#111] hover:bg-[#1a1a1a] hover:border-[#555] text-[11px] text-[#ddd] font-medium transition-all"
            >
              Send via API
            </button>

            {showApi && (
              <div className="bg-[#111] rounded border border-[#333] p-2.5 space-y-2">
                <p className="text-[9px] text-[#ccc] uppercase tracking-wider font-bold">
                  API Endpoint
                </p>
                <code className="block text-[10px] text-[#ddd] break-all leading-relaxed">
                  POST /api/ingest
                  <br />
                  Authorization: Bearer &lt;TOKEN&gt;
                  <br />
                  source_id: {source.id.slice(0, 12)}...
                </code>
                <button
                  onClick={copyApiExample}
                  className="flex items-center gap-1 text-[10px] text-[#ccc] hover:text-white transition-colors"
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? "Copied!" : "Copy cURL"}
                </button>
              </div>
            )}

            {uploadMsg && (
              <p className="text-[10px] text-[#ccc]">{uploadMsg}</p>
            )}

            {/* Live Stream Capture */}
            <StreamCapture sourceId={source.id} getSocket={getSocket} />
          </div>

          {/* ── CENTER: AI Pipeline ── */}
          <div className="flex-1 p-4 flex flex-col gap-3 relative">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-[#ccc]">
                AI
              </span>
              <button
                onClick={() => setShowEdit(true)}
                className="flex items-center gap-1 text-[10px] text-[#ccc] hover:text-white transition-colors"
              >
                <Pencil className="w-3 h-3" />
                Edit
              </button>
            </div>

            {/* Pipeline stats */}
            <div className="flex-1 flex flex-col justify-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[#ccc]">Queue:</span>
                <span className="text-sm font-bold text-white">{source.queueCount}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[#ccc]">Active:</span>
                <span className="text-sm font-bold text-white">{source.processingCount}</span>
              </div>

              {/* Summary (if processing done) */}
              {source.lastSummary && (
                <div className="mt-1 border-t border-[#2a2a2a] pt-2">
                  <p className={`text-[11px] text-[#ddd] leading-relaxed ${expanded ? "" : "line-clamp-3"}`}>
                    {source.lastSummary}
                  </p>
                  <button
                    onClick={() => setExpanded(!expanded)}
                    className="flex items-center gap-1 mt-1.5 text-[10px] text-[#bbb] hover:text-white transition-colors"
                  >
                    {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {expanded ? "Collapse" : "Expand"}
                  </button>
                </div>
              )}
            </div>

            {/* Arrow indicator */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10">
              <ArrowRight className="w-4 h-4 text-[#555]" />
            </div>
          </div>

          {/* ── RIGHT: Output ── */}
          <div className="w-1/3 p-4 flex flex-col items-center gap-2">
            <div className="flex items-center justify-between w-full">
              <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-[#ccc]">
                Output
              </span>
              <button
                onClick={() => setShowEdit(true)}
                className="flex items-center gap-1 text-[10px] text-[#ccc] hover:text-white transition-colors"
              >
                <Pencil className="w-3 h-3" />
                Edit
              </button>
            </div>

            {/* Gauge */}
            <div className="flex-1 flex items-center justify-center">
              <ThreatGauge
                score={score}
                size={100}
                severity={source.lastSeverity}
              />
            </div>

            {/* Top contributing threat */}
            {topCategory && (
              <div className="w-full bg-[#111] rounded border border-[#2a2a2a] px-2.5 py-1.5">
                <p className="text-[9px] text-[#ccc] uppercase tracking-wider">Top threat</p>
                <p className="text-[11px] text-white font-bold capitalize">{topCategory}</p>
              </div>
            )}

            {/* Categories */}
            {source.lastCategories && source.lastCategories.length > 1 && (
              <div className="flex flex-wrap gap-1 w-full">
                {source.lastCategories.slice(1).map((cat) => (
                  <span
                    key={cat}
                    className="px-1.5 py-0.5 rounded bg-[#1a1a1a] text-[9px] text-[#ccc] border border-[#333]"
                  >
                    {cat.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            )}

            {!hasResults && (
              <span className="text-[10px] text-[#888] uppercase tracking-wider">
                Awaiting input
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {showEdit && (
        <PipelineEditModal
          sourceId={source.id}
          sourceName={source.name}
          mode={source.mode}
          onClose={() => setShowEdit(false)}
        />
      )}
    </>
  );
}
