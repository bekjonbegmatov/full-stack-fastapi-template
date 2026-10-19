import uuid
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


def check_agent_access(
    session: SessionDep, current_user: CurrentUser, agent_id: uuid.UUID | None
) -> None:
    """Не даёт привязать сервис к чужому агенту."""
    if agent_id is None:
        return
    agent = session.get(MonitoringAgent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Monitoring agent not found")
    if not current_user.is_superuser and agent.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")


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
    return MonitoredServicesPublic(data=services, count=len(services))


@router.post("/{group_id}/services", response_model=MonitoredServicePublic)
def create_service(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    group_id: uuid.UUID,
    service_in: MonitoredServiceCreate,
) -> MonitoredService:

    get_group_or_404(session, current_user, group_id)
    check_agent_access(session, current_user, service_in.agent_id)

    # Идентификатор группы берём из URL, а не из тела запроса.
    service = MonitoredService.model_validate(
        service_in, update={"resource_group_id": group_id}
    )
    session.add(service)
    session.commit()
    session.refresh(service)
    return service


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
    if "agent_id" in changes:
        check_agent_access(session, current_user, changes["agent_id"])
    service.sqlmodel_update(changes)
    session.add(service)
    session.commit()
    session.refresh(service)
    return service


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
