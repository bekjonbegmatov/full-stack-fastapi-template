import secrets
import uuid
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Header, HTTPException
from sqlmodel import col, select

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    AgentReportCreate,
    AgentTask,
    AgentTasksPublic,
    CheckReport,
    Message,
    MonitoredService,
    MonitoringAgent,
    MonitoringAgentCreate,
    MonitoringAgentPublic,
    MonitoringAgentsPublic,
    MonitoringAgentUpdate,
    ServiceAgent,
)

router = APIRouter(prefix="/agents", tags=["agents"])
AgentToken = Annotated[str, Header(alias="X-Agent-Token")]


def get_agent_for_user(
    session: SessionDep, current_user: CurrentUser, agent_id: uuid.UUID
) -> MonitoringAgent:
    agent = session.get(MonitoringAgent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    if not current_user.is_superuser and agent.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return agent


def get_agent_by_token(session: SessionDep, token: AgentToken) -> MonitoringAgent:
    # Агент подтверждает себя токеном, который выдан в админке.
    agent = session.exec(
        select(MonitoringAgent).where(MonitoringAgent.token == token)
    ).first()

    if not agent:
        raise HTTPException(status_code=401, detail="Invalid agent token")

    # Время последней связи показывается в списке агентов.
    agent.last_seen_at = datetime.now(UTC)
    session.add(agent)
    session.commit()

    return agent


def get_service_for_report(
    session: SessionDep,
    agent: MonitoringAgent,
    service_id: uuid.UUID,
) -> MonitoredService:
    """Проверяет, что результат пришёл от назначенного агента."""
    service = session.get(MonitoredService, service_id)

    if not service:
        raise HTTPException(status_code=403, detail="Service is not assigned to agent")

    link = session.get(ServiceAgent, (service_id, agent.id))
    if not link:
        raise HTTPException(
            status_code=403,
            detail="Service is not assigned to agent",
        )

    return service


@router.get("/", response_model=MonitoringAgentsPublic)
def read_agents(session: SessionDep, current_user: CurrentUser) -> Any:
    newest_first = col(MonitoringAgent.created_at).desc()
    statement = select(MonitoringAgent).order_by(newest_first)

    if not current_user.is_superuser:
        statement = statement.where(MonitoringAgent.owner_id == current_user.id)

    agents = session.exec(statement).all()

    return MonitoringAgentsPublic(data=agents, count=len(agents))


@router.post("/", response_model=MonitoringAgentPublic)
def create_agent(
    *, session: SessionDep, current_user: CurrentUser, agent_in: MonitoringAgentCreate
) -> MonitoringAgent:
    # 90 случайных байт в URL-safe Base64 дают ровно 120 символов.
    agent = MonitoringAgent.model_validate(
        agent_in,
        update={"owner_id": current_user.id, "token": secrets.token_urlsafe(90)},
    )
    session.add(agent)
    session.commit()
    session.refresh(agent)
    return agent


@router.put("/{agent_id}", response_model=MonitoringAgentPublic)
def update_agent(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    agent_id: uuid.UUID,
    agent_in: MonitoringAgentUpdate,
) -> MonitoringAgent:
    agent = get_agent_for_user(session, current_user, agent_id)
    agent.sqlmodel_update(agent_in.model_dump(exclude_unset=True))
    session.add(agent)
    session.commit()
    session.refresh(agent)
    return agent


@router.delete("/{agent_id}")
def delete_agent(
    session: SessionDep, current_user: CurrentUser, agent_id: uuid.UUID
) -> Message:
    agent = get_agent_for_user(session, current_user, agent_id)
    session.delete(agent)
    session.commit()
    return Message(message="Agent deleted")


@router.get("/tasks", response_model=AgentTasksPublic)
def read_agent_tasks(session: SessionDep, token: AgentToken) -> AgentTasksPublic:
    agent = get_agent_by_token(session, token)

    services = session.exec(
        select(MonitoredService)
        .join(ServiceAgent)
        .where(ServiceAgent.agent_id == agent.id)
    ).all()

    return AgentTasksPublic(
        data=[AgentTask.model_validate(service) for service in services]
    )


@router.post("/reports")
def create_reports(
    *, session: SessionDep, token: AgentToken, reports: list[AgentReportCreate]
) -> Message:
    agent = get_agent_by_token(session, token)

    for report_in in reports:
        get_service_for_report(session, agent, report_in.service_id)

        report = CheckReport.model_validate(
            report_in,
            update={"agent_id": agent.id},
        )
        session.add(report)

    session.commit()

    return Message(message="Reports accepted")
