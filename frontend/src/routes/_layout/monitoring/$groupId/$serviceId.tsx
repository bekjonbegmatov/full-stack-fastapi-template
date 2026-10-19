import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Activity, Clock3, RefreshCw, ShieldCheck, Wifi } from "lucide-react"
import { useState } from "react"
import { AgentsService, type CheckStatus, MonitoringService } from "@/client"
import { AgentsMap } from "@/components/Monitoring/AgentsMap"
import { AvailabilityChart } from "@/components/Monitoring/AvailabilityChart"
import { ServiceDialog } from "@/components/Monitoring/ServiceDialog"
import { agentState } from "@/components/Monitoring/status"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export const Route = createFileRoute("/_layout/monitoring/$groupId/$serviceId")(
  { component: ServicePage },
)
const selectClass =
  "h-9 max-w-full rounded-md border bg-background px-3 text-sm"
function value(number: number | null | undefined, suffix = "") {
  return number == null ? "—" : `${number}${suffix}`
}
function ServicePage() {
  const { groupId, serviceId } = Route.useParams()
  return (
    <ServiceDetails key={serviceId} groupId={groupId} serviceId={serviceId} />
  )
}
function ServiceDetails({
  groupId,
  serviceId,
}: {
  groupId: string
  serviceId: string
}) {
  const [hours, setHours] = useState(12)
  const [status, setStatus] = useState<CheckStatus | "all">("all")
  const [agent, setAgent] = useState("all")
  const [page, setPage] = useState(1)
  const pageSize = 12
  const path = { group_id: groupId, service_id: serviceId }
  const selectAgent = (id: string) => {
    setAgent(id)
    setPage(1)
  }
  const services = useQuery({
    queryKey: ["services", groupId],
    queryFn: async () =>
      (await MonitoringService.readServices({ path: { group_id: groupId } }))
        .data,
  })
  const reports = useQuery({
    queryKey: ["reports", serviceId, hours, status, agent, page],
    queryFn: async () =>
      (
        await MonitoringService.readServiceReports({
          path,
          query: {
            hours,
            limit: pageSize,
            skip: (page - 1) * pageSize,
            status: status === "all" ? undefined : status,
            agent_id: agent === "all" ? undefined : agent,
          },
        })
      ).data,
    refetchInterval: 30000,
  })
  const history = useQuery({
    queryKey: ["service-history", serviceId, hours],
    queryFn: async () =>
      (await MonitoringService.readServiceHistory({ path, query: { hours } }))
        .data,
    refetchInterval: 30000,
  })
  const stats = useQuery({
    queryKey: ["service-stats", serviceId],
    queryFn: async () =>
      (await MonitoringService.readServiceStats({ path })).data,
    refetchInterval: 30000,
  })
  const agents = useQuery({
    queryKey: ["agents"],
    queryFn: async () => (await AgentsService.readAgents()).data,
    refetchInterval: 30000,
  })
  const service = services.data?.data.find((item) => item.id === serviceId)
  if (services.isLoading)
    return <p className="text-muted-foreground">Загрузка сервиса…</p>
  if (!service)
    return (
      <p className="text-muted-foreground">
        {services.isError
          ? "Не удалось загрузить сервис."
          : "Сервис не найден."}
      </p>
    )

  const assigned = (agents.data?.data ?? []).filter((item) =>
    service.agent_ids?.includes(item.id),
  )
  const names = new Map(agents.data?.data.map((item) => [item.id, item.name]))
  const latest = history.data?.latest ?? []
  const states = assigned.map((item) => agentState(item.id, latest, service))
  const up = states.filter((state) => state === "up").length
  const down = states.filter((state) => state === "down").length
  const statusLabel = down
    ? up
      ? "Частично недоступен"
      : "Недоступен"
    : up === assigned.length && up > 0
      ? "Доступен"
      : "Нет свежих данных"
  const total = reports.data?.count ?? 0
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const certificate = stats.data?.certificate_expires_at
  const certificateDays = certificate
    ? Math.ceil((Date.parse(certificate) - Date.now()) / 86400000)
    : null
  const cards = [
    {
      label: "Ответ (текущий)",
      value: value(down || !up ? null : stats.data?.current_latency_ms, " мс"),
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
  ]
  if (service.check_method === "http" && service.address.startsWith("https://"))
    cards.push({
      label: "Сертификат истекает",
      value:
        certificateDays === null
          ? "—"
          : certificateDays < 0
            ? "Истёк"
            : `${certificateDays} дней`,
      icon: ShieldCheck,
    })
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="break-words text-2xl font-bold">{service.name}</h2>
            <Badge
              variant={
                down
                  ? "destructive"
                  : up === assigned.length && up > 0
                    ? "default"
                    : "secondary"
              }
            >
              {statusLabel}
            </Badge>
          </div>
          <p className="mt-1 break-all text-sm text-muted-foreground">
            {service.address}
          </p>
        </div>
        <ServiceDialog groupId={groupId} service={service} />
      </div>
      <div
        className={`grid gap-3 sm:grid-cols-2 ${cards.length === 5 ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}
      >
        {cards.map(({ label, value: cardValue, icon: Icon }) => (
          <div key={label} className="rounded-xl border bg-card p-4">
            <Icon className="mb-4 size-4 text-primary" />
            <p className="text-2xl font-semibold">{cardValue}</p>
            <p className="mt-1 text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      {cards.length === 5 && certificate && (
        <p className="text-sm text-muted-foreground">
          Сертификат действует до{" "}
          {new Date(certificate).toLocaleDateString("ru-RU")}.
        </p>
      )}
      {agents.isError || history.isError ? (
        <p className="text-sm text-destructive">
          Не удалось загрузить статусы агентов.
        </p>
      ) : (
        <AgentsMap
          agents={assigned}
          latest={latest}
          service={service}
          selected={agent}
          onSelect={selectAgent}
        />
      )}
      <section className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Доступность</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {agent === "all" ? "Все агенты" : names.get(agent)} · Обновление
              каждые 30 секунд
            </p>
          </div>
          <div className="flex gap-2">
            <select
              aria-label="Период графика"
              value={hours}
              onChange={(event) => {
                setHours(Number(event.target.value))
                setPage(1)
              }}
              className={selectClass}
            >
              {[
                [1, "1 час"],
                [6, "6 часов"],
                [12, "12 часов"],
                [24, "24 часа"],
                [168, "7 дней"],
                [720, "30 дней"],
              ].map(([number, label]) => (
                <option key={number} value={number}>
                  {label}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="icon"
              aria-label="Обновить данные"
              disabled={history.isFetching}
              onClick={() => {
                void history.refetch()
                void reports.refetch()
                void stats.refetch()
                void agents.refetch()
              }}
            >
              <RefreshCw className={history.isFetching ? "animate-spin" : ""} />
            </Button>
          </div>
        </div>
        {history.isError ? (
          <p className="py-12 text-center text-sm text-destructive">
            Не удалось загрузить график.
          </p>
        ) : history.data ? (
          <AvailabilityChart
            key={`${hours}:${agent}`}
            history={history.data}
            agents={agents.data?.data ?? []}
            selected={agent}
          />
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Загрузка графика…
          </p>
        )}
      </section>
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">Журнал проверок</h3>
          <div className="flex min-w-0 flex-wrap gap-2">
            <select
              aria-label="Статус проверки"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as CheckStatus | "all")
                setPage(1)
              }}
              className={selectClass}
            >
              <option value="all">Все статусы</option>
              <option value="up">Доступен</option>
              <option value="down">Недоступен</option>
              <option value="error">Ошибка</option>
            </select>
            <select
              aria-label="Агент"
              value={agent}
              onChange={(event) => selectAgent(event.target.value)}
              className={selectClass}
            >
              <option value="all">Все агенты</option>
              {assigned.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Статус</TableHead>
              <TableHead>Дата и время</TableHead>
              <TableHead>Агент / порт</TableHead>
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
                    {report.status === "up"
                      ? "Доступен"
                      : report.status === "error"
                        ? "Ошибка"
                        : "Недоступен"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {new Date(report.checked_at).toLocaleString("ru-RU")}
                </TableCell>
                <TableCell>
                  {names.get(report.agent_id) ?? "Удалён"}
                  {report.port == null ? "" : ` :${report.port}`}
                </TableCell>
                <TableCell>
                  {value(
                    report.status === "up" ? report.latency_ms : null,
                    " мс",
                  )}
                </TableCell>
                <TableCell className="max-w-72 whitespace-normal break-words">
                  {report.detail || "—"}
                </TableCell>
              </TableRow>
            ))}
            {!reports.data?.data.length && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-muted-foreground"
                >
                  {reports.isLoading
                    ? "Загрузка проверок…"
                    : reports.isError
                      ? "Не удалось загрузить журнал."
                      : "Нет проверок по выбранным фильтрам."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">{total} записей</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || reports.isFetching}
              onClick={() => setPage(page - 1)}
            >
              Назад
            </Button>
            <span>
              {page} / {pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages || reports.isFetching}
              onClick={() => setPage(page + 1)}
            >
              Вперёд
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
