import json
import os
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime

def handler(event: dict, context) -> dict:
    '''API для работы с мессенджером: чаты, сообщения, контакты'''
    
    method = event.get('httpMethod', 'GET')
    
    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            },
            'body': '',
            'isBase64Encoded': False
        }
    
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    
    try:
        if method == 'GET':
            path = event.get('queryStringParameters', {}).get('action', 'chats')
            
            if path == 'chats':
                return get_chats(conn)
            elif path == 'messages':
                chat_id = event.get('queryStringParameters', {}).get('chat_id')
                return get_messages(conn, chat_id)
            elif path == 'contacts':
                return get_contacts(conn)
        
        elif method == 'POST':
            body = json.loads(event.get('body', '{}'))
            action = body.get('action')
            
            if action == 'send_message':
                return send_message(conn, body)
            elif action == 'create_group':
                return create_group(conn, body)
            elif action == 'archive_chat':
                return archive_chat(conn, body)
            elif action == 'edit_message':
                return edit_message(conn, body)
            elif action == 'delete_message':
                return delete_message(conn, body)
            elif action == 'add_reaction':
                return add_reaction(conn, body)
            elif action == 'remove_reaction':
                return remove_reaction(conn, body)
            elif action == 'set_typing':
                return set_typing(conn, body)
            elif action == 'get_typing':
                chat_id = body.get('chat_id')
                return get_typing(conn, chat_id)
        
        return {
            'statusCode': 400,
            'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': 'Invalid request'}),
            'isBase64Encoded': False
        }
    
    finally:
        conn.close()

def get_chats(conn):
    '''Получить список всех чатов пользователя'''
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    cursor.execute('''
        SELECT 
            c.id,
            c.name,
            c.avatar,
            c.is_group,
            c.is_archived,
            m.text as last_message,
            TO_CHAR(m.created_at, 'HH24:MI') as time,
            COALESCE(unread.count, 0) as unread
        FROM chats c
        LEFT JOIN LATERAL (
            SELECT text, created_at
            FROM messages
            WHERE chat_id = c.id
            ORDER BY created_at DESC
            LIMIT 1
        ) m ON true
        LEFT JOIN LATERAL (
            SELECT COUNT(*) as count
            FROM messages
            WHERE chat_id = c.id AND user_id != 1
        ) unread ON true
        WHERE c.id IN (SELECT chat_id FROM chat_members WHERE user_id = 1)
        ORDER BY m.created_at DESC NULLS LAST
    ''')
    
    chats = cursor.fetchall()
    
    for chat in chats:
        if chat['unread'] > 3:
            chat['unread'] = 3
    
    cursor.close()
    
    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({'chats': chats}, default=str),
        'isBase64Encoded': False
    }

def get_messages(conn, chat_id):
    '''Получить историю сообщений чата'''
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    cursor.execute('''
        SELECT 
            m.id,
            m.text,
            TO_CHAR(m.created_at, 'HH24:MI') as time,
            m.user_id,
            m.is_removed,
            m.edited_at,
            CASE WHEN m.user_id = 1 THEN true ELSE false END as is_mine,
            COALESCE(
                json_agg(
                    json_build_object('emoji', mr.emoji, 'user_id', mr.user_id)
                ) FILTER (WHERE mr.id IS NOT NULL), '[]'
            ) as reactions
        FROM messages m
        LEFT JOIN message_reactions mr ON m.id = mr.message_id
        WHERE m.chat_id = %s
        GROUP BY m.id
        ORDER BY m.created_at ASC
    ''', (chat_id,))
    
    messages = cursor.fetchall()
    cursor.close()
    
    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({'messages': messages}),
        'isBase64Encoded': False
    }

def get_contacts(conn):
    '''Получить список контактов'''
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    cursor.execute('''
        SELECT id, name, avatar, status
        FROM users
        WHERE id != 1
        ORDER BY name
    ''')
    
    contacts = cursor.fetchall()
    cursor.close()
    
    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({'contacts': contacts}),
        'isBase64Encoded': False
    }

def send_message(conn, body):
    '''Отправить сообщение в чат'''
    chat_id = body.get('chat_id')
    text = body.get('text')
    user_id = body.get('user_id', 1)
    
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    cursor.execute('''
        INSERT INTO messages (chat_id, user_id, text)
        VALUES (%s, %s, %s)
        RETURNING id, text, TO_CHAR(created_at, 'HH24:MI') as time, 
                  CASE WHEN user_id = 1 THEN true ELSE false END as is_mine,
                  is_removed, edited_at
    ''', (chat_id, user_id, text))
    
    message = cursor.fetchone()
    message['reactions'] = []
    
    cursor.execute('''
        UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = %s
    ''', (chat_id,))
    
    conn.commit()
    cursor.close()
    
    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({'message': message}),
        'isBase64Encoded': False
    }

def create_group(conn, body):
    '''Создать групповой чат'''
    name = body.get('name')
    member_ids = body.get('member_ids', [])
    admin_ids = body.get('admin_ids', [])
    
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    cursor.execute('''
        INSERT INTO chats (name, is_group, avatar)
        VALUES (%s, true, %s)
        RETURNING id
    ''', (name, name[:2].upper()))
    
    chat_id = cursor.fetchone()['id']
    
    cursor.execute('''
        INSERT INTO chat_members (chat_id, user_id, is_admin)
        VALUES (%s, 1, true)
    ''', (chat_id,))
    
    for member_id in member_ids:
        is_admin = member_id in admin_ids
        cursor.execute('''
            INSERT INTO chat_members (chat_id, user_id, is_admin)
            VALUES (%s, %s, %s)
        ''', (chat_id, member_id, is_admin))
    
    conn.commit()
    cursor.close()
    
    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({'chat_id': chat_id, 'success': True}),
        'isBase64Encoded': False
    }

def archive_chat(conn, body):
    '''Архивировать/разархивировать чат'''
    chat_id = body.get('chat_id')
    is_archived = body.get('is_archived', True)
    
    cursor = conn.cursor()
    
    cursor.execute('''
        UPDATE chats SET is_archived = %s WHERE id = %s
    ''', (is_archived, chat_id))
    
    conn.commit()
    cursor.close()
    
    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({'success': True}),
        'isBase64Encoded': False
    }

def edit_message(conn, body):
    '''Редактировать сообщение'''
    message_id = body.get('message_id')
    new_text = body.get('text')
    
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    cursor.execute('''
        UPDATE messages 
        SET text = %s, edited_at = CURRENT_TIMESTAMP 
        WHERE id = %s AND user_id = 1
        RETURNING id, text, edited_at
    ''', (new_text, message_id))
    
    result = cursor.fetchone()
    conn.commit()
    cursor.close()
    
    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({'success': True, 'message': result}, default=str),
        'isBase64Encoded': False
    }

def delete_message(conn, body):
    '''Удалить сообщение (мягкое удаление)'''
    message_id = body.get('message_id')
    
    cursor = conn.cursor()
    
    cursor.execute('''
        UPDATE messages 
        SET is_removed = true, text = 'Сообщение удалено'
        WHERE id = %s AND user_id = 1
    ''', (message_id,))
    
    conn.commit()
    cursor.close()
    
    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({'success': True}),
        'isBase64Encoded': False
    }

def add_reaction(conn, body):
    '''Добавить реакцию на сообщение'''
    message_id = body.get('message_id')
    emoji = body.get('emoji')
    user_id = body.get('user_id', 1)
    
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT INTO message_reactions (message_id, user_id, emoji)
        VALUES (%s, %s, %s)
        ON CONFLICT (message_id, user_id, emoji) DO NOTHING
    ''', (message_id, user_id, emoji))
    
    conn.commit()
    cursor.close()
    
    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({'success': True}),
        'isBase64Encoded': False
    }

def remove_reaction(conn, body):
    '''Убрать реакцию с сообщения'''
    message_id = body.get('message_id')
    emoji = body.get('emoji')
    user_id = body.get('user_id', 1)
    
    cursor = conn.cursor()
    
    cursor.execute('''
        UPDATE message_reactions 
        SET emoji = NULL 
        WHERE message_id = %s AND user_id = %s AND emoji = %s
    ''', (message_id, user_id, emoji))
    
    conn.commit()
    cursor.close()
    
    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({'success': True}),
        'isBase64Encoded': False
    }

def set_typing(conn, body):
    '''Установить статус "печатает"'''
    chat_id = body.get('chat_id')
    user_id = body.get('user_id', 1)
    
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT INTO typing_status (chat_id, user_id, updated_at)
        VALUES (%s, %s, CURRENT_TIMESTAMP)
        ON CONFLICT (chat_id, user_id) 
        DO UPDATE SET updated_at = CURRENT_TIMESTAMP
    ''', (chat_id, user_id))
    
    conn.commit()
    cursor.close()
    
    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({'success': True}),
        'isBase64Encoded': False
    }

def get_typing(conn, chat_id):
    '''Получить список печатающих пользователей'''
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    cursor.execute('''
        SELECT u.name
        FROM typing_status ts
        JOIN users u ON ts.user_id = u.id
        WHERE ts.chat_id = %s 
        AND ts.user_id != 1
        AND ts.updated_at > CURRENT_TIMESTAMP - INTERVAL ''5 seconds''
    ''', (chat_id,))
    
    users = cursor.fetchall()
    cursor.close()
    
    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({'typing': [u['name'] for u in users]}),
        'isBase64Encoded': False
    }