import {
  type ChartData,
  type ChartEvent,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  type Plugin,
  PointElement,
  Tooltip,
} from "chart.js"
import { Pin, PinOff, X } from "lucide-react"
import { useMemo, useRef, useState } from "react"
import { Line } from "react-chartjs-2"
import type { MonitoringAgentPublic, ServiceHistoryPublic } from "@/client"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"

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

type HoverInfo = {
  time: number
  right: boolean
  pinned: boolean
  rows: { key: string; name: string; color: string; point?: PlotPoint }[]
}

export function AvailabilityChart({ history, agents, selected }: Props) {
  const { resolvedTheme } = useTheme()
  const [hidden, setHidden] = useState<string[]>([])
  const [hover, setHover] = useState<HoverInfo | null>(null)
  const cursor = useRef<HoverInfo | null>(null)
  const chartRef = useRef<ChartJS<"line", PlotPoint[]>>(null)
  const showHover = (info: HoverInfo | null) => {
    // Chart.js повторяет событие после обновления: одинаковые данные не обновляем.
    if (JSON.stringify(cursor.current) === JSON.stringify(info)) return
    cursor.current = info
    setHover(info)
    chartRef.current?.draw()
  }
  const cursorPlugin = useMemo<Plugin<"line">>(
    () => ({
      id: "sharedHistoryCursor",
      afterDatasetsDraw(chart) {
        const info = cursor.current
        if (!info) return
        const { ctx, chartArea, scales } = chart
        const x = scales.x.getPixelForValue(info.time)
        ctx.save()
        ctx.strokeStyle = "#94a3b8"
        ctx.lineWidth = 1
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(x, chartArea.top)
        ctx.lineTo(x, chartArea.bottom)
        ctx.stroke()
        ctx.setLineDash([])
        for (const row of info.rows) {
          if (!row.point) continue
          const y = row.point.y ?? (row.point.down > 0 ? 0 : null)
          if (y === null) continue
          ctx.beginPath()
          ctx.arc(x, scales.y.getPixelForValue(y), 4, 0, Math.PI * 2)
          ctx.fillStyle = row.point.y === null ? "#f43f5e" : row.color
          ctx.fill()
          ctx.strokeStyle = "white"
          ctx.stroke()
        }
        ctx.restore()
      },
    }),
    [],
  )
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
  const pickTime = (event: ChartEvent, chart: ChartJS): HoverInfo | null => {
    if (event.x === null || event.y === null) return null
    const { left, right, top, bottom } = chart.chartArea
    if (event.x < left || event.x > right || event.y < top || event.y > bottom)
      return null
    const time = chart.scales.x.getValueForPixel(event.x)
    if (time === undefined) return null
    const interval = history.bucket_seconds * 1000
    const bucket = Math.floor(time / interval)
    return {
      time: Math.max(Date.parse(history.start), bucket * interval),
      // Плашка не перескакивает на другую сторону, пока к ней ведут мышь.
      right: cursor.current?.right ?? event.x < (left + right) / 2,
      pinned: false,
      rows: entries
        .filter((entry) => !hidden.includes(entry.key))
        .map((entry) => ({
          key: entry.key,
          name: entry.name,
          color: entry.color,
          point: entry.points.find(
            (point) =>
              Math.floor(point.x / interval) === bucket &&
              point.up + point.down > 0,
          ),
        })),
    }
  }
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
        pointHoverRadius: entry.points.length < 40 ? 3 : 1.5,
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
        pointHoverRadius: 5,
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
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Уход мыши только закрывает подсказку графика. */}
      <div
        className="relative mt-5 h-72 sm:h-80"
        onMouseLeave={() => {
          if (!cursor.current?.pinned) showHover(null)
        }}
      >
        <Line<PlotPoint[]>
          ref={chartRef}
          data={data}
          plugins={[cursorPlugin]}
          datasetIdKey="id"
          aria-label="Время ответа по агентам"
          options={{
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: "nearest", intersect: false },
            onHover: (event, _elements, chart) => {
              if (cursor.current?.pinned) return
              if (
                !chart.canvas.matches(":hover") &&
                !event.native?.type.startsWith("touch")
              )
                return
              const info = pickTime(event, chart)
              if (info) showHover(info)
            },
            onClick: (event, _elements, chart) => {
              const info = pickTime(event, chart)
              // Клик фиксирует время: можно спокойно читать и прокручивать список.
              if (info) showHover({ ...info, pinned: true })
            },
            plugins: {
              legend: { display: false },
              tooltip: { enabled: false },
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
        {hover && hover.rows.length > 0 && (
          <section
            aria-label="Ответы агентов"
            className={`absolute top-2 z-10 max-h-[calc(100%-1rem)] w-80 max-w-[calc(100%-1rem)] flex flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl ${hover.right ? "right-2" : "left-2"}`}
          >
            <div className="flex shrink-0 items-start gap-2 border-b p-3">
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-xs font-semibold">
                  {hover.pinned ? "Выбранное время" : "Ответы агентов"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(hover.time).toLocaleString("ru-RU")} –{" "}
                  {new Date(
                    Math.min(
                      Date.parse(history.end),
                      (Math.floor(
                        hover.time / (history.bucket_seconds * 1000),
                      ) +
                        1) *
                        history.bucket_seconds *
                        1000,
                    ),
                  ).toLocaleTimeString("ru-RU")}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                aria-label={
                  hover.pinned ? "Открепить подсказку" : "Закрепить подсказку"
                }
                title={hover.pinned ? "Открепить" : "Закрепить"}
                onClick={() => showHover({ ...hover, pinned: !hover.pinned })}
              >
                {hover.pinned ? (
                  <PinOff className="size-4" />
                ) : (
                  <Pin className="size-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                aria-label="Закрыть ответы агентов"
                onClick={() => showHover(null)}
              >
                <X className="size-4" />
              </Button>
            </div>
            <section
              aria-label="Список ответов агентов"
              className="min-h-0 space-y-3 overflow-y-auto overscroll-contain p-3 [scrollbar-width:thin] [scrollbar-color:var(--muted-foreground)_transparent]"
              style={{ scrollbarGutter: "stable" }}
            >
              {hover.rows.map(({ key, name, color, point }) => (
                <div key={key} data-series={key} className="text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: color }}
                      />
                      <span className="break-words font-medium">{name}</span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {point?.y == null ? "—" : `${Math.round(point.y)} мс`}
                    </span>
                  </div>
                  <p
                    className={`mt-1 ${!point ? "text-muted-foreground" : point.down > 0 ? (point.up > 0 ? "text-amber-500" : "text-rose-500") : "text-emerald-500"}`}
                  >
                    {!point
                      ? "Нет данных"
                      : point.down > 0
                        ? point.up > 0
                          ? "Частично доступен"
                          : "Недоступен / ошибка"
                        : "Доступен"}
                  </p>
                  {point && (
                    <p className="mt-0.5 text-muted-foreground">
                      Успешных: {point.up} · Неудачных: {point.down}
                    </p>
                  )}
                </div>
              ))}
            </section>
          </section>
        )}
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
            onClick={() => {
              showHover(null)
              setHidden(
                hidden.includes(entry.key)
                  ? hidden.filter((key) => key !== entry.key)
                  : [...hidden, entry.key],
              )
            }}
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
        ошибка. Разрыв линии — нет ответа.
      </p>
      <p className="mt-1 text-center text-xs text-muted-foreground">
        Средние значения успешных проверок по интервалам{" "}
        {Math.round((history.bucket_seconds / 60) * 10) / 10} мин.
      </p>
    </>
  )
}
