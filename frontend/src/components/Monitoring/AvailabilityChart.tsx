import {
  type ChartData,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js"
import { useState } from "react"
import { Line } from "react-chartjs-2"
import type { MonitoringAgentPublic, ServiceHistoryPublic } from "@/client"
import { useTheme } from "@/components/theme-provider"

ChartJS.register(LinearScale, LineElement, PointElement, Tooltip, Legend)

type PlotPoint = {
  x: number
  y: number | null
  up: number
  down: number
  failure?: boolean
}

type Props = {
  history: ServiceHistoryPublic
  agents: MonitoringAgentPublic[]
  selected: string
}

export function AvailabilityChart({ history, agents, selected }: Props) {
  const { resolvedTheme } = useTheme()
  const [hidden, setHidden] = useState<string[]>([])
  const dark = resolvedTheme === "dark"
  const series = new Map<
    string,
    { agentId: string; port: number | null; points: PlotPoint[] }
  >()

  for (const point of history.points) {
    if (selected !== "all" && selected !== point.agent_id) continue
    const key = `${point.agent_id}:${point.port}`
    const entry = series.get(key) ?? {
      agentId: point.agent_id,
      port: point.port,
      points: [],
    }
    const x = Date.parse(point.checked_at)
    const previous = entry.points[entry.points.length - 1]
    // Не соединяем линией периоды, в которых агент не присылал проверки.
    if (previous && x - previous.x > history.bucket_seconds * 1500) {
      entry.points.push({
        x: previous.x + history.bucket_seconds * 1000,
        y: null,
        up: 0,
        down: 0,
      })
    }
    entry.points.push({
      x,
      y: point.latency_ms,
      up: point.up_count,
      down: point.down_count,
    })
    series.set(key, entry)
  }

  const entries = [...series].map(([key, series]) => {
    const index = Math.max(
      0,
      agents.findIndex((agent) => agent.id === series.agentId),
    )
    const color = `hsl(${(index * 137.5 + 165) % 360} 65% ${dark ? 65 : 40}%)`
    const name =
      agents.find((agent) => agent.id === series.agentId)?.name ??
      "Удалённый агент"
    return {
      ...series,
      key,
      color,
      name: `${name}${series.port === null ? "" : ` :${series.port}`}`,
    }
  })
  const data: ChartData<"line", PlotPoint[]> = {
    datasets: entries.flatMap((entry) => [
      {
        id: `${entry.key}:latency`,
        label: entry.name,
        data: entry.points,
        hidden: hidden.includes(entry.key),
        borderColor: entry.color,
        backgroundColor: entry.color,
        borderWidth: 2,
        tension: 0.15,
        spanGaps: false,
        pointRadius: entry.points.length < 40 ? 3 : 1.5,
        pointHoverRadius: 6,
        pointHitRadius: 12,
      },
      {
        id: `${entry.key}:failure`,
        label: entry.name,
        data: entry.points
          .filter((point) => point.down > 0)
          .map((point) => ({ ...point, y: 0, failure: true })),
        hidden: hidden.includes(entry.key),
        showLine: false,
        borderColor: "#f43f5e",
        backgroundColor: "#f43f5e",
        pointStyle: "crossRot" as const,
        pointRadius: 5,
        pointHoverRadius: 8,
        pointHitRadius: 14,
      },
    ]),
  }

  if (!entries.length)
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Нет проверок за выбранный период.
      </div>
    )

  return (
    <>
      <div className="mt-5 h-72 sm:h-80">
        <Line<PlotPoint[]>
          data={data}
          datasetIdKey="id"
          aria-label="Время ответа по агентам"
          options={{
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: "nearest", intersect: false },
            plugins: {
              legend: { display: false },
              tooltip: {
                displayColors: true,
                padding: 12,
                callbacks: {
                  title: (items) =>
                    items.length
                      ? new Date((items[0].raw as PlotPoint).x).toLocaleString(
                          "ru-RU",
                        )
                      : "",
                  label: (context) => {
                    const point = context.raw as PlotPoint
                    return point.failure
                      ? `${context.dataset.label}: недоступен / ошибка (${point.down})`
                      : `${context.dataset.label}: ${point.y?.toFixed(0) ?? "—"} мс`
                  },
                  afterLabel: (context) => {
                    const point = context.raw as PlotPoint
                    return `Успешных: ${point.up} · Неудачных: ${point.down}`
                  },
                },
              },
            },
            scales: {
              x: {
                type: "linear",
                min: Date.parse(history.start),
                max: Date.parse(history.end),
                grid: { display: false },
                ticks: {
                  maxTicksLimit: 6,
                  color: dark ? "#94a3b8" : "#64748b",
                  callback: (time) =>
                    new Date(Number(time)).toLocaleString("ru-RU", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    }),
                },
              },
              y: {
                beginAtZero: true,
                title: {
                  display: true,
                  text: "Время ответа, мс",
                  color: dark ? "#94a3b8" : "#64748b",
                },
                grid: { color: dark ? "#334155" : "#e2e8f0" },
                ticks: { color: dark ? "#94a3b8" : "#64748b" },
              },
            },
          }}
        />
      </div>
      <fieldset
        aria-label="Легенда графика"
        className="mt-4 flex flex-wrap justify-center gap-2 border-t pt-4"
      >
        {entries.map((entry) => (
          <button
            type="button"
            key={entry.key}
            aria-pressed={!hidden.includes(entry.key)}
            onClick={() =>
              setHidden(
                hidden.includes(entry.key)
                  ? hidden.filter((key) => key !== entry.key)
                  : [...hidden, entry.key],
              )
            }
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors hover:bg-muted ${hidden.includes(entry.key) ? "opacity-40 line-through" : ""}`}
          >
            <span
              className="h-0.5 w-5 rounded"
              style={{ background: entry.color }}
            />
            {entry.name}
          </button>
        ))}
      </fieldset>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        <span className="font-bold text-rose-500">×</span> Недоступен или
        ошибка. Разрыв линии — нет ответа. Нажмите на имя в легенде, чтобы
        скрыть линию.
      </p>
      <p className="mt-1 text-center text-xs text-muted-foreground">
        Средние значения успешных проверок по интервалам{" "}
        {Math.round((history.bucket_seconds / 60) * 10) / 10} мин.
      </p>
    </>
  )
}
