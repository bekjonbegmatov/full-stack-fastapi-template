import { Minus, Plus, RotateCcw } from "lucide-react"
import { type ReactNode, useState } from "react"
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  useZoomPanContext,
  ZoomableGroup,
} from "react-simple-maps"
import type {
  CheckReportPublic,
  MonitoredServicePublic,
  MonitoringAgentPublic,
} from "@/client"
import { Button } from "@/components/ui/button"
import countries from "./countries.json"
import { agentState, states } from "./status"

const countryData: Record<string, { name: string; coordinates: number[] }> =
  countries

function FixedSizeMarker({
  coordinates,
  children,
}: {
  coordinates: [number, number]
  children: ReactNode
}) {
  const { k } = useZoomPanContext()
  // Карта увеличивается, а размер метки остаётся прежним даже во время жеста.
  return (
    <Marker coordinates={coordinates}>
      <g transform={`scale(${1 / k})`}>{children}</g>
    </Marker>
  )
}

type Props = {
  agents: MonitoringAgentPublic[]
  latest: CheckReportPublic[]
  service: MonitoredServicePublic
  selected: string
  onSelect: (id: string) => void
}

export function AgentsMap({
  agents,
  latest,
  service,
  selected,
  onSelect,
}: Props) {
  const [activeCountry, setActiveCountry] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [view, setView] = useState({
    center: [0, 8] as [number, number],
    zoom: 1,
  })
  const groups = new Map<string, MonitoringAgentPublic[]>()
  for (const agent of agents) {
    const code = agent.country?.toUpperCase() ?? ""
    const group = groups.get(code) ?? []
    group.push(agent)
    groups.set(code, group)
  }
  const hoverAgents = groups.get(hovered ?? "") ?? []
  const visibleAgents =
    activeCountry === null ? agents : (groups.get(activeCountry) ?? [])

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h3 className="font-semibold">Агенты на карте</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Доступность сервиса из разных стран · {agents.length} агентов
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            onSelect("all")
            setActiveCountry(null)
          }}
        >
          Все агенты
        </Button>
      </div>
      <div className="relative border-y bg-slate-50 dark:bg-slate-950/50">
        <div className="absolute right-3 top-3 z-10 flex gap-1 rounded-lg border bg-background p-1 shadow-sm">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Приблизить карту"
            disabled={view.zoom >= 5}
            onClick={() =>
              setView({ ...view, zoom: Math.min(5, view.zoom * 1.5) })
            }
          >
            <Plus />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Отдалить карту"
            disabled={view.zoom <= 1}
            onClick={() =>
              setView({ ...view, zoom: Math.max(1, view.zoom / 1.5) })
            }
          >
            <Minus />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Сбросить масштаб карты"
            onClick={() => setView({ center: [0, 8], zoom: 1 })}
          >
            <RotateCcw />
          </Button>
        </div>
        <ComposableMap
          width={800}
          height={360}
          projection="geoEqualEarth"
          projectionConfig={{ scale: 135, center: [0, 8] }}
          aria-label="Карта агентов без Антарктиды"
          className="w-full"
        >
          <ZoomableGroup
            minZoom={1}
            maxZoom={5}
            center={view.center}
            zoom={view.zoom}
            filterZoomEvent={(event) => event.type !== "wheel"}
            onMoveEnd={({ coordinates, zoom }) =>
              setView({
                center: coordinates ?? view.center,
                zoom: zoom ?? view.zoom,
              })
            }
          >
            <Geographies geography="/maps/world.json">
              {({ geographies }) =>
                geographies
                  .filter((geo) => String(geo.id) !== "010")
                  .map((geo) => (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      data-country={geo.id}
                      className="fill-slate-200 stroke-slate-50 hover:fill-slate-400 dark:fill-slate-700 dark:stroke-slate-900 dark:hover:fill-slate-500"
                      strokeWidth={0.6}
                      style={{ outline: "none" }}
                    />
                  ))
              }
            </Geographies>
            {[...groups].map(([code, countryAgents]) => {
              const country = countryData[code]
              if (!country) return null
              const statuses = countryAgents.map((agent) =>
                agentState(agent.id, latest, service),
              )
              const state = statuses.includes("down")
                ? "down"
                : statuses.every((status) => status === "up")
                  ? "up"
                  : "unknown"
              const isSelected = countryAgents.some(
                (agent) => agent.id === selected,
              )
              const selectCountry = () => {
                setActiveCountry(code)
                if (countryAgents.length === 1) onSelect(countryAgents[0].id)
              }
              return (
                <FixedSizeMarker
                  key={code}
                  coordinates={[country.coordinates[0], country.coordinates[1]]}
                >
                  {/* biome-ignore lint/a11y/useSemanticElements: Внутри SVG используем группу с управлением с клавиатуры. */}
                  <g
                    role="button"
                    tabIndex={0}
                    aria-label={`${country.name}: ${countryAgents.map((agent) => agent.name).join(", ")} — ${states[state].label}`}
                    onClick={selectCountry}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        selectCountry()
                      }
                    }}
                    onMouseEnter={() => setHovered(code)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(code)}
                    onBlur={() => setHovered(null)}
                    className="origin-top-left scale-[1.8] cursor-pointer outline-none transition-opacity hover:opacity-80 focus:opacity-80 sm:scale-100"
                    data-status={state}
                  >
                    <circle
                      r={isSelected ? 19 : 14}
                      fill={states[state].color}
                      opacity={0.16}
                    />
                    <path
                      d="M0 3 C-4 -3 -10 -8 -10 -14 A10 10 0 1 1 10 -14 C10 -8 4 -3 0 3Z"
                      fill={states[state].color}
                      stroke="white"
                      strokeWidth={1.5}
                    />
                    <text
                      y={-10}
                      textAnchor="middle"
                      fill="white"
                      fontSize={10}
                      fontWeight={700}
                    >
                      {countryAgents.length > 1 ? countryAgents.length : "●"}
                    </text>
                    <title>
                      {country.name}: {states[state].label}
                    </title>
                  </g>
                </FixedSizeMarker>
              )
            })}
          </ZoomableGroup>
        </ComposableMap>
        {hovered && countryData[hovered] && (
          <div
            role="tooltip"
            className="pointer-events-none absolute bottom-3 left-3 max-w-[90%] rounded-lg border bg-popover p-3 text-xs shadow-lg"
          >
            <p className="mb-1 font-semibold">{countryData[hovered].name}</p>
            {hoverAgents.map((agent) => {
              const state = agentState(agent.id, latest, service)
              return (
                <p key={agent.id}>
                  {agent.name} · {states[state].label}
                </p>
              )
            })}
          </div>
        )}
      </div>
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          {Object.entries(states).map(([key, state]) => (
            <span key={key} className="flex items-center gap-1.5">
              <span
                className="size-2 rounded-full"
                style={{ background: state.color }}
              />
              {state.label}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {visibleAgents.map((agent) => {
            const state = agentState(agent.id, latest, service)
            const country = countryData[agent.country?.toUpperCase() ?? ""]
            return (
              <button
                key={agent.id}
                type="button"
                aria-pressed={selected === agent.id}
                onClick={() =>
                  onSelect(selected === agent.id ? "all" : agent.id)
                }
                className={`flex max-w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${selected === agent.id ? "border-primary bg-primary/10" : ""}`}
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: states[state].color }}
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {agent.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {country?.name ?? "Страна не выбрана"} ·{" "}
                    {states[state].label}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
        {!agents.length && (
          <p className="text-sm text-muted-foreground">
            Сервису пока не назначены агенты.
          </p>
        )}
      </div>
    </section>
  )
}
