-- Initialisation PostgreSQL pour SOC/NOC Platform
-- Créer la base de données NetBox (séparée de socnoc_db)

CREATE DATABASE netbox
    WITH OWNER = socnoc
    ENCODING = 'UTF8'
    LC_COLLATE = 'en_US.utf8'
    LC_CTYPE = 'en_US.utf8'
    TEMPLATE = template0;

GRANT ALL PRIVILEGES ON DATABASE netbox TO socnoc;

-- Extensions utiles pour socnoc_db
\c socnoc_db;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- Pour la recherche full-text
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Index pour les recherches fréquentes (créés après les tables par Alembic)
-- Les index sont définis dans les modèles SQLAlchemy
