-- Создание таблиц для мессенджера

-- Таблица пользователей
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    username VARCHAR(100) UNIQUE,
    phone VARCHAR(20),
    avatar VARCHAR(10),
    status VARCHAR(100) DEFAULT 'был(-а) недавно',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица чатов
CREATE TABLE IF NOT EXISTS chats (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    is_group BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    avatar VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица участников чатов
CREATE TABLE IF NOT EXISTS chat_members (
    id SERIAL PRIMARY KEY,
    chat_id INTEGER REFERENCES chats(id),
    user_id INTEGER REFERENCES users(id),
    is_admin BOOLEAN DEFAULT FALSE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chat_id, user_id)
);

-- Таблица сообщений
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    chat_id INTEGER REFERENCES chats(id),
    user_id INTEGER REFERENCES users(id),
    text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для производительности
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_members_chat_id ON chat_members(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_members_user_id ON chat_members(user_id);

-- Вставка тестовых данных
INSERT INTO users (name, username, phone, avatar, status) VALUES
('Вы', 'you', '+7 900 000 00 00', 'ВЫ', 'в сети'),
('Мария Иванова', 'maria_i', '+7 901 111 11 11', 'МИ', 'в сети'),
('Петр Сидоров', 'petr_s', '+7 902 222 22 22', 'ПС', 'был 2 часа назад'),
('Анна Смирнова', 'anna_s', '+7 903 333 33 33', 'АС', 'в сети'),
('Иван Петров', 'ivan_p', '+7 904 444 44 44', 'ИП', 'был недавно');

INSERT INTO chats (name, is_group, avatar, is_archived) VALUES
('Команда разработки', true, 'КР', false),
('Мария Иванова', false, 'МИ', false),
('Дизайн проекта', true, 'ДП', false),
('Петр Сидоров', false, 'ПС', false),
('Архивный чат', false, 'АЧ', true);

INSERT INTO chat_members (chat_id, user_id, is_admin) VALUES
(1, 1, true),
(1, 2, false),
(1, 3, false),
(2, 1, false),
(2, 2, false),
(3, 1, true),
(3, 4, false),
(4, 1, false),
(4, 3, false),
(5, 1, false);

INSERT INTO messages (chat_id, user_id, text) VALUES
(1, 2, 'Привет! Как дела?'),
(1, 1, 'Отлично! Работаю над новым проектом'),
(1, 2, 'Звучит интересно! Расскажешь подробнее?'),
(1, 1, 'Конечно! Встреча в 15:00'),
(2, 2, 'Отправила файлы'),
(3, 4, 'Новые макеты готовы'),
(4, 3, 'Созвонимся завтра?'),
(5, 1, 'Старое сообщение');