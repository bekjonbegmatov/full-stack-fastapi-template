import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Copy, Cpu, Plus, Trash2 } from "lucide-react"
import { useState } from "react"

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
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const { data } = useQuery(agentsQuery)
  const createAgent = useMutation({
    mutationFn: () =>
      AgentsService.createAgent({ body: { name, location: location || null } }),
    onSuccess: () => {
      setName("")
      setLocation("")
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

  return (
    <section className="rounded-lg border bg-card p-5">
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
        <Button
          disabled={!name || createAgent.isPending}
          onClick={() => createAgent.mutate()}
        >
          <Plus />
          Добавить агента
        </Button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {data?.data.map((agent) => (
          <div key={agent.id} className="rounded-md border p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{agent.name}</p>
                <p className="text-sm text-muted-foreground">
                  {agent.location || "Локация не указана"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {agent.last_seen_at
                    ? `На связи: ${new Date(agent.last_seen_at).toLocaleString()}`
                    : "Ещё не подключался"}
                </p>
              </div>
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
            <div className="mt-3 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">
                {agent.token}
              </code>
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
        ))}
      </div>
    </section>
  )
}
