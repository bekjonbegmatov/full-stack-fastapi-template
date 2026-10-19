import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    CheckReport,
    CheckReportPublic,
    CheckReportsPublic,
    Message,
    MonitoredService,
    MonitoredServiceCreate,
    MonitoredServicePublic,
    MonitoredServicesPublic,
    MonitoredServiceUpdate,
    MonitoringAgent,
    ResourceGroup,
    ResourceGroupCreate,
    ResourceGroupPublic,
    ResourceGroupsPublic,
    ResourceGroupUpdate,
    ServiceAgent,
    ServiceStatsPublic,
)

router = APIRouter(prefix="/resource-groups", tags=["monitoring"])


def get_group_or_404(
    session: SessionDep, current_user: CurrentUser, group_id: uuid.UUID
) -> ResourceGroup:
    # Обычный пользователь работает только со своими группами.

    group = session.get(ResourceGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Resource group not found")
    if not current_user.is_superuser and group.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return group


def group_public(session: SessionDep, group: ResourceGroup) -> ResourceGroupPublic:
    # Счётчик позволяет показывать состав группы без загрузки всех сервисов.

    count = session.exec(
        select(func.count())
        .select_from(MonitoredService)
        .where(MonitoredService.resource_group_id == group.id)
    ).one()
    return ResourceGroupPublic.model_validate(group, update={"services_count": count})


def check_agents_access(
    session: SessionDep,
    current_user: CurrentUser,
    agent_ids: list[uuid.UUID],
) -> list[uuid.UUID]:
    """Проверяет выбранных агентов и убирает повторяющиеся идентификаторы."""
    unique_ids = list(dict.fromkeys(agent_ids))
    if len(unique_ids) > 100:
        raise HTTPException(status_code=422, detail="Choose no more than 100 agents")

    for agent_id in unique_ids:
        agent = session.get(MonitoringAgent, agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="Monitoring agent not found")
        if not current_user.is_superuser and agent.owner_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not enough permissions")

    return unique_ids


def service_public(
    session: SessionDep, service: MonitoredService
) -> MonitoredServicePublic:
    agent_ids = session.exec(
        select(ServiceAgent.agent_id).where(ServiceAgent.service_id == service.id)
    ).all()
    return MonitoredServicePublic.model_validate(
        service, update={"agent_ids": agent_ids}
    )


def replace_service_agents(
    session: SessionDep,
    service_id: uuid.UUID,
    agent_ids: list[uuid.UUID],
) -> None:
    links = session.exec(
        select(ServiceAgent).where(ServiceAgent.service_id == service_id)
    ).all()
    for link in links:
        session.delete(link)
    for agent_id in agent_ids:
        session.add(ServiceAgent(service_id=service_id, agent_id=agent_id))


@router.get("/", response_model=ResourceGroupsPublic)
def read_resource_groups(
    session: SessionDep, current_user: CurrentUser, skip: int = 0, limit: int = 100
) -> Any:

    statement = select(ResourceGroup).order_by(col(ResourceGroup.created_at).desc())

    if not current_user.is_superuser:
        # Администратор видит все группы, остальные — только свои.
        statement = statement.where(ResourceGroup.owner_id == current_user.id)
    groups = session.exec(statement.offset(skip).limit(limit)).all()
    return ResourceGroupsPublic(
        data=[group_public(session, group) for group in groups], count=len(groups)
    )


@router.post("/", response_model=ResourceGroupPublic)
def create_resource_group(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    group_in: ResourceGroupCreate,
) -> ResourceGroupPublic:

    group = ResourceGroup.model_validate(group_in, update={"owner_id": current_user.id})
    session.add(group)
    session.commit()
    session.refresh(group)
    return group_public(session, group)


@router.get("/{group_id}", response_model=ResourceGroupPublic)
def read_resource_group(
    session: SessionDep, current_user: CurrentUser, group_id: uuid.UUID
) -> ResourceGroupPublic:
    return group_public(session, get_group_or_404(session, current_user, group_id))


@router.put("/{group_id}", response_model=ResourceGroupPublic)
def update_resource_group(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    group_id: uuid.UUID,
    group_in: ResourceGroupUpdate,
) -> ResourceGroupPublic:

    group = get_group_or_404(session, current_user, group_id)
    group.sqlmodel_update(group_in.model_dump(exclude_unset=True))
    session.add(group)
    session.commit()
    session.refresh(group)
    return group_public(session, group)


@router.delete("/{group_id}")
def delete_resource_group(
    session: SessionDep, current_user: CurrentUser, group_id: uuid.UUID
) -> Message:

    group = get_group_or_404(session, current_user, group_id)
    session.delete(group)

    # Связанные сервисы удалит правило CASCADE в базе данных.
    session.commit()
    return Message(message="Resource group deleted")


@router.get("/{group_id}/services", response_model=MonitoredServicesPublic)
def read_services(
    session: SessionDep, current_user: CurrentUser, group_id: uuid.UUID
) -> Any:

    get_group_or_404(session, current_user, group_id)
    services = session.exec(
        select(MonitoredService)
        .where(MonitoredService.resource_group_id == group_id)
        .order_by(col(MonitoredService.created_at).desc())
    ).all()
    return MonitoredServicesPublic(
        data=[service_public(session, service) for service in services],
        count=len(services),
    )


@router.post("/{group_id}/services", response_model=MonitoredServicePublic)
def create_service(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    group_id: uuid.UUID,
    service_in: MonitoredServiceCreate,
) -> MonitoredService:

    get_group_or_404(session, current_user, group_id)
    agent_ids = check_agents_access(session, current_user, service_in.agent_ids)

    # Идентификатор группы берём из URL, а не из тела запроса.
    service_data = service_in.model_dump(exclude={"agent_ids"})
    service = MonitoredService.model_validate(
        service_data,
        update={"resource_group_id": group_id},
    )
    session.add(service)
    session.flush()
    replace_service_agents(session, service.id, agent_ids)
    session.commit()
    session.refresh(service)
    return service_public(session, service)


@router.put("/{group_id}/services/{service_id}", response_model=MonitoredServicePublic)
def update_service(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    group_id: uuid.UUID,
    service_id: uuid.UUID,
    service_in: MonitoredServiceUpdate,
) -> MonitoredService:

    get_group_or_404(session, current_user, group_id)

    service = session.get(MonitoredService, service_id)
    if not service or service.resource_group_id != group_id:
        raise HTTPException(status_code=404, detail="Monitored service not found")

    changes = service_in.model_dump(exclude_unset=True)
    agent_ids = changes.pop("agent_ids", None)
    if agent_ids is not None:
        agent_ids = check_agents_access(session, current_user, agent_ids)
    service.sqlmodel_update(changes)
    session.add(service)
    if agent_ids is not None:
        replace_service_agents(session, service.id, agent_ids)
    session.commit()
    session.refresh(service)
    return service_public(session, service)


@router.delete("/{group_id}/services/{service_id}")
def delete_service(
    session: SessionDep,
    current_user: CurrentUser,
    group_id: uuid.UUID,
    service_id: uuid.UUID,
) -> Message:

    get_group_or_404(session, current_user, group_id)

    service = session.get(MonitoredService, service_id)
    if not service or service.resource_group_id != group_id:
        raise HTTPException(status_code=404, detail="Monitored service not found")

    session.delete(service)
    session.commit()
    return Message(message="Monitored service deleted")


@router.get(
    "/{group_id}/services/{service_id}/reports", response_model=CheckReportsPublic
)
def read_service_reports(
    session: SessionDep,
    current_user: CurrentUser,
    group_id: uuid.UUID,
    service_id: uuid.UUID,
) -> CheckReportsPublic:
    get_group_or_404(session, current_user, group_id)
    service = session.get(MonitoredService, service_id)
    if not service or service.resource_group_id != group_id:
        raise HTTPException(status_code=404, detail="Monitored service not found")
    reports = session.exec(
        select(CheckReport)
        .where(CheckReport.service_id == service_id)
        .order_by(col(CheckReport.checked_at).desc())
        .limit(40)
    ).all()
    return CheckReportsPublic(
        data=[CheckReportPublic.model_validate(report) for report in reports]
    )


@router.get(
    "/{group_id}/services/{service_id}/stats", response_model=ServiceStatsPublic
)
def read_service_stats(
    session: SessionDep,
    current_user: CurrentUser,
    group_id: uuid.UUID,
    service_id: uuid.UUID,
) -> ServiceStatsPublic:
    """Собирает числа для карточек на странице сервиса."""
    get_group_or_404(session, current_user, group_id)

    service = session.get(MonitoredService, service_id)
    if not service or service.resource_group_id != group_id:
        raise HTTPException(status_code=404, detail="Monitored service not found")

    now = datetime.now(UTC)
    reports = session.exec(
        select(CheckReport)
        .where(CheckReport.service_id == service_id)
        .order_by(col(CheckReport.checked_at).desc())
    ).all()

    last_report = reports[0] if reports else None
    reports_24h = [
        report for report in reports if report.checked_at >= now - timedelta(days=1)
    ]
    reports_30d = [
        report for report in reports if report.checked_at >= now - timedelta(days=30)
    ]

    latencies = [
        report.latency_ms for report in reports_24h if report.latency_ms is not None
    ]

    def uptime_percent(items: list[CheckReport]) -> float | None:
        if not items:
            return None
        available = sum(report.status == "up" for report in items)
        return round(available * 100 / len(items), 2)

    certificate_date = next(
        (
            report.certificate_expires_at
            for report in reports
            if report.certificate_expires_at is not None
        ),
        None,
    )

    return ServiceStatsPublic(
        current_latency_ms=last_report.latency_ms if last_report else None,
        average_latency_24h_ms=round(sum(latencies) / len(latencies))
        if latencies
        else None,
        uptime_24h_percent=uptime_percent(reports_24h),
        uptime_30d_percent=uptime_percent(reports_30d),
        certificate_expires_at=certificate_date,
    )
