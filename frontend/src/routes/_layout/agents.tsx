import { createFileRoute } from "@tanstack/react-router"
import { Bot } from "lucide-react"

import { AgentsPanel } from "@/components/Monitoring/AgentsPanel"

export const Route = createFileRoute("/_layout/agents")({
  component: AgentsPage,
})

function AgentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Bot />
          Агенты
        </h1>
        <p className="mt-1 text-muted-foreground">
          Подключённые точки проверки.
        </p>
      </div>
      <AgentsPanel />
    </div>
  )
}
