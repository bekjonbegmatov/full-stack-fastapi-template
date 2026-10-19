import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Activity, Clock3, ShieldCheck, Wifi } from "lucide-react"

import { AgentsService, MonitoringService } from "@/client"
import { ServiceDialog } from "@/components/Monitoring/ServiceDialog"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export const Route = createFileRoute("/_layout/monitoring/$groupId/$serviceId")(
  {
    component: ServicePage,
  },
)

function value(value: number | null | undefined, suffix = "") {
  return value === null || value === undefined ? "—" : `${value}${suffix}`
}

function ServicePage() {
  const { groupId, serviceId } = Route.useParams()
  const services = useQuery({
    queryKey: ["services", groupId],
    queryFn: async () =>
      (await MonitoringService.readServices({ path: { group_id: groupId } }))
        .data,
  })
  const reports = useQuery({
    queryKey: ["reports", serviceId],
    queryFn: async () =>
      (
        await MonitoringService.readServiceReports({
          path: { group_id: groupId, service_id: serviceId },
        })
      ).data,
  })
  const stats = useQuery({
    queryKey: ["service-stats", serviceId],
    queryFn: async () =>
      (
        await MonitoringService.readServiceStats({
          path: { group_id: groupId, service_id: serviceId },
        })
      ).data,
  })
  const agents = useQuery({
    queryKey: ["agents"],
    queryFn: async () => (await AgentsService.readAgents()).data,
  })
  const service = services.data?.data.find((item) => item.id === serviceId)
  const agentNames = new Map(
    agents.data?.data.map((agent) => [agent.id, agent.name]),
  )

  if (!service || reports.isLoading || stats.isLoading) {
    return <p className="text-muted-foreground">Загрузка сервиса…</p>
  }

  const chart = [...(reports.data?.data ?? [])].reverse()
  const certificate = stats.data?.certificate_expires_at
  const certificateDays = certificate
    ? Math.max(
        0,
        Math.ceil((new Date(certificate).getTime() - Date.now()) / 86400000),
      )
    : null
  const cards = [
    {
      label: "Ответ (текущий)",
      value: value(stats.data?.current_latency_ms, " мс"),
      icon: Activity,
    },
    {
      label: "Среднее время ответа (24 часа)",
      value: value(stats.data?.average_latency_24h_ms, " мс"),
      icon: Clock3,
    },
    {
      label: "Аптайм (24 часа)",
      value: value(stats.data?.uptime_24h_percent, "%"),
      icon: Wifi,
    },
    {
      label: "Аптайм (30 дней)",
      value: value(stats.data?.uptime_30d_percent, "%"),
      icon: Wifi,
    },
    {
      label: "Сертификат истекает",
      value: certificateDays === null ? "—" : `${certificateDays} дней`,
      icon: ShieldCheck,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold">{service.name}</h2>
            <Badge variant="outline">
              {(service.check_method ?? "tcp").toUpperCase()}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {service.address}
          </p>
        </div>
        <ServiceDialog groupId={groupId} service={service} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(({ label, value: cardValue, icon: Icon }) => (
          <div key={label} className="rounded-xl border bg-card p-4">
            <Icon className="mb-4 size-4 text-primary" />
            <p className="text-2xl font-semibold">{cardValue}</p>
            <p className="mt-1 text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      {certificate && (
        <p className="text-sm text-muted-foreground">
          Сертификат действует до {new Date(certificate).toLocaleDateString()}.
        </p>
      )}
      <section className="rounded-xl border bg-card p-5">
        <h3 className="font-semibold">Доступность</h3>
        <div className="mt-5 flex h-28 items-end gap-px">
          {chart.map((report) => (
            <div
              key={report.id}
              className={
                report.status === "up"
                  ? "flex-1 rounded-t bg-emerald-500"
                  : "flex-1 rounded-t bg-destructive"
              }
              style={{
                height: `${Math.max(12, Math.min(100, report.latency_ms ?? 12))}%`,
              }}
              title={`${new Date(report.checked_at).toLocaleString()}: ${report.latency_ms ?? "—"} мс`}
            />
          ))}
        </div>
        {!chart.length && (
          <p className="mt-4 text-sm text-muted-foreground">
            Проверок пока нет.
          </p>
        )}
      </section>
      <section>
        <h3 className="mb-3 font-semibold">Журнал проверок</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Статус</TableHead>
              <TableHead>Дата и время</TableHead>
              <TableHead>Агент</TableHead>
              <TableHead>Время ответа</TableHead>
              <TableHead>Сообщение</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.data?.data.map((report) => (
              <TableRow key={report.id}>
                <TableCell>
                  <Badge
                    variant={report.status === "up" ? "default" : "destructive"}
                  >
                    {report.status === "up" ? "Доступен" : "Недоступен"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {new Date(report.checked_at).toLocaleString()}
                </TableCell>
                <TableCell>
                  {agentNames.get(report.agent_id) ?? "Удалён"}
                </TableCell>
                <TableCell>{value(report.latency_ms, " мс")}</TableCell>
                <TableCell className="max-w-72 truncate">
                  {report.detail ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  )
}
