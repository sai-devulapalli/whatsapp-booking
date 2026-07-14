import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

const WEEKDAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;

interface WeeklyRule {
  weekday: (typeof WEEKDAYS)[number];
  startTime: string;
  endTime: string;
}

interface DayState {
  enabled: boolean;
  startTime: string;
  endTime: string;
}

export function AvailabilityEditor({ resourceId }: { resourceId: string }) {
  const queryClient = useQueryClient();
  const { data: resources } = useQuery({
    queryKey: ["resources"],
    queryFn: () => api.get<{ id: string; weeklyAvailability: WeeklyRule[] }[]>("/resources"),
  });

  const existing = resources?.find((r) => r.id === resourceId)?.weeklyAvailability ?? [];

  const [days, setDays] = useState<Record<string, DayState>>(() => {
    const initial: Record<string, DayState> = {};
    for (const weekday of WEEKDAYS) {
      const rule = existing.find((r) => r.weekday === weekday);
      initial[weekday] = rule
        ? { enabled: true, startTime: rule.startTime, endTime: rule.endTime }
        : { enabled: false, startTime: "09:00", endTime: "17:00" };
    }
    return initial;
  });

  // Re-sync once the resources query resolves (first render has no data yet).
  useEffect(() => {
    if (!resources) return;
    const rules = resources.find((r) => r.id === resourceId)?.weeklyAvailability ?? [];
    setDays((prev) => {
      const next = { ...prev };
      for (const weekday of WEEKDAYS) {
        const rule = rules.find((r) => r.weekday === weekday);
        if (rule) next[weekday] = { enabled: true, startTime: rule.startTime, endTime: rule.endTime };
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resources === undefined]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = WEEKDAYS.filter((w) => days[w].enabled).map((w) => ({
        weekday: w,
        startTime: days[w].startTime,
        endTime: days[w].endTime,
      }));
      return api.put(`/resources/${resourceId}/weekly-availability`, payload);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["resources"] }),
  });

  return (
    <div className="weekday-grid" style={{ padding: "10px 0" }}>
      {WEEKDAYS.map((weekday) => (
        <div className="weekday-row" key={weekday}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={days[weekday].enabled}
              onChange={(e) => setDays((d) => ({ ...d, [weekday]: { ...d[weekday], enabled: e.target.checked } }))}
            />
            {weekday.slice(0, 3)}
          </label>
          <input
            type="time"
            value={days[weekday].startTime}
            disabled={!days[weekday].enabled}
            onChange={(e) => setDays((d) => ({ ...d, [weekday]: { ...d[weekday], startTime: e.target.value } }))}
          />
          <input
            type="time"
            value={days[weekday].endTime}
            disabled={!days[weekday].enabled}
            onChange={(e) => setDays((d) => ({ ...d, [weekday]: { ...d[weekday], endTime: e.target.value } }))}
          />
        </div>
      ))}
      <div>
        <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Saving…" : "Save availability"}
        </button>
        {saveMutation.isSuccess && <span className="muted" style={{ marginLeft: 8 }}>Saved.</span>}
      </div>
    </div>
  );
}
