import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, Outlet } from "@tanstack/react-router"
import { ChevronLeft, Server } from "lucide-react"

import { MonitoringService } from "@/client"
import { GroupDialog } from "@/components/Monitoring/GroupDialog"
import { ServiceDialog } from "@/components/Monitoring/ServiceDialog"
import { Button } from "@/components/ui/button"

export const Route = createFileRoute("/_layout/monitoring/$groupId")({
  component: GroupPage,
})

const availability = {
  up: { label: "Доступен", color: "text-emerald-500" },
  down: { label: "Недоступен", color: "text-rose-500" },
  partial: { label: "Частично доступен", color: "text-amber-500" },
  unknown: { label: "Нет свежих данных", color: "text-amber-500" },
}

function GroupPage() {
  const { groupId } = Route.useParams()
  const group = useQuery({
    queryKey: ["resource-group", groupId],
    queryFn: async () =>
      (
        await MonitoringService.readResourceGroup({
          path: { group_id: groupId },
        })
      ).data,
  })
  const services = useQuery({
    queryKey: ["services", groupId],
    queryFn: async () =>
      (await MonitoringService.readServices({ path: { group_id: groupId } }))
        .data,
    refetchInterval: 30000,
  })

  if (group.isLoading || services.isLoading) {
    return <p className="text-muted-foreground">Загрузка группы…</p>
  }
  if (!group.data) {
    return <p className="text-muted-foreground">Группа не найдена.</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" className="-ml-3 mb-2">
          <Link to="/monitoring">
            <ChevronLeft />К группам
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">{group.data.name}</h1>
          <GroupDialog group={group.data} />
        </div>
        {group.data.description && (
          <p className="mt-1 text-muted-foreground">{group.data.description}</p>
        )}
      </div>
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="h-fit rounded-xl border bg-card p-3">
          <div className="mb-3 flex flex-col items-stretch gap-3 px-2">
            <span className="text-sm font-semibold">Сервисы</span>
            <ServiceDialog groupId={groupId} />
          </div>
          <nav className="space-y-1">
            {services.data?.data.map((service) => (
              <Link
                key={service.id}
                to="/monitoring/$groupId/$serviceId"
                params={{ groupId, serviceId: service.id }}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"
                activeProps={{
                  className:
                    "flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm font-medium text-primary",
                }}
              >
                <Server
                  role="img"
                  aria-label={
                    availability[service.availability ?? "unknown"].label
                  }
                  className={`size-4 shrink-0 ${availability[service.availability ?? "unknown"].color}`}
                >
                  <title>
                    {availability[service.availability ?? "unknown"].label}
                  </title>
                </Server>
                <span className="truncate">{service.name}</span>
              </Link>
            ))}
            {!services.data?.data.length && (
              <p className="px-3 py-5 text-sm text-muted-foreground">
                Нет сервисов
              </p>
            )}
          </nav>
        </aside>
        <section className="min-w-0">
          <Outlet />
        </section>
      </div>
    </div>
  )
}
