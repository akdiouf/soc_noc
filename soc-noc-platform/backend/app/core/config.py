from pydantic_settings import BaseSettings
from typing import List, Optional
from functools import lru_cache


class Settings(BaseSettings):
    # App
    APP_NAME: str = "SOC/NOC Platform"
    VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = False
    SECRET_KEY: str = "change-me-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 8
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://socnoc:password@localhost:5432/socnoc_db"
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 40

    # InfluxDB (time-series metrics)
    INFLUXDB_URL: str = "http://localhost:8086"
    INFLUXDB_TOKEN: str = "my-super-secret-token"
    INFLUXDB_ORG: str = "socnoc"
    INFLUXDB_BUCKET: str = "metrics"
    INFLUXDB_BUCKET_ALERTS: str = "alerts"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_CACHE_TTL: int = 300

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
    SNMP_POLL_INTERVAL: int = 60  # seconds

    # Modbus (UPS, PDU, CRAC, groupes électrogènes)
    MODBUS_TIMEOUT: int = 5
    MODBUS_RETRIES: int = 3
    MODBUS_POLL_INTERVAL: int = 30

    # BACnet (HVAC, climatiseurs)
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
    SMTP_PASSWORD: Optional[str] = None
    ALERT_EMAIL_FROM: str = "noc@datacenter.local"
    ALERT_EMAIL_TO: List[str] = []

    # Slack
    SLACK_WEBHOOK_URL: Optional[str] = None

    # Teams
    TEAMS_WEBHOOK_URL: Optional[str] = None

    # PagerDuty
    PAGERDUTY_API_KEY: Optional[str] = None
    PAGERDUTY_SERVICE_KEY: Optional[str] = None

    # TheHive (incident response)
    THEHIVE_URL: str = "http://localhost:9000"
    THEHIVE_API_KEY: Optional[str] = None

    # Wazuh (SIEM)
    WAZUH_API_URL: str = "https://localhost:55000"
    WAZUH_API_USER: str = "wazuh"
    WAZUH_API_PASSWORD: Optional[str] = None

    # NetBox (CMDB)
    NETBOX_URL: str = "http://localhost:8080"
    NETBOX_TOKEN: Optional[str] = None

    # Failover site
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
    INTERFACE_ERROR_THRESHOLD: float = 0.1  # percent

    # CORS
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3001", "http://localhost:3000"]

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
