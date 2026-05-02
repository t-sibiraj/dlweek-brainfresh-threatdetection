import { useEffect, useRef, useCallback, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { JobEvent, ThreatAlertEvent, StreamStartEvent, StreamStopEvent } from "../types";

interface UseSocketOptions {
  onJobQueued?: (data: JobEvent) => void;
  onJobProcessing?: (data: JobEvent) => void;
  onJobCompleted?: (data: JobEvent) => void;
  onJobError?: (data: JobEvent) => void;
  onThreatAlert?: (data: ThreatAlertEvent) => void;
  onStreamStarted?: (data: StreamStartEvent) => void;
  onStreamStopped?: (data: StreamStopEvent) => void;
}

export function useSocket(options: UseSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io("/", {
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("🔌 Connected to server");
      setConnected(true);
    });

    socket.on("disconnect", () => {
      console.log("🔌 Disconnected");
      setConnected(false);
    });

    socket.on("job_queued", (data: JobEvent) => {
      options.onJobQueued?.(data);
    });

    socket.on("job_processing", (data: JobEvent) => {
      options.onJobProcessing?.(data);
    });

    socket.on("job_completed", (data: JobEvent) => {
      options.onJobCompleted?.(data);
    });

    socket.on("job_error", (data: JobEvent) => {
      options.onJobError?.(data);
    });

    socket.on("threat_alert", (data: ThreatAlertEvent) => {
      options.onThreatAlert?.(data);
    });

    socket.on("stream_started", (data: StreamStartEvent) => {
      options.onStreamStarted?.(data);
    });

    socket.on("stream_stopped", (data: StreamStopEvent) => {
      options.onStreamStopped?.(data);
    });

    return () => {
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const joinSource = useCallback((sourceId: string) => {
    socketRef.current?.emit("join_source", sourceId);
  }, []);

  const leaveSource = useCallback((sourceId: string) => {
    socketRef.current?.emit("leave_source", sourceId);
  }, []);

  /** Get raw socket reference for streaming */
  const getSocket = useCallback((): Socket | null => {
    return socketRef.current;
  }, []);

  return { connected, joinSource, leaveSource, getSocket };
}
