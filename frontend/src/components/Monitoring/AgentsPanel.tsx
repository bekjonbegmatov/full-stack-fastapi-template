import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Copy, Cpu, Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import countryList from "react-select-country-list"

import { AgentsService } from "@/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

export const agentsQuery = {
  queryKey: ["agents"],
  queryFn: async () => (await AgentsService.readAgents()).data,
}

export function AgentsPanel() {
  const [name, setName] = useState("")
  const [location, setLocation] = useState("")
  const [country, setCountry] = useState("")
  const [visibleTokens, setVisibleTokens] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const countries = countryList().getData()
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const { data } = useQuery(agentsQuery)
  const createAgent = useMutation({
    mutationFn: () =>
      AgentsService.createAgent({
        body: { name, location: location || null, country: country || null },
      }),
    onSuccess: () => {
      setName("")
      setLocation("")
      setCountry("")
      showSuccessToast("Агент зарегистрирован")
      queryClient.invalidateQueries({ queryKey: ["agents"] })
    },
    onError: handleError.bind(showErrorToast),
  })
  const deleteAgent = useMutation({
    mutationFn: (agentId: string) =>
      AgentsService.deleteAgent({ path: { agent_id: agentId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agents"] }),
    onError: handleError.bind(showErrorToast),
  })
  const updateAgent = useMutation({
    mutationFn: ({
      id,
      name,
      location,
      country,
    }: {
      id: string
      name: string
      location: string
      country: string
    }) =>
      AgentsService.updateAgent({
        path: { agent_id: id },
        body: { name, location: location || null, country: country || null },
      }),
    onSuccess: () => {
      setEditingId(null)
      queryClient.invalidateQueries({ queryKey: ["agents"] })
    },
    onError: handleError.bind(showErrorToast),
  })

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Cpu className="text-primary" />
        <h2 className="text-lg font-semibold">Агенты</h2>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Input
          className="max-w-xs"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Название агента"
        />
        <Input
          className="max-w-xs"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          placeholder="Локация: Москва, DC-1"
        />
        <select
          className="h-9 max-w-xs rounded-md border bg-background px-3 text-sm"
          value={country}
          onChange={(event) => setCountry(event.target.value)}
        >
          <option value="">Страна</option>
          {countries.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <Button
          disabled={!name || createAgent.isPending}
          onClick={() => createAgent.mutate()}
        >
          <Plus />
          Добавить агента
        </Button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {data?.data.map((agent) => {
          const isOnline =
            agent.last_seen_at &&
            Date.now() - new Date(agent.last_seen_at).getTime() < 120000
          const isEditing = editingId === agent.id
          const showToken = visibleTokens.includes(agent.id)
          return (
            <div
              key={agent.id}
              className="rounded-lg border p-4 transition-shadow hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  {isEditing ? (
                    <div className="space-y-2">
                      <Input
                        defaultValue={agent.name}
                        id={`agent-name-${agent.id}`}
                      />
                      <Input
                        defaultValue={agent.location ?? ""}
                        id={`agent-location-${agent.id}`}
                      />
                      <select
                        defaultValue={agent.country ?? ""}
                        id={`agent-country-${agent.id}`}
                        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                      >
                        <option value="">Страна</option>
                        {countries.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        onClick={() =>
                          updateAgent.mutate({
                            id: agent.id,
                            name: (
                              document.getElementById(
                                `agent-name-${agent.id}`,
                              ) as HTMLInputElement
                            ).value,
                            location: (
                              document.getElementById(
                                `agent-location-${agent.id}`,
                              ) as HTMLInputElement
                            ).value,
                            country: (
                              document.getElementById(
                                `agent-country-${agent.id}`,
                              ) as HTMLSelectElement
                            ).value,
                          })
                        }
                      >
                        Сохранить
                      </Button>
                    </div>
                  ) : (
                    <>
                      <p className="flex items-center gap-2 font-medium">
                        <span
                          className={`size-2 rounded-full ${isOnline ? "bg-emerald-500" : "bg-muted-foreground"}`}
                        />
                        {agent.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {agent.location || "Локация не указана"}
                      </p>
                      {agent.country && (
                        <p className="text-xs text-muted-foreground">
                          {agent.country}
                        </p>
                      )}
                    </>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {agent.last_seen_at
                      ? isOnline
                        ? "Активен"
                        : `Нет связи с ${new Date(agent.last_seen_at).toLocaleString()}`
                      : "Не подключался"}
                  </p>
                  {!isEditing && (
                    <div className="mt-3 flex gap-2">
                      <select
                        id={`agent-country-quick-${agent.id}`}
                        defaultValue={agent.country ?? ""}
                        className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs"
                      >
                        <option value="">Выберите страну</option>
                        {countries.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          updateAgent.mutate({
                            id: agent.id,
                            name: agent.name,
                            location: agent.location ?? "",
                            country: (
                              document.getElementById(
                                `agent-country-quick-${agent.id}`,
                              ) as HTMLSelectElement
                            ).value,
                          })
                        }
                      >
                        Сохранить
                      </Button>
                    </div>
                  )}
                </div>
                <div className="flex">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditingId(isEditing ? null : agent.id)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (window.confirm(`Удалить агента «${agent.name}»?`))
                        deleteAgent.mutate(agent.id)
                    }}
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">
                  {showToken ? agent.token : "••••••••••••••••••••••••"}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setVisibleTokens(
                      showToken
                        ? visibleTokens.filter((id) => id !== agent.id)
                        : [...visibleTokens, agent.id],
                    )
                  }
                >
                  {showToken ? <EyeOff /> : <Eye />}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(agent.token)
                    showSuccessToast("Токен скопирован")
                  }}
                >
                  <Copy />
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
