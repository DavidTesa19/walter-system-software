import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import './TeamChatView.css';

interface ChatRoom {
  id: string | number;
  name: string;
  description?: string;
  created_by?: string;
  createdBy?: string;
  members?: string[];
  lastActivity?: string;
  last_activity?: string;
  created_at?: string;
  createdAt?: string;
  unreadCount?: number;
}

interface ChatMessage {
  id: string | number;
  roomId?: string | number;
  room_id?: string | number;
  content: string;
  username: string;
  userId?: number;
  user_id?: number;
  createdAt?: string;
  created_at?: string;
  reactions?: Record<string, number[]>;
  replyToMessageId?: string | number | null;
  reply_to_message_id?: string | number | null;
}

interface TeamUser {
  id: number;
  username: string;
  role: string;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3004';
const EMOJI_LIST = [
  '😀','😃','😄','😁','😆','🥹','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','😘','😗','😙','😚','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','🥱','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','😎','🤓','🫠','🥳','🥸','😺','😸','😹','😻','😼','😽','🙀','😿','😾','👍','👎','👏','🙌','👐','🤲','🤝','🙏','✍️','💪','🦾','🫶','🤌','🤏','✌️','🤞','🤟','🤘','👌','👈','👉','👆','👇','☝️','✊','👊','🤛','🤜','🤚','✋','🖐️','🖖','🤙','🫳','🫴','👋'
];

export default function TeamChatView() {
  const { user } = useAuth();
  const token = user?.token;
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [showNewRoomModal, setShowNewRoomModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDescription, setNewRoomDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [activeReactionPicker, setActiveReactionPicker] = useState<string | number | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const prevMessageCountRef = useRef<number>(0);

  // Mark room as read when selecting
  const markRoomAsRead = useCallback((roomId: string | number) => {
    const key = `teamchat_lastread_${user?.id}`;
    const stored = localStorage.getItem(key);
    const timestamps = stored ? JSON.parse(stored) : {};
    timestamps[roomId] = new Date().toISOString();
    localStorage.setItem(key, JSON.stringify(timestamps));
  }, [user?.id]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Fetch all chat rooms with unread counts
  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/chat-rooms?includeUnread=true&userId=${user?.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch rooms');
      const data: ChatRoom[] = await res.json();
      
      // Sort by last activity (newest first)
      const sortedRooms = data.sort((a, b) => {
        const aTime = a.lastActivity || a.last_activity || a.createdAt || a.created_at || '';
        const bTime = b.lastActivity || b.last_activity || b.createdAt || b.created_at || '';
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });
      
      setRooms(sortedRooms);
    } catch (err) {
      console.error('Error fetching rooms:', err);
    }
  }, [token, user?.id]);

  // Fetch messages for selected room
  const fetchMessages = useCallback(async () => {
    if (!selectedRoom) return;
    try {
      const res = await fetch(`${API_BASE}/api/chat-rooms/${selectedRoom.id}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch messages');
      const data = await res.json();
      setMessages(data);
    } catch (err) {
      console.error('Error fetching messages:', err);
    }
  }, [selectedRoom, token]);

  // Fetch team users
  const fetchTeamUsers = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/team-users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch users');
      const data = await res.json();
      setTeamUsers(data);
    } catch (err) {
      console.error('Error fetching team users:', err);
    }
  }, [token]);

  // Initial data fetch
  useEffect(() => {
    fetchRooms();
    fetchTeamUsers();
  }, [fetchRooms, fetchTeamUsers]);

  // Fetch messages when room changes and mark as read
  useEffect(() => {
    if (selectedRoom) {
      prevMessageCountRef.current = 0; // Reset count for new room
      setShouldScrollToBottom(true); // Scroll to bottom when switching rooms
      fetchMessages();
      markRoomAsRead(selectedRoom.id);
      // Clear unread count for selected room
      setRooms(prev => prev.map(r => 
        r.id === selectedRoom.id ? { ...r, unreadCount: 0 } : r
      ));
    }
  }, [selectedRoom, fetchMessages, markRoomAsRead]);

  useEffect(() => {
    setActiveReactionPicker(null);
    setShowEmojiPicker(false);
  }, [selectedRoom]);

  // Poll for new messages and room updates every 3 seconds
  useEffect(() => {
    const pollInterval = window.setInterval(() => {
      fetchRooms(); // Update unread counts
      if (selectedRoom) {
        fetchMessages();
      }
    }, 3000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [selectedRoom, fetchMessages, fetchRooms]);

  // Scroll to bottom only when new messages arrive or explicitly requested
  useEffect(() => {
    const currentCount = messages.length;
    const prevCount = prevMessageCountRef.current;
    
    // Scroll if: explicitly requested, or new messages arrived (not initial load during polling)
    if (shouldScrollToBottom || (currentCount > prevCount && prevCount > 0)) {
      scrollToBottom();
      setShouldScrollToBottom(false);
    }
    
    prevMessageCountRef.current = currentCount;
  }, [messages, shouldScrollToBottom]);

  // Create a new room
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/chat-rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newRoomName.trim(),
          description: newRoomDescription.trim()
        })
      });

      if (!res.ok) throw new Error('Failed to create room');

      const newRoom = await res.json();
      // Add new room at the top (it's the most recent)
      setRooms(prev => [newRoom, ...prev]);
      setSelectedRoom(newRoom);
      setShowNewRoomModal(false);
      setNewRoomName('');
      setNewRoomDescription('');
    } catch (err) {
      setError('Nepodařilo se vytvořit místnost');
      console.error('Error creating room:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInsertEmoji = (emoji: string) => {
    const textarea = messageInputRef.current;
    setNewMessage(prev => {
      const start = textarea?.selectionStart ?? prev.length;
      const end = textarea?.selectionEnd ?? prev.length;
      const nextValue = `${prev.slice(0, start)}${emoji}${prev.slice(end)}`;

      window.setTimeout(() => {
        if (textarea) {
          const cursor = start + emoji.length;
          textarea.focus();
          textarea.setSelectionRange(cursor, cursor);
        }
      }, 0);

      return nextValue;
    });
    setShowEmojiPicker(false);
  };

  // Send a message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedRoom) return;

    const messageContent = newMessage.trim();
    setNewMessage('');
    setShowEmojiPicker(false);
    const replyToMessageId = replyingTo?.id ?? null;
    setReplyingTo(null);

    try {
      const res = await fetch(`${API_BASE}/api/chat-rooms/${selectedRoom.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ content: messageContent, replyToMessageId })
      });

      if (!res.ok) throw new Error('Failed to send message');

      const sentMessage = await res.json();
      setMessages(prev => [...prev, sentMessage]);
      setShouldScrollToBottom(true); // Scroll after sending message
      
      // Update room order immediately (move current room to top)
      setRooms(prev => {
        const updatedRooms = prev.map(r => 
          r.id === selectedRoom.id 
            ? { ...r, lastActivity: new Date().toISOString(), last_activity: new Date().toISOString() }
            : r
        );
        return updatedRooms.sort((a, b) => {
          const aTime = a.lastActivity || a.last_activity || a.createdAt || a.created_at || '';
          const bTime = b.lastActivity || b.last_activity || b.createdAt || b.created_at || '';
          return new Date(bTime).getTime() - new Date(aTime).getTime();
        });
      });
    } catch (err) {
      console.error('Error sending message:', err);
      setNewMessage(messageContent); // Restore message on error
    }
  };

  const handleToggleReaction = async (messageId: string | number, emoji: string) => {
    if (!selectedRoom) return;
    try {
      const res = await fetch(`${API_BASE}/api/chat-rooms/${selectedRoom.id}/messages/${messageId}/reactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ emoji })
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to update reaction (${res.status}): ${text || res.statusText}`);
      }
      const updatedMessage = await res.json();
      setMessages(prev => prev.map(m => {
        if (String(m.id) !== String(messageId)) return m;
        return {
          ...m,
          ...updatedMessage,
          reactions: updatedMessage.reactions || m.reactions || {}
        };
      }));
    } catch (err) {
      console.error('Error toggling reaction:', err);
    }
  };

  const handleStartReply = (message: ChatMessage) => {
    setReplyingTo(message);
    setShowEmojiPicker(false);
    messageInputRef.current?.focus();
  };

  const handleCancelReply = () => {
    setReplyingTo(null);
  };

  const handleScrollToMessage = (messageId: string | number) => {
    const target = messageRefs.current[String(messageId)];
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('message--highlight');
      window.setTimeout(() => {
        target.classList.remove('message--highlight');
      }, 1500);
    }
  };

  // Delete a room
  const handleDeleteRoom = async (roomId: string | number) => {
    if (!confirm('Opravdu chcete smazat tuto místnost? Všechny zprávy budou ztraceny.')) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/chat-rooms/${roomId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Failed to delete room');

      setRooms(prev => prev.filter(r => r.id !== roomId));
      if (selectedRoom?.id === roomId) {
        setSelectedRoom(null);
        setMessages([]);
      }
    } catch (err) {
      console.error('Error deleting room:', err);
    }
  };

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Dnes';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Včera';
    }
    return date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' });
  };

  const getCreator = (room: ChatRoom) => room.created_by || room.createdBy || 'Unknown';
  const getMessageTime = (msg: ChatMessage) => msg.created_at || msg.createdAt;

  const canDeleteRoom = (room: ChatRoom) => {
    return user?.role === 'admin' || getCreator(room) === user?.username;
  };

  return (
    <div className="team-chat-view">
      {/* Rooms Sidebar */}
      <aside className="team-chat-sidebar">
        <div className="team-chat-sidebar-header">
          <h2>💬 Týmový Chat</h2>
          <button
            className="new-room-btn"
            onClick={() => setShowNewRoomModal(true)}
            title="Vytvořit místnost"
          >
            +
          </button>
        </div>

        <div className="team-chat-rooms">
          {rooms.length === 0 ? (
            <div className="no-rooms">
              <p>Žádné místnosti</p>
              <button onClick={() => setShowNewRoomModal(true)}>
                Vytvořit první místnost
              </button>
            </div>
          ) : (
            rooms.map(room => (
              <div
                key={room.id}
                className={`room-item ${selectedRoom?.id === room.id ? 'active' : ''} ${room.unreadCount && room.unreadCount > 0 ? 'has-unread' : ''}`}
                onClick={() => setSelectedRoom(room)}
              >
                <div className="room-info">
                  <span className="room-name"># {room.name}</span>
                  {room.description && (
                    <span className="room-description">{room.description}</span>
                  )}
                </div>
                <div className="room-actions">
                  {room.unreadCount && room.unreadCount > 0 && selectedRoom?.id !== room.id && (
                    <span className="unread-badge">{room.unreadCount > 99 ? '99+' : room.unreadCount}</span>
                  )}
                  {canDeleteRoom(room) && (
                    <button
                      className="delete-room-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteRoom(room.id);
                      }}
                      title="Smazat místnost"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="team-users-section">
          <h3>👥 Členové týmu ({teamUsers.length})</h3>
          <div className="team-users-list">
            {teamUsers.map(u => (
              <div key={u.id} className={`team-user ${u.username === user?.username ? 'current' : ''}`}>
                <span className="user-avatar">
                  {u.username.charAt(0).toUpperCase()}
                </span>
                <span className="user-name">
                  {u.username}
                  {u.username === user?.username && ' (vy)'}
                </span>
                {u.role === 'admin' && <span className="user-badge">Admin</span>}
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Chat Area */}
      <main className="team-chat-main">
        {selectedRoom ? (
          <>
            <header className="team-chat-header">
              <div className="room-title">
                <h1># {selectedRoom.name}</h1>
                {selectedRoom.description && (
                  <p className="room-desc">{selectedRoom.description}</p>
                )}
              </div>
              <span className="room-creator">
                Vytvořil: {getCreator(selectedRoom)}
              </span>
            </header>

            <div className="team-chat-messages">
              {messages.length === 0 ? (
                <div className="no-messages">
                  <p>Zatím žádné zprávy</p>
                  <p>Buďte první, kdo napíše!</p>
                </div>
              ) : (
                <>
                  {messages.map((msg, idx) => {
                    const isOwn = msg.username === user?.username;
                    const showDateHeader = idx === 0 || 
                      formatDate(getMessageTime(msg)) !== formatDate(getMessageTime(messages[idx - 1]));
                    const reactions = msg.reactions || {};
                    const reactionEntries = Object.entries(reactions);
                    const replyToId = msg.replyToMessageId ?? msg.reply_to_message_id ?? null;
                    const replyTarget = replyToId ? messages.find(m => String(m.id) === String(replyToId)) : undefined;
                    
                    return (
                      <div key={msg.id} ref={(el) => { if (el) messageRefs.current[String(msg.id)] = el; }}>
                        {showDateHeader && (
                          <div className="date-divider">
                            <span>{formatDate(getMessageTime(msg))}</span>
                          </div>
                        )}
                        <div className={`message ${isOwn ? 'own' : ''}`}>
                          {!isOwn && (
                            <div className="message-avatar">
                              {msg.username.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="message-bubble">
                            {!isOwn && (
                              <span className="message-author">{msg.username}</span>
                            )}
                            {replyTarget && (
                              <button
                                type="button"
                                className="message-reply-preview"
                                onClick={() => replyToId && handleScrollToMessage(replyToId)}
                                title="Zobrazit odpovězenou zprávu"
                              >
                                <span className="reply-preview-author">{replyTarget.username}</span>
                                <span className="reply-preview-text">{replyTarget.content.slice(0, 120)}{replyTarget.content.length > 120 ? '…' : ''}</span>
                              </button>
                            )}
                            <p className="message-content">{msg.content}</p>
                            <div className="message-reactions">
                              {reactionEntries.map(([emoji, userIds]) => {
                                const reacted = userIds.includes(user?.id ?? -1);
                                return (
                                  <button
                                    key={`${msg.id}-${emoji}`}
                                    type="button"
                                    className={`reaction-chip ${reacted ? 'active' : ''}`}
                                    onClick={() => handleToggleReaction(msg.id, emoji)}
                                    title={reacted ? 'Odebrat reakci' : 'Přidat reakci'}
                                  >
                                    <span className="reaction-emoji">{emoji}</span>
                                    <span className="reaction-count">{userIds.length}</span>
                                  </button>
                                );
                              })}
                              <div className="reaction-add">
                                <button
                                  type="button"
                                  className="reaction-chip add"
                                  onClick={() => setActiveReactionPicker(prev => prev === msg.id ? null : msg.id)}
                                  title="Přidat reakci"
                                >
                                  +
                                </button>
                                {activeReactionPicker === msg.id && (
                                  <div className="reaction-picker">
                                    {EMOJI_LIST.map((emoji, index) => (
                                      <button
                                        key={`${msg.id}-${emoji}-picker-${index}`}
                                        type="button"
                                        className="reaction-picker-item"
                                        onClick={() => {
                                          handleToggleReaction(msg.id, emoji);
                                          setActiveReactionPicker(null);
                                        }}
                                      >
                                        {emoji}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="message-meta">
                              <span className="message-time">
                                {formatTime(getMessageTime(msg))}
                              </span>
                              <div className="message-actions">
                                <button
                                  type="button"
                                  className="message-action-btn"
                                  onClick={() => handleStartReply(msg)}
                                  title="Odpovědět"
                                >
                                  ↩
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            <form className="team-chat-input" onSubmit={handleSendMessage}>
              {replyingTo && (
                <div className="replying-bar">
                  <div className="replying-info">
                    <span className="replying-label">Odpovídáte na</span>
                    <span className="replying-author">{replyingTo.username}</span>
                    <span className="replying-text">{replyingTo.content.slice(0, 120)}{replyingTo.content.length > 120 ? '…' : ''}</span>
                  </div>
                  <button type="button" className="replying-cancel" onClick={handleCancelReply} title="Zrušit odpověď">✕</button>
                </div>
              )}
              <div className="input-with-emoji">
                <textarea
                  ref={messageInputRef}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(e);
                    }
                  }}
                  placeholder={`Napište zprávu do #${selectedRoom.name}...`}
                  autoFocus
                  rows={1}
                />
                <div className="emoji-picker-wrapper">
                  <button
                    type="button"
                    className="emoji-btn"
                    onClick={() => setShowEmojiPicker(prev => !prev)}
                    title="Vložit emoji"
                  >
                    😊
                  </button>
                  {showEmojiPicker && (
                    <div className="emoji-picker-popover">
                      {EMOJI_LIST.map((emoji, index) => (
                        <button
                          key={`input-emoji-${emoji}-${index}`}
                          type="button"
                          className="emoji-picker-item"
                          onClick={() => handleInsertEmoji(emoji)}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <button type="submit" disabled={!newMessage.trim()}>
                Odeslat
              </button>
            </form>
          </>
        ) : (
          <div className="no-room-selected">
            <div className="empty-state">
              <span className="empty-icon">💬</span>
              <h2>Vyberte místnost</h2>
              <p>Vyberte místnost ze seznamu vlevo nebo vytvořte novou</p>
            </div>
          </div>
        )}
      </main>

      {/* New Room Modal */}
      {showNewRoomModal && (
        <div className="modal-overlay" onClick={() => setShowNewRoomModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Vytvořit novou místnost</h2>
            <form onSubmit={handleCreateRoom}>
              <div className="form-group">
                <label htmlFor="roomName">Název místnosti *</label>
                <input
                  id="roomName"
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="např. obecný, marketing, vývoj..."
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label htmlFor="roomDesc">Popis (volitelné)</label>
                <input
                  id="roomDesc"
                  type="text"
                  value={newRoomDescription}
                  onChange={(e) => setNewRoomDescription(e.target.value)}
                  placeholder="O čem je tato místnost..."
                />
              </div>
              {error && <p className="error-message">{error}</p>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => setShowNewRoomModal(false)}
                >
                  Zrušit
                </button>
                <button type="submit" className="create-btn" disabled={loading}>
                  {loading ? 'Vytváření...' : 'Vytvořit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
