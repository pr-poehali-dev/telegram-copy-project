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
            CASE WHEN m.user_id = 1 THEN true ELSE false END as is_mine
        FROM messages m
        WHERE m.chat_id = %s
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
                  CASE WHEN user_id = 1 THEN true ELSE false END as is_mine
    ''', (chat_id, user_id, text))
    
    message = cursor.fetchone()
    
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
