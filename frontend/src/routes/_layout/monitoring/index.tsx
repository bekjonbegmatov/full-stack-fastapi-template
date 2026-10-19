import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Activity } from "lucide-react"
import { Suspense } from "react"

import { MonitoringService } from "@/client"
import { AgentsPanel } from "@/components/Monitoring/AgentsPanel"
import { GroupDialog } from "@/components/Monitoring/GroupDialog"
import { ResourceGroupCard } from "@/components/Monitoring/ResourceGroupCard"

export const Route = createFileRoute("/_layout/monitoring/")({
  component: MonitoringHome,
})

const groupsQuery = {
  queryKey: ["resource-groups"],
  queryFn: async () =>
    (
      await MonitoringService.readResourceGroups({
        query: { skip: 0, limit: 100 },
      })
    ).data,
}

function Groups() {
  const { data } = useSuspenseQuery(groupsQuery)
  if (!data.data.length) {
    return (
      <div className="rounded-lg border border-dashed py-12 text-center text-muted-foreground">
        Создайте группу ресурсов и добавьте в неё сервисы.
      </div>
    )
  }
  return (
    <div className="grid gap-5">
      {data.data.map((group) => (
        <ResourceGroupCard key={group.id} group={group} />
      ))}
    </div>
  )
}

function MonitoringHome() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Activity />
            Мониторинг
          </h1>
          <p className="text-muted-foreground">Группы и сервисы.</p>
        </div>
        <GroupDialog />
      </div>
      <AgentsPanel />
      <Suspense
        fallback={<p className="text-muted-foreground">Загрузка групп…</p>}
      >
        <Groups />
      </Suspense>
    </div>
  )
}
