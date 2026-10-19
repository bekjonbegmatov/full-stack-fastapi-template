import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Pencil, Plus } from "lucide-react"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import {
  MonitoringService,
  type ResourceGroupCreate,
  type ResourceGroupPublic,
} from "@/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { LoadingButton } from "@/components/ui/loading-button"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

const schema = z.object({
  name: z.string().min(1, "Укажите название"),
  description: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export function GroupDialog({ group }: { group?: ResourceGroupPublic }) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "" },
  })

  useEffect(() => {
    if (open) {
      // Очищаем форму для новой группы или подставляем данные выбранной.
      form.reset({
        name: group?.name ?? "",
        description: group?.description ?? "",
      })
    }
  }, [form, group, open])

  const mutation = useMutation({
    mutationFn: (body: ResourceGroupCreate) =>
      group
        ? MonitoringService.updateResourceGroup({
            path: { group_id: group.id },
            body,
          })
        : MonitoringService.createResourceGroup({ body }),
    onSuccess: () => {
      showSuccessToast(group ? "Группа обновлена" : "Группа создана")
      setOpen(false)
      queryClient.invalidateQueries({ queryKey: ["resource-groups"] })
    },
    onError: handleError.bind(showErrorToast),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={group ? "outline" : "default"}>
          {group ? <Pencil /> : <Plus />}
          {group ? "Изменить" : "Добавить группу"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))}>
            <DialogHeader>
              <DialogTitle>
                {group ? "Изменить группу" : "Новая группа"}
              </DialogTitle>
              <DialogDescription>
                Например, сервер клиента, production или внутренние сервисы.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Название</FormLabel>
                    <FormControl>
                      <Input placeholder="Production" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Описание</FormLabel>
                    <FormControl>
                      <Input placeholder="Сервисы основного сайта" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Отмена</Button>
              </DialogClose>
              <LoadingButton type="submit" loading={mutation.isPending}>
                Сохранить
              </LoadingButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
