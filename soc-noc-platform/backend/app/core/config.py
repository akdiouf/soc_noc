from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import model_validator, computed_field
from typing import List, Optional


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        secrets_dir="/run/secrets",
        case_sensitive=True,
        extra="ignore",
    )

    # App
    APP_NAME: str = "SOC/NOC Platform"
    VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = False
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 8
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Secret key (from /run/secrets/secret_key or SECRET_KEY env var)
    SECRET_KEY: str = "change-me-in-production"

    # Database components → DATABASE_URL is built at startup
    DATABASE_URL: str = ""
    DATABASE_HOST: str = "localhost"
    DATABASE_PORT: int = 5432
    DATABASE_NAME: str = "socnoc_db"
    DATABASE_USER: str = "socnoc"
    POSTGRES_PASSWORD: str = ""
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 40

    # Redis components → REDIS_URL is built at startup
    REDIS_URL: str = ""
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0
    REDIS_PASSWORD: str = ""
    REDIS_CACHE_TTL: int = 300

    # InfluxDB
    INFLUXDB_URL: str = "http://localhost:8086"
    INFLUXDB_TOKEN: str = "my-super-secret-token"
    INFLUXDB_ORG: str = "socnoc"
    INFLUXDB_BUCKET: str = "metrics"
    INFLUXDB_BUCKET_ALERTS: str = "alerts"

    # Kafka
    KAFKA_BOOTSTRAP_SERVERS: str = "localhost:9092"
    KAFKA_TOPIC_METRICS: str = "noc.metrics"
    KAFKA_TOPIC_ALERTS: str = "noc.alerts"
    KAFKA_TOPIC_SYSLOG: str = "noc.syslog"
    KAFKA_TOPIC_NETFLOW: str = "noc.netflow"
    KAFKA_TOPIC_SECURITY: str = "soc.events"
    KAFKA_CONSUMER_GROUP: str = "socnoc-backend"

    # Elasticsearch
    ELASTICSEARCH_URL: str = "http://localhost:9200"
    ELASTICSEARCH_INDEX_LOGS: str = "soc-logs"
    ELASTICSEARCH_INDEX_ALERTS: str = "soc-alerts"
    ELASTICSEARCH_INDEX_EVENTS: str = "soc-events"

    # SNMP
    SNMP_COMMUNITY: str = "public"
    SNMP_VERSION: str = "v3"
    SNMP_POLL_INTERVAL: int = 60

    # Modbus
    MODBUS_TIMEOUT: int = 5
    MODBUS_RETRIES: int = 3
    MODBUS_POLL_INTERVAL: int = 30

    # BACnet
    BACNET_DEVICE_ID: int = 999
    BACNET_PORT: int = 47808
    BACNET_POLL_INTERVAL: int = 60

    # Syslog
    SYSLOG_UDP_PORT: int = 514
    SYSLOG_TCP_PORT: int = 601

    # NetFlow
    NETFLOW_PORT: int = 2055

    # Alerting
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: str = ""
    ALERT_EMAIL_FROM: str = "noc@datacenter.local"
    ALERT_EMAIL_TO: List[str] = []

    # Slack / Teams / PagerDuty
    SLACK_WEBHOOK_URL: Optional[str] = None
    TEAMS_WEBHOOK_URL: Optional[str] = None
    PAGERDUTY_API_KEY: Optional[str] = None
    PAGERDUTY_SERVICE_KEY: Optional[str] = None

    # TheHive
    THEHIVE_URL: str = "http://localhost:9000"
    THEHIVE_API_KEY: str = ""

    # Wazuh
    WAZUH_API_URL: str = "https://localhost:55000"
    WAZUH_API_USER: str = "wazuh"
    WAZUH_API_PASSWORD: str = ""

    # NetBox
    NETBOX_URL: str = "http://localhost:8080"
    NETBOX_TOKEN: str = ""

    # Failover
    FAILOVER_SITE_URL: Optional[str] = None
    FAILOVER_SITE_NAME: str = "Site de repli"
    PRIMARY_SITE_NAME: str = "Datacenter Principal"

    # Thresholds
    CPU_WARN_THRESHOLD: float = 80.0
    CPU_CRIT_THRESHOLD: float = 95.0
    MEMORY_WARN_THRESHOLD: float = 85.0
    MEMORY_CRIT_THRESHOLD: float = 95.0
    DISK_WARN_THRESHOLD: float = 80.0
    DISK_CRIT_THRESHOLD: float = 90.0
    TEMPERATURE_WARN_THRESHOLD: float = 30.0
    TEMPERATURE_CRIT_THRESHOLD: float = 40.0
    UPS_BATTERY_WARN_THRESHOLD: float = 30.0
    UPS_BATTERY_CRIT_THRESHOLD: float = 15.0
    INTERFACE_ERROR_THRESHOLD: float = 0.1

    # First superuser
    FIRST_SUPERUSER_USERNAME: str = "admin"
    FIRST_SUPERUSER_EMAIL: str = "admin@socnoc.local"
    FIRST_SUPERUSER_PASSWORD: str = "ChangeMe123!"
    FIRST_SUPERUSER_FULLNAME: str = "Administrateur SOC/NOC"

    # CORS
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost",
        "http://localhost:80",
        "http://localhost:3000",
        "http://localhost:3001",
    ]

    @model_validator(mode="after")
    def build_connection_urls(self) -> "Settings":
        if not self.DATABASE_URL:
            self.DATABASE_URL = (
                f"postgresql+asyncpg://{self.DATABASE_USER}:{self.POSTGRES_PASSWORD}"
                f"@{self.DATABASE_HOST}:{self.DATABASE_PORT}/{self.DATABASE_NAME}"
            )
        if not self.REDIS_URL:
            if self.REDIS_PASSWORD:
                self.REDIS_URL = (
                    f"redis://:{self.REDIS_PASSWORD}"
                    f"@{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"
                )
            else:
                self.REDIS_URL = (
                    f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"
                )
        return self


def get_settings() -> Settings:
    return Settings()


settings = get_settings()
