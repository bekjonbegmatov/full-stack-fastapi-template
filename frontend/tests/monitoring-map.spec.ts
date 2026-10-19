import { expect, test } from "@playwright/test"

test.use({ storageState: { cookies: [], origins: [] } })

// Данные подменяем только в браузере: реальные агенты остаются нетронутыми.
test("карта, легенда, фильтры и пустая история", async ({ page }) => {
  const now = Date.now()
  const date = (minutes: number) =>
    new Date(now - minutes * 60000).toISOString()
  const agents = [
    { id: "de-1", name: "Берлин", country: "DE" },
    { id: "us-1", name: "Нью-Йорк", country: "US" },
    { id: "jp-1", name: "Токио", country: "JP" },
    { id: "de-2", name: "Франкфурт", country: "DE" },
  ]
  const service = {
    id: "service",
    resource_group_id: "group",
    name: "Основной API",
    address: "https://example.test",
    ports: [443],
    check_method: "http",
    check_interval_seconds: 60,
    agent_ids: agents.map((agent) => agent.id),
  }
  const latest = agents.map((agent, index) => ({
    id: `report-${index}`,
    service_id: "service",
    agent_id: agent.id,
    port: 443,
    checked_at: date(index === 2 ? 60 : 0),
    status: index === 1 ? "down" : "up",
    latency_ms: index === 1 ? 9999 : 100 + index * 20,
    detail: index === 1 ? "response stream aborted" : "200 - OK",
  }))
  const points = Array.from({ length: 60 }, (_, i) =>
    agents.map((agent, index) => ({
      agent_id: agent.id,
      port: 443,
      checked_at: date((60 - i) * 6),
      latency_ms:
        index === 1 && i > 50 ? null : 100 + index * 20 + Math.sin(i) * 20,
      up_count: index === 1 && i > 50 ? 0 : 6,
      down_count: index === 1 && i > 50 ? 6 : 0,
    })),
  ).flat()
  const requests: URL[] = []
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.addInitScript(() => {
    localStorage.setItem("access_token", "browser-test")
    localStorage.setItem("vite-ui-theme", "light")
  })
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url())
    requests.push(url)
    let json: unknown = {}
    if (url.pathname.endsWith("/users/me"))
      json = {
        id: "user",
        email: "test@example.test",
        full_name: "Тест",
        is_active: true,
        is_superuser: true,
      }
    else if (/\/agents\/?$/.test(url.pathname))
      json = { data: agents, count: agents.length }
    else if (url.pathname.endsWith("/resource-groups/group"))
      json = { id: "group", name: "Рабочие сервисы" }
    else if (url.pathname.endsWith("/services"))
      json = { data: [service], count: 1 }
    else if (url.pathname.endsWith("/history"))
      json = {
        points: url.searchParams.get("hours") === "720" ? [] : points,
        latest,
        start: date(Number(url.searchParams.get("hours")) * 60),
        end: date(0),
        bucket_seconds: 360,
      }
    else if (url.pathname.endsWith("/stats"))
      json = {
        current_latency_ms: null,
        average_latency_24h_ms: 135,
        uptime_24h_percent: 98.5,
        uptime_30d_percent: 99.82,
      }
    else if (url.pathname.endsWith("/reports")) {
      const selected = latest.filter(
        (report) =>
          (!url.searchParams.get("agent_id") ||
            report.agent_id === url.searchParams.get("agent_id")) &&
          (!url.searchParams.get("status") ||
            report.status === url.searchParams.get("status")),
      )
      json = { data: selected, count: selected.length ? 30 : 0 }
    }
    await route.fulfill({ json })
  })
  await page.setViewportSize({ width: 1440, height: 1080 })
  await page.goto("/monitoring/group/service")
  await expect
    .poll(() => page.locator("path[data-country]").count())
    .toBeGreaterThan(170)
  await expect(page.locator('path[data-country="010"]')).toHaveCount(0)
  await expect(page.locator('g[data-status="up"]')).toHaveCount(1)
  await expect(page.locator('g[data-status="down"]')).toHaveCount(1)
  await expect(page.locator('g[data-status="unknown"]')).toHaveCount(1)
  await expect(page.locator('g[data-status="down"] path')).toHaveAttribute(
    "fill",
    "#f43f5e",
  )
  const legend = page.getByRole("group", { name: "Легенда графика" })
  await expect(legend.getByRole("button")).toHaveCount(4)
  await legend.getByRole("button", { name: "Берлин :443", exact: true }).click()
  await expect(
    legend.getByRole("button", { name: "Берлин :443", exact: true }),
  ).toHaveAttribute("aria-pressed", "false")
  await legend.getByRole("button", { name: "Берлин :443", exact: true }).click()
  await page.locator('g[data-status="down"]').hover()
  await expect(page.getByRole("tooltip")).toContainText("Нью-Йорк · Недоступен")
  await page.locator('g[data-status="down"]').click()
  await expect(
    page.getByRole("combobox", { name: "Агент", exact: true }),
  ).toHaveValue("us-1")
  await expect(legend.getByRole("button")).toHaveCount(1)
  await expect(page.getByRole("table")).not.toContainText("9999")
  await page.getByRole("button", { name: "Все агенты", exact: true }).click()
  await page.getByRole("button", { name: "Вперёд", exact: true }).click()
  await expect
    .poll(() => requests.some((url) => url.searchParams.get("skip") === "12"))
    .toBe(true)
  await page
    .getByRole("combobox", { name: "Статус проверки" })
    .selectOption("error")
  await expect(page.getByRole("table")).toContainText(
    "Нет проверок по выбранным фильтрам.",
  )
  await expect
    .poll(() =>
      requests.some(
        (url) =>
          url.searchParams.get("status") === "error" &&
          url.searchParams.get("skip") === "0",
      ),
    )
    .toBe(true)
  await page
    .getByRole("combobox", { name: "Статус проверки" })
    .selectOption("all")
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({
    path: "/tmp/monitoring-map-desktop.png",
    fullPage: true,
  })
  await page
    .getByRole("combobox", { name: "Период графика" })
    .selectOption("720")
  await expect(
    page.getByText("Нет проверок за выбранный период."),
  ).toBeVisible()
  await expect(page.locator('g[data-status="down"]')).toHaveCount(1)
  await page
    .getByRole("combobox", { name: "Период графика" })
    .selectOption("12")
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({
    path: "/tmp/monitoring-map-mobile.png",
    fullPage: true,
  })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.evaluate(() => localStorage.setItem("vite-ui-theme", "dark"))
  await page.reload()
  await expect(page.locator('g[data-status="down"]')).toHaveCount(1)
  await page.setViewportSize({ width: 1440, height: 1080 })
  await page.screenshot({
    path: "/tmp/monitoring-map-dark.png",
    fullPage: true,
  })
  expect(errors).toEqual([])
})
