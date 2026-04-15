BEGIN;

CREATE TABLE alembic_version (
    version_num VARCHAR(32) NOT NULL, 
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

-- Running upgrade  -> 001

CREATE TABLE users (
    id UUID NOT NULL, 
    email VARCHAR NOT NULL, 
    supabase_uid VARCHAR NOT NULL, 
    created_at TIMESTAMP WITHOUT TIME ZONE, 
    PRIMARY KEY (id), 
    UNIQUE (email), 
    UNIQUE (supabase_uid)
);

CREATE TABLE sessions (
    id UUID NOT NULL, 
    user_id UUID NOT NULL, 
    title VARCHAR, 
    created_at TIMESTAMP WITHOUT TIME ZONE, 
    PRIMARY KEY (id), 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_sessions_user_id ON sessions (user_id);

CREATE TABLE messages (
    id UUID NOT NULL, 
    session_id UUID NOT NULL, 
    role VARCHAR NOT NULL, 
    content TEXT NOT NULL, 
    created_at TIMESTAMP WITHOUT TIME ZONE, 
    PRIMARY KEY (id), 
    FOREIGN KEY(session_id) REFERENCES sessions (id) ON DELETE CASCADE
);

CREATE INDEX ix_messages_session_id ON messages (session_id);

CREATE TABLE solutions (
    id UUID NOT NULL, 
    message_id UUID NOT NULL, 
    latex_input TEXT NOT NULL, 
    steps TEXT[] NOT NULL, 
    final_answer TEXT NOT NULL, 
    created_at TIMESTAMP WITHOUT TIME ZONE, 
    PRIMARY KEY (id), 
    FOREIGN KEY(message_id) REFERENCES messages (id) ON DELETE CASCADE, 
    UNIQUE (message_id)
);

INSERT INTO alembic_version (version_num) VALUES ('001') RETURNING alembic_version.version_num;

COMMIT;

