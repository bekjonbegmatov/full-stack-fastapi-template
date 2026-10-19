import { useQuery } from "@tanstack/react-query"

import { type MonitoredServicePublic, MonitoringService } from "@/client"

export function AvailabilityDots({
  groupId,
  service,
}: {
  groupId: string
  service: MonitoredServicePublic
}) {
  const { data } = useQuery({
    queryKey: ["reports", service.id],
    queryFn: async () =>
      (
        await MonitoringService.readServiceReports({
          path: { group_id: groupId, service_id: service.id },
        })
      ).data,
  })
  if (!data?.data.length)
    return (
      <span className="text-xs text-muted-foreground">Нет результатов</span>
    )
  return (
    <div className="flex items-center gap-1" title="Последние 40 проверок">
      {[...data.data].reverse().map((report) => (
        <span
          key={report.id}
          className={`size-2 rounded-full ${report.status === "up" ? "bg-emerald-500" : "bg-destructive"}`}
          title={`${report.status}, ${report.latency_ms ?? "—"} мс`}
        />
      ))}
    </div>
  )
}
