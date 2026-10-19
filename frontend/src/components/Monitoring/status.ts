import type { CheckReportPublic, MonitoredServicePublic } from "@/client"

export const states = {
  up: { label: "Доступен", color: "#10b981" },
  down: { label: "Недоступен", color: "#f43f5e" },
  unknown: { label: "Нет свежих данных", color: "#94a3b8" },
}

export type AgentState = keyof typeof states

export function agentState(
  agentId: string,
  latest: CheckReportPublic[],
  service: MonitoredServicePublic,
): AgentState {
  const ports =
    service.check_method === "ping"
      ? [null]
      : service.ports?.length
        ? service.ports
        : [null]
  const freshAfter =
    Date.now() -
    Math.max(120, (service.check_interval_seconds ?? 60) * 3) * 1000
  const reports = ports.map((port) =>
    latest.find(
      (report) => report.agent_id === agentId && report.port === port,
    ),
  )
  // Просроченный результат больше не считаем текущим статусом.
  if (
    reports.some(
      (report) =>
        report &&
        Date.parse(report.checked_at) >= freshAfter &&
        report.status !== "up",
    )
  )
    return "down"
  if (
    reports.every(
      (report) =>
        report &&
        Date.parse(report.checked_at) >= freshAfter &&
        report.status === "up",
    )
  )
    return "up"
  return "unknown"
}
