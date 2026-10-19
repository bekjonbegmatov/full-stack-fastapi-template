import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Pencil, Plus } from "lucide-react"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import {
  type MonitoredServiceCreate,
  type MonitoredServicePublic,
  MonitoringService,
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
  address: z.string().min(1, "Укажите адрес"),
  ports: z.string().refine(
    (value) =>
      value
        .split(",")
        .filter(Boolean)
        .every(
          (port) =>
            Number.isInteger(Number(port)) &&
            Number(port) >= 1 &&
            Number(port) <= 65535,
        ),
    "Порты указываются через запятую: от 1 до 65535",
  ),
  check_method: z.enum(["tcp", "http"]),
  check_interval_seconds: z.number().int().min(10).max(86400),
  note: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export function ServiceDialog({
  groupId,
  service,
}: {
  groupId: string
  service?: MonitoredServicePublic
}) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      address: "",
      ports: "",
      check_method: "tcp",
      check_interval_seconds: 60,
      note: "",
    },
  })

  useEffect(() => {
    if (open) {
      // При редактировании показываем текущие значения сервиса.
      form.reset({
        name: service?.name ?? "",
        address: service?.address ?? "",
        ports: service?.ports?.join(", ") ?? "",
        check_method: service?.check_method ?? "tcp",
        check_interval_seconds: service?.check_interval_seconds ?? 60,
        note: service?.note ?? "",
      })
    }
  }, [form, open, service])

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      // Превращаем строку «80, 443» в массив чисел для API.
      const body: MonitoredServiceCreate = {
        ...data,
        ports: data.ports
          .split(",")
          .map((port) => Number(port.trim()))
          .filter(Boolean),
        note: data.note || null,
      }
      return service
        ? MonitoringService.updateService({
            path: { group_id: groupId, service_id: service.id },
            body,
          })
        : MonitoringService.createService({ path: { group_id: groupId }, body })
    },
    onSuccess: () => {
      showSuccessToast(service ? "Сервис обновлён" : "Сервис добавлен")
      setOpen(false)
      queryClient.invalidateQueries({ queryKey: ["resource-groups"] })
      queryClient.invalidateQueries({ queryKey: ["services", groupId] })
    },
    onError: handleError.bind(showErrorToast),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={service ? "ghost" : "outline"}
          size={service ? "icon" : "default"}
        >
          {service ? (
            <Pencil />
          ) : (
            <>
              <Plus />
              Добавить сервис
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))}>
            <DialogHeader>
              <DialogTitle>
                {service ? "Изменить сервис" : "Новый сервис"}
              </DialogTitle>
              <DialogDescription>
                Настройка сохранится и будет использована будущей проверкой.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Название</FormLabel>
                    <FormControl>
                      <Input placeholder="API" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Адрес</FormLabel>
                    <FormControl>
                      <Input placeholder="api.example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="ports"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Порты</FormLabel>
                    <FormControl>
                      <Input placeholder="80, 443, 8080" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="check_interval_seconds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Период, секунд</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="10"
                        {...field}
                        onChange={(event) =>
                          field.onChange(event.currentTarget.valueAsNumber)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="check_method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Метод проверки</FormLabel>
                    <FormControl>
                      <select
                        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                        {...field}
                      >
                        <option value="tcp">TCP</option>
                        <option value="http">HTTP</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="note"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Примечание</FormLabel>
                    <FormControl>
                      <Input placeholder="Основной endpoint" {...field} />
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
