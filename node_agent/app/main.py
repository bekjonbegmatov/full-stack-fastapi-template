import asyncio
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from urllib.parse import urlsplit, urlunsplit

import httpx
from fastapi import FastAPI
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    SERVER_URL: str
    AGENT_TOKEN: str
    POLL_SECONDS: int = 10


settings = Settings()
last_checks: dict[str, float] = {}


def make_http_url(task: dict, port: int | None) -> str:
    """Собирает URL из адреса, порта и пути задания."""
    address = task["address"]
    if not address.startswith(("http://", "https://")):
        address = f"http://{address}"
    parts = urlsplit(address)
    host = parts.hostname or ""
    if port:
        host = f"{host}:{port}"
    path = task.get("http_path") or "/"
    return urlunsplit((parts.scheme, host, path, "", ""))


def tcp_host(address: str) -> str:
    """TCP не использует схему URL, ему нужен только хост или IP."""
    if address.startswith(("http://", "https://")):
        return urlsplit(address).hostname or address
    return address.split("/")[0]


async def check_tcp(task: dict, port: int) -> tuple[str, int | None, str | None]:
    started = time.perf_counter()
    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(tcp_host(task["address"]), port), timeout=10
        )
        writer.close()
        await writer.wait_closed()
        return "up", round((time.perf_counter() - started) * 1000), None
    except Exception as error:
        return "down", round((time.perf_counter() - started) * 1000), str(error)


async def check_http(task: dict, port: int | None) -> tuple[str, int | None, str | None]:
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=10) as client:
            response = await client.request(task["http_method"], make_http_url(task, port))
        latency = round((time.perf_counter() - started) * 1000)
        if response.status_code == task["expected_status"]:
            return "up", latency, None
        return "down", latency, f"HTTP {response.status_code}"
    except Exception as error:
        return "error", round((time.perf_counter() - started) * 1000), str(error)


async def run_task(task: dict) -> list[dict]:
    """Проверяет каждый порт отдельно, чтобы на графике был точный результат."""
    ports = task["ports"] or [None]
    results = []
    for port in ports:
        if task["check_method"] == "tcp":
            if port is None:
                results.append({"service_id": task["id"], "status": "error", "detail": "TCP requires a port"})
                continue
            status, latency, detail = await check_tcp(task, port)
        else:
            status, latency, detail = await check_http(task, port)
        results.append({"service_id": task["id"], "port": port, "status": status, "latency_ms": latency, "detail": detail})
    return results


async def worker() -> None:
    headers = {"X-Agent-Token": settings.AGENT_TOKEN}
    while True:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.get(f"{settings.SERVER_URL}/api/v1/agents/tasks", headers=headers)
                response.raise_for_status()
                tasks = response.json()["data"]
                reports = []
                now = time.monotonic()
                for task in tasks:
                    key = task["id"]
                    if now - last_checks.get(key, 0) >= task["check_interval_seconds"]:
                        reports.extend(await run_task(task))
                        last_checks[key] = now
                if reports:
                    result = await client.post(f"{settings.SERVER_URL}/api/v1/agents/reports", headers=headers, json=reports)
                    result.raise_for_status()
        except Exception as error:
            # Ошибка сети не останавливает агент: он попробует снова на следующем цикле.
            print(f"agent cycle error: {error}")
        await asyncio.sleep(settings.POLL_SECONDS)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    task = asyncio.create_task(worker())
    yield
    task.cancel()


app = FastAPI(title="Monitoring node agent", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}
