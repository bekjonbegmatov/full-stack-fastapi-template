import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Server, Trash2 } from "lucide-react"

import { MonitoringService, type ResourceGroupPublic } from "@/client"
import { Button } from "@/components/ui/button"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"
import { AvailabilityDots } from "./AvailabilityDots"
import { GroupDialog } from "./GroupDialog"
import { ServiceDialog } from "./ServiceDialog"

export function ResourceGroupCard({ group }: { group: ResourceGroupPublic }) {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  // Сервисы загружаются отдельно, чтобы карточки групп не ждали друг друга.
  const { data, isLoading } = useQuery({
    queryKey: ["services", group.id],
    queryFn: async () =>
      (await MonitoringService.readServices({ path: { group_id: group.id } }))
        .data,
  })
  const deleteGroup = useMutation({
    mutationFn: () =>
      MonitoringService.deleteResourceGroup({ path: { group_id: group.id } }),
    onSuccess: () => {
      showSuccessToast("Группа удалена вместе с сервисами")
      queryClient.invalidateQueries({ queryKey: ["resource-groups"] })
    },
    onError: handleError.bind(showErrorToast),
  })
  const deleteService = useMutation({
    mutationFn: (serviceId: string) =>
      MonitoringService.deleteService({
        path: { group_id: group.id, service_id: serviceId },
      }),
    onSuccess: () => {
      showSuccessToast("Сервис удалён")
      // Обновляем и список сервисов, и счётчик на карточке группы.
      queryClient.invalidateQueries({ queryKey: ["resource-groups"] })
      queryClient.invalidateQueries({ queryKey: ["services", group.id] })
    },
    onError: handleError.bind(showErrorToast),
  })

  return (
    <section className="rounded-lg border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Server className="size-5 text-primary" />
            <Link
              to="/monitoring/$groupId"
              params={{ groupId: group.id }}
              className="text-lg font-semibold hover:underline"
            >
              {group.name}
            </Link>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {group.description || "Без описания"}
          </p>
        </div>
        <div className="flex gap-2">
          <GroupDialog group={group} />
          <Button
            variant="destructive"
            size="icon"
            disabled={deleteGroup.isPending}
            onClick={() => {
              if (
                window.confirm(`Удалить группу «${group.name}» и все сервисы?`)
              )
                deleteGroup.mutate()
            }}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between">
        <h3 className="font-medium">
          Сервисы ({data?.count ?? group.services_count})
        </h3>
        <ServiceDialog groupId={group.id} />
      </div>
      {isLoading ? (
        <p className="py-4 text-sm text-muted-foreground">Загрузка сервисов…</p>
      ) : (
        <div className="mt-3 divide-y rounded-md border">
          {data?.data.length ? (
            data.data.map((service) => (
              <div
                key={service.id}
                className="flex items-center justify-between gap-3 p-3"
              >
                <div className="min-w-0">
                  <Link
                    to="/monitoring/$groupId/$serviceId"
                    params={{ groupId: group.id, serviceId: service.id }}
                    className="font-medium hover:underline"
                  >
                    {service.name}
                  </Link>
                  <p className="truncate text-sm text-muted-foreground">
                    {(service.check_method ?? "tcp").toUpperCase()} ·{" "}
                    {service.address}
                    {service.ports?.length
                      ? `:${service.ports.join(", ")}`
                      : ""}{" "}
                    · каждые {service.check_interval_seconds} сек.
                  </p>
                  {service.note && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {service.note}
                    </p>
                  )}
                  <div className="mt-2">
                    <AvailabilityDots groupId={group.id} service={service} />
                  </div>
                </div>
                <div className="flex shrink-0">
                  <ServiceDialog groupId={group.id} service={service} />
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={deleteService.isPending}
                    onClick={() => {
                      if (window.confirm(`Удалить сервис «${service.name}»?`))
                        deleteService.mutate(service.id)
                    }}
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <p className="p-4 text-sm text-muted-foreground">
              Добавьте первый сервис для мониторинга.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
