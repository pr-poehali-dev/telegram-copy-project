import { useState, useEffect, useRef } from 'react';
import Icon from '@/components/ui/icon';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

type Reaction = {
  emoji: string;
  user_id: number;
};

type Message = {
  id: number;
  text: string;
  time: string;
  is_mine: boolean;
  is_removed?: boolean;
  edited_at?: string;
  reactions?: Reaction[];
};

type Chat = {
  id: number;
  name: string;
  last_message: string;
  time: string;
  unread: number;
  avatar: string;
  is_group?: boolean;
  is_archived?: boolean;
};

type Contact = {
  id: number;
  name: string;
  avatar: string;
  status: string;
};

const API_URL = 'https://functions.poehali.dev/ca69d9f0-0b40-41cb-bc47-3549a3af0389';

const EMOJI_LIST = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

const Index = () => {
  const [activeSection, setActiveSection] = useState<'chats' | 'contacts' | 'settings' | 'profile' | 'search' | 'archive'>('chats');
  const [activeChat, setActiveChat] = useState<number | null>(1);
  const [messageText, setMessageText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [chats, setChats] = useState<Chat[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);
  const [selectedAdmins, setSelectedAdmins] = useState<number[]>([]);
  const [groupName, setGroupName] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadChats();
    loadContacts();
  }, []);

  useEffect(() => {
    if (activeChat) {
      loadMessages(activeChat);
      const interval = setInterval(() => loadTypingStatus(activeChat), 3000);
      return () => clearInterval(interval);
    }
  }, [activeChat]);

  const loadChats = async () => {
    try {
      const response = await fetch(`${API_URL}?action=chats`);
      const data = await response.json();
      setChats(data.chats || []);
    } catch (error) {
      toast({ title: 'Ошибка', description: 'Не удалось загрузить чаты', variant: 'destructive' });
    }
  };

  const loadContacts = async () => {
    try {
      const response = await fetch(`${API_URL}?action=contacts`);
      const data = await response.json();
      setContacts(data.contacts || []);
    } catch (error) {
      toast({ title: 'Ошибка', description: 'Не удалось загрузить контакты', variant: 'destructive' });
    }
  };

  const loadMessages = async (chatId: number) => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}?action=messages&chat_id=${chatId}`);
      const data = await response.json();
      setMessages(data.messages || []);
    } catch (error) {
      toast({ title: 'Ошибка', description: 'Не удалось загрузить сообщения', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const loadTypingStatus = async (chatId: number) => {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_typing', chat_id: chatId })
      });
      const data = await response.json();
      setTypingUsers(data.typing || []);
    } catch (error) {
      console.error('Failed to load typing status');
    }
  };

  const handleTyping = async () => {
    if (!activeChat) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    try {
      await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_typing', chat_id: activeChat, user_id: 1 })
      });
    } catch (error) {
      console.error('Failed to set typing status');
    }

    typingTimeoutRef.current = setTimeout(() => {
      setTypingUsers([]);
    }, 5000);
  };

  const handleSendMessage = async () => {
    if (!messageText.trim() || !activeChat) return;

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_message',
          chat_id: activeChat,
          text: messageText,
          user_id: 1
        })
      });

      const data = await response.json();
      if (data.message) {
        setMessages([...messages, data.message]);
        setMessageText('');
        loadChats();
      }
    } catch (error) {
      toast({ title: 'Ошибка', description: 'Не удалось отправить сообщение', variant: 'destructive' });
    }
  };

  const handleEditMessage = async (messageId: number) => {
    if (!editingText.trim()) return;

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit_message',
          message_id: messageId,
          text: editingText
        })
      });

      const data = await response.json();
      if (data.success) {
        setMessages(messages.map(m => 
          m.id === messageId ? { ...m, text: editingText, edited_at: new Date().toISOString() } : m
        ));
        setEditingMessageId(null);
        setEditingText('');
        toast({ title: 'Успешно', description: 'Сообщение отредактировано' });
      }
    } catch (error) {
      toast({ title: 'Ошибка', description: 'Не удалось отредактировать сообщение', variant: 'destructive' });
    }
  };

  const handleDeleteMessage = async (messageId: number) => {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_message',
          message_id: messageId
        })
      });

      const data = await response.json();
      if (data.success) {
        setMessages(messages.map(m => 
          m.id === messageId ? { ...m, text: 'Сообщение удалено', is_removed: true } : m
        ));
        toast({ title: 'Успешно', description: 'Сообщение удалено' });
      }
    } catch (error) {
      toast({ title: 'Ошибка', description: 'Не удалось удалить сообщение', variant: 'destructive' });
    }
  };

  const handleAddReaction = async (messageId: number, emoji: string) => {
    try {
      await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_reaction',
          message_id: messageId,
          emoji,
          user_id: 1
        })
      });

      setMessages(messages.map(m => {
        if (m.id === messageId) {
          const reactions = m.reactions || [];
          const existingReaction = reactions.find(r => r.user_id === 1 && r.emoji === emoji);
          if (!existingReaction) {
            return { ...m, reactions: [...reactions, { emoji, user_id: 1 }] };
          }
        }
        return m;
      }));
    } catch (error) {
      toast({ title: 'Ошибка', description: 'Не удалось добавить реакцию', variant: 'destructive' });
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedMembers.length === 0) {
      toast({ title: 'Внимание', description: 'Укажите название и выберите участников', variant: 'destructive' });
      return;
    }

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_group',
          name: groupName,
          member_ids: selectedMembers,
          admin_ids: selectedAdmins
        })
      });

      const data = await response.json();
      if (data.success) {
        toast({ title: 'Успешно', description: 'Группа создана!' });
        setDialogOpen(false);
        setGroupName('');
        setSelectedMembers([]);
        setSelectedAdmins([]);
        loadChats();
      }
    } catch (error) {
      toast({ title: 'Ошибка', description: 'Не удалось создать группу', variant: 'destructive' });
    }
  };

  const filteredChats = chats.filter(chat => {
    if (activeSection === 'archive') return chat.is_archived;
    if (activeSection === 'search') return chat.name.toLowerCase().includes(searchQuery.toLowerCase());
    return !chat.is_archived;
  });

  const sidebarItems = [
    { id: 'chats', icon: 'MessageCircle', label: 'Чаты' },
    { id: 'contacts', icon: 'Users', label: 'Контакты' },
    { id: 'search', icon: 'Search', label: 'Поиск' },
    { id: 'archive', icon: 'Archive', label: 'Архив' },
    { id: 'settings', icon: 'Settings', label: 'Настройки' },
    { id: 'profile', icon: 'User', label: 'Профиль' },
  ];

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <div className="w-20 bg-sidebar border-r border-sidebar-border flex flex-col items-center py-4 space-y-4">
        <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center mb-4">
          <Icon name="Send" size={24} className="text-primary-foreground" />
        </div>
        
        {sidebarItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveSection(item.id as any)}
            className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
              activeSection === item.id
                ? 'bg-primary text-primary-foreground'
                : 'text-sidebar-foreground hover:bg-sidebar-accent'
            }`}
            title={item.label}
          >
            <Icon name={item.icon as any} size={22} />
          </button>
        ))}
      </div>

      <div className="w-80 bg-card border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <h2 className="text-xl font-semibold mb-3">
            {activeSection === 'chats' && 'Чаты'}
            {activeSection === 'contacts' && 'Контакты'}
            {activeSection === 'settings' && 'Настройки'}
            {activeSection === 'profile' && 'Профиль'}
            {activeSection === 'search' && 'Поиск'}
            {activeSection === 'archive' && 'Архив'}
          </h2>
          
          {(activeSection === 'chats' || activeSection === 'search') && (
            <div className="flex gap-2">
              <Input
                placeholder="Поиск чатов..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-secondary border-0"
              />
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="icon" variant="ghost">
                    <Icon name="Plus" size={20} />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Создать групповой чат</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <Label htmlFor="groupName">Название группы</Label>
                      <Input 
                        id="groupName" 
                        placeholder="Введите название..." 
                        className="mt-2"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Выберите участников</Label>
                      <div className="space-y-3 mt-3">
                        {contacts.map((contact) => (
                          <div key={contact.id} className="flex items-center space-x-3">
                            <Checkbox 
                              id={`contact-${contact.id}`}
                              checked={selectedMembers.includes(contact.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedMembers([...selectedMembers, contact.id]);
                                } else {
                                  setSelectedMembers(selectedMembers.filter(id => id !== contact.id));
                                  setSelectedAdmins(selectedAdmins.filter(id => id !== contact.id));
                                }
                              }}
                            />
                            <label
                              htmlFor={`contact-${contact.id}`}
                              className="flex items-center gap-3 flex-1 cursor-pointer"
                            >
                              <Avatar className="w-10 h-10">
                                <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                                  {contact.avatar}
                                </AvatarFallback>
                              </Avatar>
                              <span>{contact.name}</span>
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                    {selectedMembers.length > 0 && (
                      <div>
                        <Label>Назначить администраторов</Label>
                        <div className="space-y-3 mt-3">
                          {selectedMembers.map((memberId) => {
                            const contact = contacts.find(c => c.id === memberId);
                            if (!contact) return null;
                            return (
                              <div key={memberId} className="flex items-center space-x-3">
                                <Checkbox
                                  id={`admin-${memberId}`}
                                  checked={selectedAdmins.includes(memberId)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setSelectedAdmins([...selectedAdmins, memberId]);
                                    } else {
                                      setSelectedAdmins(selectedAdmins.filter(id => id !== memberId));
                                    }
                                  }}
                                />
                                <label htmlFor={`admin-${memberId}`} className="cursor-pointer">
                                  {contact.name}
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <Button className="w-full" onClick={handleCreateGroup}>Создать группу</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>

        <ScrollArea className="flex-1">
          {activeSection === 'chats' || activeSection === 'search' || activeSection === 'archive' ? (
            <div className="divide-y divide-border">
              {filteredChats.map((chat) => (
                <div
                  key={chat.id}
                  onClick={() => setActiveChat(chat.id)}
                  className={`p-4 cursor-pointer transition-colors ${
                    activeChat === chat.id ? 'bg-secondary' : 'hover:bg-secondary/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="w-12 h-12">
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {chat.avatar}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-medium flex items-center gap-2">
                          {chat.name}
                          {chat.is_group && <Icon name="Users" size={14} className="text-muted-foreground" />}
                        </h3>
                        <span className="text-xs text-muted-foreground">{chat.time}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground truncate">{chat.last_message}</p>
                        {chat.unread > 0 && (
                          <span className="ml-2 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                            {chat.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : activeSection === 'contacts' ? (
            <div className="divide-y divide-border">
              {contacts.map((contact) => (
                <div key={contact.id} className="p-4 hover:bg-secondary/50 cursor-pointer transition-colors">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-12 h-12">
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {contact.avatar}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-medium">{contact.name}</h3>
                      <p className="text-sm text-muted-foreground">{contact.status}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : activeSection === 'settings' ? (
            <div className="p-4 space-y-4">
              <div className="space-y-3">
                <h3 className="font-medium">Общие настройки</h3>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p className="hover:text-foreground cursor-pointer">Уведомления</p>
                  <p className="hover:text-foreground cursor-pointer">Конфиденциальность</p>
                  <p className="hover:text-foreground cursor-pointer">Данные и память</p>
                  <p className="hover:text-foreground cursor-pointer">Чаты</p>
                </div>
              </div>
              <div className="space-y-3">
                <h3 className="font-medium">Внешний вид</h3>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p className="hover:text-foreground cursor-pointer">Темная тема включена</p>
                  <p className="hover:text-foreground cursor-pointer">Размер шрифта</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4">
              <div className="flex flex-col items-center text-center space-y-4">
                <Avatar className="w-24 h-24">
                  <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                    ВЫ
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold text-lg">Ваше имя</h3>
                  <p className="text-sm text-muted-foreground">+7 900 000 00 00</p>
                  <p className="text-xs text-muted-foreground mt-1">@username</p>
                </div>
                <div className="w-full space-y-2 text-sm">
                  <div className="p-3 bg-secondary rounded-lg hover:bg-secondary/80 cursor-pointer">
                    Редактировать профиль
                  </div>
                  <div className="p-3 bg-secondary rounded-lg hover:bg-secondary/80 cursor-pointer">
                    Изменить фото
                  </div>
                </div>
              </div>
            </div>
          )}
        </ScrollArea>
      </div>

      <div className="flex-1 flex flex-col">
        {activeChat ? (
          <>
            <div className="h-16 bg-card border-b border-border px-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar className="w-10 h-10">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {chats.find(c => c.id === activeChat)?.avatar}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-medium">{chats.find(c => c.id === activeChat)?.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {typingUsers.length > 0 ? `${typingUsers[0]} печатает...` : 'был(-а) недавно'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="icon">
                  <Icon name="Phone" size={20} />
                </Button>
                <Button variant="ghost" size="icon">
                  <Icon name="Video" size={20} />
                </Button>
                <Button variant="ghost" size="icon">
                  <Icon name="MoreVertical" size={20} />
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1 p-6">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">Загрузка...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.is_mine ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className="flex flex-col">
                        <div
                          className={`max-w-md px-4 py-2 rounded-2xl relative group ${
                            message.is_mine
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-secondary text-secondary-foreground'
                          } ${message.is_removed ? 'opacity-50 italic' : ''}`}
                        >
                          {editingMessageId === message.id ? (
                            <div className="space-y-2">
                              <Input
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleEditMessage(message.id)}
                                className="bg-background text-foreground"
                              />
                              <div className="flex gap-2">
                                <Button size="sm" onClick={() => handleEditMessage(message.id)}>Сохранить</Button>
                                <Button size="sm" variant="ghost" onClick={() => setEditingMessageId(null)}>Отмена</Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="text-sm">{message.text}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs opacity-70">{message.time}</span>
                                {message.edited_at && <span className="text-xs opacity-70">изм.</span>}
                              </div>
                            </>
                          )}

                          {message.is_mine && !message.is_removed && editingMessageId !== message.id && (
                            <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="icon" variant="ghost" className="h-6 w-6">
                                    <Icon name="MoreVertical" size={14} />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                  <DropdownMenuItem onClick={() => {
                                    setEditingMessageId(message.id);
                                    setEditingText(message.text);
                                  }}>
                                    Редактировать
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleDeleteMessage(message.id)}>
                                    Удалить
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          )}
                        </div>

                        {!message.is_removed && (
                          <div className="flex items-center gap-2 mt-1">
                            {message.reactions && message.reactions.length > 0 && (
                              <div className="flex gap-1">
                                {Array.from(new Set(message.reactions.map(r => r.emoji))).map((emoji) => {
                                  const count = message.reactions!.filter(r => r.emoji === emoji).length;
                                  return (
                                    <span key={emoji} className="text-xs px-2 py-0.5 bg-secondary rounded-full">
                                      {emoji} {count > 1 && count}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                            
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="ghost" className="h-6 opacity-50 hover:opacity-100">
                                  <Icon name="Smile" size={14} />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                <div className="flex gap-1 p-2">
                                  {EMOJI_LIST.map(emoji => (
                                    <button
                                      key={emoji}
                                      onClick={() => handleAddReaction(message.id, emoji)}
                                      className="text-lg hover:scale-125 transition-transform"
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </div>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            <div className="p-4 bg-card border-t border-border">
              <div className="flex gap-2">
                <Button variant="ghost" size="icon">
                  <Icon name="Paperclip" size={20} />
                </Button>
                <Input
                  placeholder="Написать сообщение..."
                  value={messageText}
                  onChange={(e) => {
                    setMessageText(e.target.value);
                    handleTyping();
                  }}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  className="bg-secondary border-0"
                />
                <Button onClick={handleSendMessage} size="icon">
                  <Icon name="Send" size={20} />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center space-y-2">
              <Icon name="MessageCircle" size={64} className="mx-auto opacity-50" />
              <p className="text-lg">Выберите чат, чтобы начать общение</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
