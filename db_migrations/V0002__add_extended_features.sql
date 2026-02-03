ALTER TABLE messages ADD COLUMN is_removed BOOLEAN;
UPDATE messages SET is_removed = FALSE WHERE is_removed IS NULL;
ALTER TABLE messages ALTER COLUMN is_removed SET DEFAULT FALSE;

ALTER TABLE messages ADD COLUMN edited_at TIMESTAMP;
ALTER TABLE messages ADD COLUMN is_read BOOLEAN;
UPDATE messages SET is_read = FALSE WHERE is_read IS NULL;
ALTER TABLE messages ALTER COLUMN is_read SET DEFAULT FALSE;

CREATE TABLE message_reactions (
    id SERIAL PRIMARY KEY,
    message_id INTEGER REFERENCES messages(id),
    user_id INTEGER REFERENCES users(id),
    emoji VARCHAR(10) NOT NULL,
    created_at TIMESTAMP,
    UNIQUE(message_id, user_id, emoji)
);

ALTER TABLE message_reactions ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE typing_status (
    id SERIAL PRIMARY KEY,
    chat_id INTEGER REFERENCES chats(id),
    user_id INTEGER REFERENCES users(id),
    updated_at TIMESTAMP,
    UNIQUE(chat_id, user_id)
);

ALTER TABLE typing_status ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX idx_message_reactions_msg ON message_reactions(message_id);
CREATE INDEX idx_typing_status_chat ON typing_status(chat_id);

ALTER TABLE users ADD COLUMN last_seen TIMESTAMP;
UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE last_seen IS NULL;
ALTER TABLE users ALTER COLUMN last_seen SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE users ADD COLUMN is_online BOOLEAN;
UPDATE users SET is_online = FALSE WHERE is_online IS NULL;
ALTER TABLE users ALTER COLUMN is_online SET DEFAULT FALSE;