import { useState, useRef, useCallback, useEffect } from "react";
import {
  Camera,
  Monitor,
  Radio,
  Square,
  Loader2,
  AlertCircle,
} from "lucide-react";
import type { Socket } from "socket.io-client";
import type { StreamType } from "../types";

interface StreamCaptureProps {
  sourceId: string;
  getSocket: () => Socket | null;
}

export function StreamCapture({ sourceId, getSocket }: StreamCaptureProps) {
  const [streamType, setStreamType] = useState<StreamType | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [frameCount, setFrameCount] = useState(0);
  const [hlsUrl, setHlsUrl] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Capture and send a frame from the video element
  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const socket = getSocket();
    if (!video || !canvas || !socket || !streaming) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = Math.min(video.videoWidth, 640);
    canvas.height = Math.round(
      (canvas.width / video.videoWidth) * video.videoHeight
    );

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const base64 = canvas.toDataURL("image/jpeg", 0.7);
    socket.emit("stream:frame", {
      source_id: sourceId,
      frame: base64,
      mime_type: "image/jpeg",
    });

    setFrameCount((c) => c + 1);
  }, [sourceId, getSocket, streaming]);

  // Start webcam stream
  const startWebcam = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const socket = getSocket();
      if (socket) {
        socket.emit(
          "stream:start",
          { source_id: sourceId, type: "webcam" },
          (res: { success: boolean; error?: string }) => {
            if (!res.success) {
              setError(res.error ?? "Failed to start stream");
              stream.getTracks().forEach((t) => t.stop());
              return;
            }
            setStreamType("webcam");
            setStreaming(true);
            setFrameCount(0);
          }
        );
      }
    } catch (err: any) {
      setError(err.message || "Camera access denied");
    } finally {
      setStarting(false);
    }
  }, [sourceId, getSocket]);

  // Start screen capture
  const startScreen = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Handle user clicking "Stop sharing" in browser UI
      stream.getVideoTracks()[0].addEventListener("ended", () => {
        stopStream();
      });

      const socket = getSocket();
      if (socket) {
        socket.emit(
          "stream:start",
          { source_id: sourceId, type: "screen" },
          (res: { success: boolean; error?: string }) => {
            if (!res.success) {
              setError(res.error ?? "Failed to start stream");
              stream.getTracks().forEach((t) => t.stop());
              return;
            }
            setStreamType("screen");
            setStreaming(true);
            setFrameCount(0);
          }
        );
      }
    } catch (err: any) {
      setError(err.message || "Screen capture denied");
    } finally {
      setStarting(false);
    }
  }, [sourceId, getSocket]);

  // Start HLS stream
  const startHls = useCallback(() => {
    if (!hlsUrl.trim()) {
      setError("Enter an HLS/DASH stream URL");
      return;
    }

    setStarting(true);
    setError(null);

    const socket = getSocket();
    if (socket) {
      socket.emit(
        "stream:start",
        { source_id: sourceId, type: "hls", url: hlsUrl.trim(), interval_sec: 5 },
        (res: { success: boolean; error?: string }) => {
          if (!res.success) {
            setError(res.error ?? "Failed to start HLS stream");
          } else {
            setStreamType("hls");
            setStreaming(true);
            setFrameCount(0);
          }
          setStarting(false);
        }
      );
    }
  }, [sourceId, getSocket, hlsUrl]);

  // Stop stream
  const stopStream = useCallback(() => {
    // Stop media tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    // Clear frame interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Notify server
    const socket = getSocket();
    if (socket) {
      socket.emit("stream:stop", { source_id: sourceId });
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setStreaming(false);
    setStreamType(null);
  }, [sourceId, getSocket]);

  // Frame capture interval (every 3 seconds for webcam/screen, not for HLS)
  useEffect(() => {
    if (streaming && streamType !== "hls") {
      intervalRef.current = setInterval(captureFrame, 3000);
      // Capture first frame immediately
      setTimeout(captureFrame, 500);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [streaming, streamType, captureFrame]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return (
    <div className="border border-[#333] rounded bg-[#0a0a0a] p-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-[#ccc]">
          Live Stream
        </span>
        {streaming && (
          <span className="flex items-center gap-1 text-[10px] text-[#ddd]">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            LIVE — {frameCount} frames
          </span>
        )}
      </div>

      {/* Video preview (hidden canvas for frame capture) */}
      <canvas ref={canvasRef} className="hidden" />

      {streaming && streamType !== "hls" ? (
        <div className="relative mb-3">
          <video
            ref={videoRef}
            muted
            playsInline
            className="w-full rounded border border-[#333] bg-black"
            style={{ maxHeight: 240 }}
          />
          <button
            onClick={stopStream}
            className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded bg-[#1a1a1a]/80 border border-[#444] text-[10px] text-[#ddd] hover:text-white hover:border-[#666] transition-colors"
          >
            <Square className="w-3 h-3" />
            Stop
          </button>
        </div>
      ) : streaming && streamType === "hls" ? (
        <div className="mb-3 p-3 rounded border border-[#333] bg-[#111] text-center">
          <Radio className="w-5 h-5 text-[#ddd] mx-auto mb-1 animate-pulse" />
          <p className="text-[11px] text-[#ddd]">
            HLS stream active — frames captured server-side
          </p>
          <p className="text-[10px] text-[#999] mt-1 truncate">{hlsUrl}</p>
          <button
            onClick={stopStream}
            className="mt-2 flex items-center gap-1 mx-auto px-3 py-1 rounded border border-[#444] text-[10px] text-[#ddd] hover:text-white hover:border-[#666] transition-colors"
          >
            <Square className="w-3 h-3" />
            Stop Stream
          </button>
        </div>
      ) : (
        <>
          {/* Stream source buttons */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <button
              onClick={startWebcam}
              disabled={starting}
              className="flex flex-col items-center gap-1.5 p-3 rounded border border-[#333] bg-[#111] hover:border-[#555] hover:bg-[#1a1a1a] transition-colors disabled:opacity-40"
            >
              {starting && streamType === null ? (
                <Loader2 className="w-4 h-4 text-[#aaa] animate-spin" />
              ) : (
                <Camera className="w-4 h-4 text-[#ddd]" />
              )}
              <span className="text-[9px] font-bold tracking-[0.1em] uppercase text-[#ccc]">
                Webcam
              </span>
            </button>

            <button
              onClick={startScreen}
              disabled={starting}
              className="flex flex-col items-center gap-1.5 p-3 rounded border border-[#333] bg-[#111] hover:border-[#555] hover:bg-[#1a1a1a] transition-colors disabled:opacity-40"
            >
              {starting && streamType === null ? (
                <Loader2 className="w-4 h-4 text-[#ddd] animate-spin" />
              ) : (
                <Monitor className="w-4 h-4 text-[#ddd]" />
              )}
              <span className="text-[9px] font-bold tracking-[0.1em] uppercase text-[#ccc]">
                Screen
              </span>
            </button>

            <button
              onClick={startHls}
              disabled={starting || !hlsUrl.trim()}
              className="flex flex-col items-center gap-1.5 p-3 rounded border border-[#333] bg-[#111] hover:border-[#555] hover:bg-[#1a1a1a] transition-colors disabled:opacity-40"
            >
              {starting && streamType === null ? (
                <Loader2 className="w-4 h-4 text-[#ddd] animate-spin" />
              ) : (
                <Radio className="w-4 h-4 text-[#ddd]" />
              )}
              <span className="text-[9px] font-bold tracking-[0.1em] uppercase text-[#ccc]">
                HLS
              </span>
            </button>
          </div>

          {/* HLS URL input */}
          <input
            type="text"
            value={hlsUrl}
            onChange={(e) => setHlsUrl(e.target.value)}
            placeholder="HLS/DASH stream URL..."
            className="w-full px-2.5 py-1.5 rounded border border-[#333] bg-[#111] text-[11px] text-[#ddd] placeholder-[#666] focus:outline-none focus:border-[#555]"
          />

          {/* Hidden video element for webcam/screen (shown when streaming) */}
          <video ref={videoRef} muted playsInline className="hidden" />
        </>
      )}

      {error && (
        <div className="flex items-center gap-1.5 mt-2 text-[10px] text-red-400">
          <AlertCircle className="w-3 h-3" />
          {error}
        </div>
      )}
    </div>
  );
}
