import uuid
from datetime import UTC, datetime
from enum import StrEnum

from pydantic import EmailStr, field_validator
from sqlalchemy import DateTime, Integer
from sqlalchemy.dialects.postgresql import ARRAY
from sqlmodel import Field, Relationship, SQLModel


def get_datetime_utc() -> datetime:
    return datetime.now(UTC)


# Shared properties
class UserBase(SQLModel):
    email: EmailStr = Field(unique=True, index=True, max_length=255)
    is_active: bool = True
    is_superuser: bool = False
    full_name: str | None = Field(default=None, max_length=255)


# Properties to receive via API on creation
class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)


class UserRegister(SQLModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)


# Properties to receive via API on update, all are optional
class UserUpdate(SQLModel):
    email: EmailStr | None = Field(default=None, max_length=255)
    is_active: bool | None = None
    is_superuser: bool | None = None
    full_name: str | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, min_length=8, max_length=128)


class UserUpdateMe(SQLModel):
    full_name: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = Field(default=None, max_length=255)


class UpdatePassword(SQLModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


# Database model, database table inferred from class name
class User(UserBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    hashed_password: str
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    items: list[Item] = Relationship(back_populates="owner", cascade_delete=True)
    resource_groups: list["ResourceGroup"] = Relationship(  # noqa: UP037
        back_populates="owner", cascade_delete=True
    )


# Properties to return via API, id is always required
class UserPublic(UserBase):
    id: uuid.UUID
    created_at: datetime | None = None


class UsersPublic(SQLModel):
    data: list[UserPublic]
    count: int


# Shared properties
class ItemBase(SQLModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)


# Properties to receive on item creation
class ItemCreate(ItemBase):
    pass


# Properties to receive on item update
class ItemUpdate(SQLModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)


# Database model, database table inferred from class name
class Item(ItemBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    owner_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE"
    )
    owner: User | None = Relationship(back_populates="items")


# Properties to return via API, id is always required
class ItemPublic(ItemBase):
    id: uuid.UUID
    owner_id: uuid.UUID
    created_at: datetime | None = None


class ItemsPublic(SQLModel):
    data: list[ItemPublic]
    count: int


# Группа объединяет сервисы одного сервера, продукта или окружения.
class ResourceGroupBase(SQLModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1000)


class ResourceGroupCreate(ResourceGroupBase):
    pass


class ResourceGroupUpdate(SQLModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1000)


class ResourceGroup(ResourceGroupBase, table=True):
    __tablename__ = "resource_group"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    owner_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE"
    )
    owner: User | None = Relationship(back_populates="resource_groups")
    services: list["MonitoredService"] = Relationship(  # noqa: UP037
        back_populates="resource_group", cascade_delete=True
    )


class ResourceGroupPublic(ResourceGroupBase):
    id: uuid.UUID
    owner_id: uuid.UUID
    created_at: datetime | None = None
    services_count: int = 0


class ResourceGroupsPublic(SQLModel):
    data: list[ResourceGroupPublic]
    count: int


# Параметры проверки хранятся отдельно от её будущих результатов.
class CheckMethod(StrEnum):
    tcp = "tcp"
    http = "http"


class HttpMethod(StrEnum):
    GET = "GET"
    POST = "POST"
    HEAD = "HEAD"


class CheckStatus(StrEnum):
    up = "up"
    down = "down"
    error = "error"


class MonitoredServiceBase(SQLModel):
    name: str = Field(min_length=1, max_length=255)
    address: str = Field(min_length=1, max_length=255)
    ports: list[int] = Field(default_factory=list, sa_type=ARRAY(Integer))
    check_method: CheckMethod = CheckMethod.tcp
    http_method: HttpMethod = HttpMethod.GET
    http_path: str = Field(default="/", max_length=500)
    expected_status: int = Field(default=200, ge=100, le=599)
    check_interval_seconds: int = Field(default=60, ge=10, le=86400)
    note: str | None = Field(default=None, max_length=1000)

    @field_validator("ports")
    @classmethod
    def validate_ports(cls, ports: list[int]) -> list[int]:
        if len(ports) > 20:
            raise ValueError("Можно указать не более 20 портов")
        if any(port < 1 or port > 65535 for port in ports):
            raise ValueError("Порт должен быть от 1 до 65535")
        return sorted(set(ports))


class MonitoredServiceCreate(MonitoredServiceBase):
    agent_id: uuid.UUID | None = None


class MonitoredServiceUpdate(SQLModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    address: str | None = Field(default=None, min_length=1, max_length=255)
    ports: list[int] | None = None
    check_method: CheckMethod | None = None
    http_method: HttpMethod | None = None
    http_path: str | None = Field(default=None, max_length=500)
    expected_status: int | None = Field(default=None, ge=100, le=599)
    check_interval_seconds: int | None = Field(default=None, ge=10, le=86400)
    note: str | None = Field(default=None, max_length=1000)
    agent_id: uuid.UUID | None = None

    @field_validator("ports")
    @classmethod
    def validate_ports(cls, ports: list[int] | None) -> list[int] | None:
        if ports is None:
            return ports
        if len(ports) > 20:
            raise ValueError("Можно указать не более 20 портов")
        if any(port < 1 or port > 65535 for port in ports):
            raise ValueError("Порт должен быть от 1 до 65535")
        return sorted(set(ports))


class MonitoredService(MonitoredServiceBase, table=True):
    __tablename__ = "monitored_service"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    resource_group_id: uuid.UUID = Field(
        foreign_key="resource_group.id", nullable=False, ondelete="CASCADE"
    )
    agent_id: uuid.UUID | None = Field(
        default=None, foreign_key="monitoring_agent.id", ondelete="SET NULL"
    )
    resource_group: ResourceGroup | None = Relationship(back_populates="services")


class MonitoredServicePublic(MonitoredServiceBase):
    id: uuid.UUID
    resource_group_id: uuid.UUID
    created_at: datetime | None = None
    agent_id: uuid.UUID | None = None


class MonitoredServicesPublic(SQLModel):
    data: list[MonitoredServicePublic]
    count: int


# Агент сам подключается к серверу, поэтому его IP хранить не нужно.
class MonitoringAgentBase(SQLModel):
    name: str = Field(min_length=1, max_length=255)
    location: str | None = Field(default=None, max_length=255)


class MonitoringAgentCreate(MonitoringAgentBase):
    pass


class MonitoringAgentUpdate(SQLModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    location: str | None = Field(default=None, max_length=255)


class MonitoringAgent(MonitoringAgentBase, table=True):
    __tablename__ = "monitoring_agent"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    token: str = Field(unique=True, index=True, min_length=120, max_length=120)
    owner_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE"
    )
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    last_seen_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))  # type: ignore


class MonitoringAgentPublic(MonitoringAgentBase):
    id: uuid.UUID
    token: str
    owner_id: uuid.UUID
    created_at: datetime | None = None
    last_seen_at: datetime | None = None


class MonitoringAgentsPublic(SQLModel):
    data: list[MonitoringAgentPublic]
    count: int


# Задание получает только агент; оно не раскрывает данные других групп.
class AgentTask(SQLModel):
    id: uuid.UUID
    name: str
    address: str
    ports: list[int]
    check_method: CheckMethod
    http_method: HttpMethod
    http_path: str
    expected_status: int
    check_interval_seconds: int


class AgentTasksPublic(SQLModel):
    data: list[AgentTask]


class AgentReportCreate(SQLModel):
    service_id: uuid.UUID
    port: int | None = Field(default=None, ge=1, le=65535)
    status: CheckStatus
    latency_ms: int | None = Field(default=None, ge=0)
    detail: str | None = Field(default=None, max_length=1000)
    checked_at: datetime = Field(default_factory=get_datetime_utc)


class CheckReport(SQLModel, table=True):
    __tablename__ = "check_report"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    agent_id: uuid.UUID = Field(
        foreign_key="monitoring_agent.id", nullable=False, ondelete="CASCADE"
    )
    service_id: uuid.UUID = Field(
        foreign_key="monitored_service.id", nullable=False, ondelete="CASCADE"
    )
    port: int | None = None
    status: CheckStatus
    latency_ms: int | None = None
    detail: str | None = Field(default=None, max_length=1000)
    checked_at: datetime = Field(
        default_factory=get_datetime_utc, sa_type=DateTime(timezone=True)
    )  # type: ignore


class CheckReportPublic(SQLModel):
    id: uuid.UUID
    service_id: uuid.UUID
    port: int | None = None
    status: CheckStatus
    latency_ms: int | None = None
    detail: str | None = None
    checked_at: datetime


class CheckReportsPublic(SQLModel):
    data: list[CheckReportPublic]


# Generic message
class Message(SQLModel):
    message: str


# JSON payload containing access token
class Token(SQLModel):
    access_token: str
    token_type: str = "bearer"


# Contents of JWT token
class TokenPayload(SQLModel):
    sub: str | None = None


class NewPassword(SQLModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)
