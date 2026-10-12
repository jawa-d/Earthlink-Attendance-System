"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/client";
import { corporateEmail } from "@/lib/validation";
import type { ShiftChoice } from "@/lib/shift-display";
export function useAttendanceShifts(email: string) {
  const parsed = corporateEmail.safeParse(email);
  const normalized = parsed.success ? parsed.data : "";
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(normalized), 500);
    return () => clearTimeout(timer);
  }, [normalized]);
  const config = useQuery({
    queryKey: ["attendance-shift-config"],
    queryFn: ({ signal }) =>
      api<{ enabled: boolean }>("/api/attendance/shifts", { signal }),
    retry: false,
  });
  const options = useQuery({
    queryKey: ["attendance-shift-options", debounced],
    queryFn: ({ signal }) =>
      api<{ enabled: boolean; shifts: ShiftChoice[] }>(
        "/api/attendance/shifts",
        { method: "POST", signal, body: JSON.stringify({ email: debounced }) },
      ),
    enabled:
      config.data?.enabled === true && !!debounced && normalized === debounced,
    retry: false,
  });
  const current = normalized === debounced;
  return {
    enabled: config.data?.enabled === true,
    loading:
      config.isPending ||
      (config.data?.enabled === true &&
        !!normalized &&
        (!current || options.isPending || options.isFetching)),
    error: config.error || (current ? options.error : null),
    options: current ? options.data?.shifts || [] : [],
    refresh: () => (config.error ? config.refetch() : options.refetch()),
  };
}
