"""site: convert DeviceSite enum to varchar(64)

Revision ID: 001
Revises:
Create Date: 2026-06-10
"""
from alembic import op
import sqlalchemy as sa

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # Cast existing enum values to text, then resize to varchar(64)
    op.execute(
        "ALTER TABLE devices ALTER COLUMN site TYPE VARCHAR(64) USING site::text"
    )
    # Drop the PostgreSQL enum type left behind (name varies by SQLAlchemy version)
    op.execute("DROP TYPE IF EXISTS devicesiteenum")
    op.execute("DROP TYPE IF EXISTS devicesit")


def downgrade():
    # Re-create the enum and convert back (only values that match)
    op.execute(
        "CREATE TYPE devicesiteenum AS ENUM ('primary', 'failover', 'both')"
    )
    op.execute(
        "ALTER TABLE devices ALTER COLUMN site TYPE devicesiteenum "
        "USING CASE WHEN site IN ('primary','failover','both') "
        "THEN site::devicesiteenum ELSE 'primary'::devicesiteenum END"
    )
