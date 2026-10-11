"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import type { CooldownTimes } from "@/lib/attendance-cooldown";
type Status = "loading" | "ready" | "cooldown" | "error" | "unavailable";
type Reply = Partial<CooldownTimes> & {
  state: "unknown" | "ready" | "cooldown" | "unavailable";
};
export function useAttendanceCooldown() {
  const [status, setStatus] = useState<Status>("loading");
  const [times, setTimes] = useState<CooldownTimes | null>(null);
  const [remaining, setRemaining] = useState(0);
  const anchor = useRef({ local: 0, server: 0, next: 0 });
  const busy = useRef(false);
  const version = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const cancel = useCallback(() => {
    version.current++;
    busy.current = false;
    controller.current?.abort();
  }, []);
  const acceptCooldown = useCallback((data: CooldownTimes) => {
    const next = Date.parse(data.nextAllowedAt),
      server = Date.parse(data.serverNow);
    if (!Number.isFinite(next) || !Number.isFinite(server)) {
      setStatus("error");
      return;
    }
    anchor.current = { local: performance.now(), server, next };
    setTimes(data);
    setRemaining(Math.max(0, next - server));
    setStatus("cooldown");
  }, []);
  const receiveCooldown = useCallback(
    (data: CooldownTimes) => {
      // A registration conflict supersedes an older tab-focus revalidation response.
      cancel();
      acceptCooldown(data);
    },
    [cancel, acceptCooldown],
  );
  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const current = ++version.current;
    const abort = new AbortController();
    controller.current = abort;
    try {
      const reply = await api<Reply>("/api/attendance/cooldown", {
        method: "POST",
        signal: abort.signal,
        cache: "no-store",
      });
      if (current !== version.current) return;
      if (reply.state === "cooldown" && reply.nextAllowedAt && reply.serverNow)
        acceptCooldown({
          nextAllowedAt: reply.nextAllowedAt,
          serverNow: reply.serverNow,
        });
      else if (reply.state === "ready" || reply.state === "unknown") {
        setStatus("ready");
        setRemaining(0);
      } else setStatus(reply.state === "unavailable" ? "unavailable" : "error");
    } catch {
      if (current === version.current) setStatus("error");
    } finally {
      if (current === version.current) busy.current = false;
    }
  }, [acceptCooldown]);
  const clear = useCallback(async () => {
    controller.current?.abort();
    const current = ++version.current;
    busy.current = true;
    setStatus("loading");
    try {
      await api("/api/attendance/cooldown", {
        method: "DELETE",
        cache: "no-store",
      });
      if (current === version.current) {
        setTimes(null);
        setRemaining(0);
        setStatus("ready");
      }
    } catch {
      if (current === version.current) setStatus("error");
    } finally {
      if (current === version.current) busy.current = false;
    }
  }, []);
  useEffect(() => {
    let live = true;
    queueMicrotask(() => {
      if (live) void refresh();
    });
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      live = false;
      cancel();
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh, cancel]);
  useEffect(() => {
    if (status !== "cooldown") return;
    const tick = () => {
      const value = Math.max(
        0,
        anchor.current.next -
          (anchor.current.server + performance.now() - anchor.current.local),
      );
      setRemaining(value);
      // Zero on the client never enables submission; only server revalidation does.
      if (!value) void refresh();
    };
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [status, times, refresh]);
  return {
    status,
    times,
    remaining,
    acceptCooldown: receiveCooldown,
    refresh,
    clear,
    blocked: status !== "ready",
  };
}
