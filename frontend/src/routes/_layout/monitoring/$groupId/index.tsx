import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout/monitoring/$groupId/")({
  component: GroupEmpty,
})

function GroupEmpty() {
  return (
    <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground">
      Выберите сервис слева.
    </div>
  )
}
