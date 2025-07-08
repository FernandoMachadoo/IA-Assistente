import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const App = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [messages, setMessages] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [notes, setNotes] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState('');
  const [codeToAnalyze, setCodeToAnalyze] = useState('');
  const [codeLanguage, setCodeLanguage] = useState('python');
  const [codeAnalysis, setCodeAnalysis] = useState('');
  const [codeTask, setCodeTask] = useState('analyze');
  const [codeDescription, setCodeDescription] = useState('');
  const [dashboardData, setDashboardData] = useState({});
  const [activities, setActivities] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState(null);
  const [isToggling, setIsToggling] = useState({});
  const [isDeleting, setIsDeleting] = useState({});
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginPassword, setLoginPassword] = useState('');
  const [activeHistoryTab, setActiveHistoryTab] = useState('all');
  const [expandedActivity, setExpandedActivity] = useState(null);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [noteForm, setNoteForm] = useState({
    title: '',
    content: '',
    category: 'general',
    tags: ''
  });
  const [reminderForm, setReminderForm] = useState({
    title: '',
    description: '',
    date: '',
    priority: 'medium'
  });

  const messagesEndRef = useRef(null);
  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

  useEffect(() => {
    initializeSpeechRecognition();
    loadDashboard();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (activeTab === 'notes') {
      loadNotes();
    } else if (activeTab === 'reminders') {
      loadReminders();
    }
  }, [activeTab]);

  const initializeSpeechRecognition = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'pt-BR';

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setCurrentMessage(transcript);
        setIsListening(false);
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      setRecognition(recognition);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadDashboard = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/dashboard`);
      const data = await response.json();
      setDashboardData(data);
      setActivities(data.activities || []);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    }
  };

  const loadNotes = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/notes`);
      const data = await response.json();
      setNotes(data);
    } catch (error) {
      console.error('Error loading notes:', error);
    }
  };

  const loadReminders = async () => {
    try {
      // Load all reminders, not just upcoming ones for better visibility
      const response = await fetch(`${BACKEND_URL}/api/reminders`);
      const data = await response.json();
      setReminders(data);
    } catch (error) {
      console.error('Error loading reminders:', error);
    }
  };

  const sendMessage = async (message = currentMessage) => {
    if (!message.trim()) return;

    setIsLoading(true);
    const userMessage = { text: message, sender: 'user', timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);

    try {
      const response = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message,
          session_id: sessionId,
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setSessionId(data.session_id);
        const aiMessage = { text: data.response, sender: 'ai', timestamp: new Date() };
        setMessages(prev => [...prev, aiMessage]);
        
        // Check if a note or reminder was created
        if (data.response.includes('✅ Nota criada') || data.response.includes('⏰ Lembrete criado')) {
          // Refresh immediately and show notification
          if (data.response.includes('✅ Nota criada')) {
            loadNotes(); // Refresh notes immediately
            setTimeout(() => {
              alert('✅ Nota criada! Veja na seção Notas.');
            }, 500);
          } 
          
          if (data.response.includes('⏰ Lembrete criado')) {
            loadReminders(); // Refresh reminders immediately
            setTimeout(() => {
              alert('⏰ Lembrete criado! Veja na seção Lembretes.');
            }, 500);
          }
          
          // Refresh dashboard
          setTimeout(() => {
            loadDashboard();
          }, 300);
        } else {
          // Always refresh dashboard for normal chats
          loadDashboard();
        }
      } else {
        throw new Error(data.detail || 'Error sending message');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = { text: 'Desculpe, ocorreu um erro. Tente novamente.', sender: 'ai', timestamp: new Date() };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setCurrentMessage('');
    }
  };

  const startListening = () => {
    if (recognition) {
      setIsListening(true);
      recognition.start();
    }
  };

  const stopListening = () => {
    if (recognition) {
      recognition.stop();
      setIsListening(false);
    }
  };

  const speakMessage = (text) => {
    if ('speechSynthesis' in window) {
      // Cancel any ongoing speech
      speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'pt-BR';
      utterance.rate = 1.3; // Faster speech
      utterance.pitch = 1.1; // Slightly higher pitch for more natural sound
      utterance.volume = 0.8;
      
      // Try to get a more natural voice
      const voices = speechSynthesis.getVoices();
      const brazilianVoice = voices.find(voice => 
        voice.lang.includes('pt-BR') || voice.lang.includes('pt')
      );
      if (brazilianVoice) {
        utterance.voice = brazilianVoice;
      }
      
      speechSynthesis.speak(utterance);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: searchQuery,
          type: 'general'
        }),
      });

      const data = await response.json();
      setSearchResults(data.results);
      loadDashboard(); // Refresh dashboard to show new activity
    } catch (error) {
      console.error('Error searching:', error);
      setSearchResults('Erro na pesquisa. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCodeAnalysis = async () => {
    if (codeTask === 'generate' || codeTask === 'create') {
      if (!codeDescription.trim()) {
        alert('Por favor, descreva o que você quer que seja criado.');
        return;
      }
    } else if (!codeToAnalyze.trim()) {
      alert('Por favor, cole o código para análise.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/code/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: codeToAnalyze,
          language: codeLanguage,
          task: codeTask,
          description: codeDescription
        }),
      });

      const data = await response.json();
      setCodeAnalysis(data.analysis);
      loadDashboard(); // Refresh dashboard to show new activity
    } catch (error) {
      console.error('Error analyzing code:', error);
      setCodeAnalysis('Erro na análise. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const saveNote = async () => {
    if (!noteForm.title.trim() || !noteForm.content.trim()) return;

    try {
      const response = await fetch(`${BACKEND_URL}/api/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: noteForm.title,
          content: noteForm.content,
          category: noteForm.category,
          tags: noteForm.tags.split(',').map(tag => tag.trim()).filter(Boolean)
        }),
      });

      if (response.ok) {
        setNoteForm({ title: '', content: '', category: 'general', tags: '' });
        loadNotes();
        loadDashboard(); // Refresh dashboard to show new activity
      }
    } catch (error) {
      console.error('Error saving note:', error);
    }
  };

  const saveReminder = async () => {
    if (!reminderForm.title.trim() || !reminderForm.date) return;

    try {
      const response = await fetch(`${BACKEND_URL}/api/reminders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: reminderForm.title,
          description: reminderForm.description,
          date: new Date(reminderForm.date).toISOString(),
          priority: reminderForm.priority
        }),
      });

      if (response.ok) {
        setReminderForm({ title: '', description: '', date: '', priority: 'medium' });
        loadReminders();
        loadDashboard(); // Refresh dashboard to show new activity
      }
    } catch (error) {
      console.error('Error saving reminder:', error);
    }
  };

  const toggleNoteComplete = async (noteId, completed) => {
    if (isToggling[noteId]) return; // Prevent multiple calls
    
    setIsToggling(prev => ({...prev, [noteId]: true}));
    
    try {
      const endpoint = completed ? 'uncomplete' : 'complete';
      const response = await fetch(`${BACKEND_URL}/api/notes/${noteId}/${endpoint}`, {
        method: 'PUT',
      });

      if (response.ok) {
        // Update local state immediately for better UX
        setNotes(prev => prev.map(note => 
          note.id === noteId ? {...note, completed: !completed} : note
        ));
        
        // Refresh data in background
        setTimeout(() => {
          loadNotes();
          loadDashboard();
        }, 100);
      } else {
        throw new Error('Falha ao atualizar nota');
      }
    } catch (error) {
      console.error('Error toggling note completion:', error);
      alert('Erro ao atualizar nota. Tente novamente.');
    } finally {
      setIsToggling(prev => ({...prev, [noteId]: false}));
    }
  };

  const toggleReminderComplete = async (reminderId, completed) => {
    if (isToggling[reminderId]) return; // Prevent multiple calls
    
    setIsToggling(prev => ({...prev, [reminderId]: true}));
    
    try {
      const endpoint = completed ? 'uncomplete' : 'complete';
      const response = await fetch(`${BACKEND_URL}/api/reminders/${reminderId}/${endpoint}`, {
        method: 'PUT',
      });

      if (response.ok) {
        // Update local state immediately for better UX
        setReminders(prev => prev.map(reminder => 
          reminder.id === reminderId ? {...reminder, completed: !completed} : reminder
        ));
        
        // Refresh data in background
        setTimeout(() => {
          loadReminders();
          loadDashboard();
        }, 100);
      } else {
        throw new Error('Falha ao atualizar lembrete');
      }
    } catch (error) {
      console.error('Error toggling reminder completion:', error);
      alert('Erro ao atualizar lembrete. Tente novamente.');
    } finally {
      setIsToggling(prev => ({...prev, [reminderId]: false}));
    }
  };

  const deleteItem = async (type, id) => {
    if (isDeleting[id]) return; // Prevent multiple calls
    
    if (!window.confirm('Tem certeza que deseja deletar este item?')) return;

    setIsDeleting(prev => ({...prev, [id]: true}));

    try {
      let endpoint = '';
      
      // Map type to correct endpoint
      switch(type) {
        case 'note':
          endpoint = 'notes';
          break;
        case 'reminder':
          endpoint = 'reminders';
          break;
        case 'chat':
          endpoint = 'chat';
          break;
        case 'search':
          endpoint = 'search';
          break;
        case 'code':
          endpoint = 'code';
          break;
        default:
          endpoint = type; // fallback to original type
      }

      console.log(`Deleting ${endpoint}/${id}`);
      
      const response = await fetch(`${BACKEND_URL}/api/${endpoint}/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        console.log('Delete successful');
        
        // Update local state immediately for better UX
        if (endpoint === 'notes') {
          setNotes(prev => prev.filter(note => note.id !== id));
        } else if (endpoint === 'reminders') {
          setReminders(prev => prev.filter(reminder => reminder.id !== id));
        }
        
        // Close modal immediately
        setShowActivityModal(false);
        
        // Refresh dashboard in background
        setTimeout(() => {
          loadDashboard();
        }, 100);
        
        // Show success message
        alert('Item deletado com sucesso!');
      } else {
        const errorData = await response.json();
        console.error('Delete failed:', errorData);
        throw new Error(errorData.detail || 'Erro desconhecido');
      }
    } catch (error) {
      console.error(`Error deleting ${type}:`, error);
      alert('Erro ao deletar item: ' + error.message);
    } finally {
      setIsDeleting(prev => ({...prev, [id]: false}));
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleActivityClick = (activity) => {
    setExpandedActivity(activity);
    setShowActivityModal(true);
  };

  const handleStatCardClick = (type) => {
    if (type === 'chats') {
      setActiveTab('chat');
    } else if (type === 'notes') {
      setActiveTab('notes');
    } else if (type === 'reminders') {
      setActiveTab('reminders');
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      return 'Hoje às ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 2) {
      return 'Ontem às ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays <= 7) {
      return diffDays + ' dias atrás';
    } else {
      return date.toLocaleDateString('pt-BR');
    }
  };

  const renderActivityModal = () => {
    if (!showActivityModal || !expandedActivity) return null;

    return (
      <div className="modal-overlay" onClick={() => setShowActivityModal(false)}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>{expandedActivity.icon} {expandedActivity.title}</h3>
            <div className="modal-actions">
              <button 
                onClick={() => deleteItem(expandedActivity.type, expandedActivity.id)} 
                className="delete-btn"
                disabled={isDeleting[expandedActivity.id]}
              >
                {isDeleting[expandedActivity.id] ? '⏳ Deletando...' : '🗑️ Deletar'}
              </button>
              <button onClick={() => setShowActivityModal(false)} className="close-btn">×</button>
            </div>
          </div>
          <div className="modal-body">
            <div className="activity-details">
              <p className="activity-timestamp">
                {formatTimestamp(expandedActivity.timestamp)}
              </p>
              
              {expandedActivity.type === 'chat' && (
                <div className="chat-details">
                  <div className="chat-message">
                    <strong>Sua pergunta:</strong>
                    <p>{expandedActivity.data.message}</p>
                  </div>
                  <div className="chat-response">
                    <strong>Resposta da IA:</strong>
                    <p>{expandedActivity.data.response}</p>
                  </div>
                </div>
              )}
              
              {expandedActivity.type === 'note' && (
                <div className="note-details">
                  <div className="note-content">
                    <strong>Conteúdo:</strong>
                    <p>{expandedActivity.data.content}</p>
                  </div>
                  <div className="note-meta">
                    <span className="category">Categoria: {expandedActivity.data.category}</span>
                    {expandedActivity.data.tags.length > 0 && (
                      <div className="tags">
                        <strong>Tags:</strong> {expandedActivity.data.tags.join(', ')}
                      </div>
                    )}
                    <div className="completion-status">
                      <label>
                        <input
                          type="checkbox"
                          checked={expandedActivity.data.completed}
                          onChange={() => toggleNoteComplete(expandedActivity.id, expandedActivity.data.completed)}
                        />
                        Concluído
                      </label>
                    </div>
                  </div>
                </div>
              )}
              
              {expandedActivity.type === 'reminder' && (
                <div className="reminder-details">
                  <div className="reminder-content">
                    <strong>Descrição:</strong>
                    <p>{expandedActivity.data.description}</p>
                  </div>
                  <div className="reminder-meta">
                    <span className="date">Data: {new Date(expandedActivity.data.date).toLocaleString('pt-BR')}</span>
                    <span className={`priority priority-${expandedActivity.data.priority}`}>
                      Prioridade: {expandedActivity.data.priority}
                    </span>
                    <div className="completion-status">
                      <label>
                        <input
                          type="checkbox"
                          checked={expandedActivity.data.completed}
                          onChange={() => toggleReminderComplete(expandedActivity.id, expandedActivity.data.completed)}
                        />
                        Concluído
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {expandedActivity.type === 'search' && (
                <div className="search-details">
                  <div className="search-query">
                    <strong>Consulta:</strong>
                    <p>{expandedActivity.data.query}</p>
                  </div>
                  <div className="search-results">
                    <strong>Resultados:</strong>
                    <pre>{expandedActivity.data.results}</pre>
                  </div>
                </div>
              )}

              {expandedActivity.type === 'code' && (
                <div className="code-details">
                  {expandedActivity.data.description && (
                    <div className="code-description">
                      <strong>Descrição:</strong>
                      <p>{expandedActivity.data.description}</p>
                    </div>
                  )}
                  {expandedActivity.data.code && (
                    <div className="code-original">
                      <strong>Código Original ({expandedActivity.data.language}):</strong>
                      <pre>{expandedActivity.data.code}</pre>
                    </div>
                  )}
                  <div className="code-analysis">
                    <strong>Análise/Resultado:</strong>
                    <pre>{expandedActivity.data.analysis}</pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderDashboard = () => (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h2>📊 Dashboard</h2>
        <button onClick={loadDashboard} className="refresh-btn">🔄</button>
      </div>
      
      <div className="dashboard-stats">
        <div className="stat-card" onClick={() => handleStatCardClick('chats')}>
          <h3>💬 Conversas (7 dias)</h3>
          <span className="stat-number">{dashboardData.recent_chats || 0}</span>
          <p className="stat-description">Clique para ver conversas</p>
        </div>
        <div className="stat-card" onClick={() => handleStatCardClick('notes')}>
          <h3>📝 Total de Notas</h3>
          <span className="stat-number">{dashboardData.total_notes || 0}</span>
          <p className="stat-description">Clique para gerenciar notas</p>
        </div>
        <div className="stat-card" onClick={() => handleStatCardClick('reminders')}>
          <h3>⏰ Lembretes Pendentes</h3>
          <span className="stat-number">{dashboardData.upcoming_reminders || 0}</span>
          <p className="stat-description">Clique para ver lembretes</p>
        </div>
      </div>
      
      <div className="dashboard-activities">
        <h3>📋 Histórico de Atividades</h3>
        <div className="activities-timeline">
          {activities.length > 0 ? (
            activities.map((activity, index) => (
              <div key={index} className="activity-item" onClick={() => handleActivityClick(activity)}>
                <div className="activity-icon">{activity.icon}</div>
                <div className="activity-content">
                  <h4>{activity.title}</h4>
                  <p>{activity.description}</p>
                  <span className="activity-time">{formatTimestamp(activity.timestamp)}</span>
                </div>
                <div className="activity-arrow">→</div>
              </div>
            ))
          ) : (
            <div className="no-activities">
              <p>Nenhuma atividade recente encontrada.</p>
            </div>
          )}
        </div>
      </div>
      
      <div className="dashboard-quick-actions">
        <h3>Ações Rápidas:</h3>
        <div className="quick-buttons">
          <button onClick={() => setActiveTab('chat')} className="quick-btn">
            💬 Nova Conversa
          </button>
          <button onClick={() => setActiveTab('notes')} className="quick-btn">
            📝 Criar Nota
          </button>
          <button onClick={() => setActiveTab('reminders')} className="quick-btn">
            📅 Novo Lembrete
          </button>
          <button onClick={() => setActiveTab('search')} className="quick-btn">
            🔍 Pesquisar
          </button>
        </div>
      </div>
    </div>
  );

  const renderChat = () => (
    <div className="chat-container">
      <div className="chat-header">
        <h2>💬 Assistente Pessoal Integrado</h2>
        <div className="voice-controls">
          <button
            onClick={isListening ? stopListening : startListening}
            className={`voice-btn ${isListening ? 'listening' : ''}`}
          >
            {isListening ? '🛑 Parar' : '🎤 Falar'}
          </button>
        </div>
      </div>

      <div className="chat-suggestions">
        <h4>💡 Experimente comandos como:</h4>
        <div className="suggestion-buttons">
          <button 
            onClick={() => setCurrentMessage('Crie uma nota sobre reunião de projeto')}
            className="suggestion-btn"
          >
            📝 Criar nota
          </button>
          <button 
            onClick={() => setCurrentMessage('Me lembre de ligar para o médico amanhã às 15h')}
            className="suggestion-btn"
          >
            ⏰ Criar lembrete
          </button>
          <button 
            onClick={() => setCurrentMessage('Anote que preciso comprar leite e pão')}
            className="suggestion-btn"
          >
            📋 Anotar tarefa
          </button>
          <button 
            onClick={() => setCurrentMessage('Lembre-me de fazer exercícios toda terça às 18h')}
            className="suggestion-btn"
          >
            🔄 Lembrete recorrente
          </button>
        </div>
      </div>
      
      <div className="messages-container">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.sender}`}>
            <div className="message-content">
              <p>{msg.text}</p>
              {msg.sender === 'ai' && (
                <button
                  onClick={() => speakMessage(msg.text)}
                  className="speak-btn"
                >
                  🔊
                </button>
              )}
            </div>
            <span className="message-time">
              {msg.timestamp.toLocaleTimeString()}
            </span>
          </div>
        ))}
        {isLoading && (
          <div className="message ai">
            <div className="message-content">
              <div className="loading-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="chat-input">
        <textarea
          value={currentMessage}
          onChange={(e) => setCurrentMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Digite sua mensagem, peça para criar notas/lembretes, ou use o microfone..."
          rows="2"
        />
        <button onClick={() => sendMessage()} disabled={isLoading}>
          {isLoading ? '⏳' : '📤'}
        </button>
      </div>
    </div>
  );

  const renderNotes = () => (
    <div className="notes-container">
      <div className="notes-header">
        <h2>📝 Notas</h2>
        <button onClick={loadNotes} className="refresh-btn">🔄</button>
      </div>
      
      <div className="note-form">
        <input
          type="text"
          value={noteForm.title}
          onChange={(e) => setNoteForm({...noteForm, title: e.target.value})}
          placeholder="Título da nota"
        />
        <textarea
          value={noteForm.content}
          onChange={(e) => setNoteForm({...noteForm, content: e.target.value})}
          placeholder="Conteúdo da nota"
          rows="4"
        />
        <div className="form-row">
          <select
            value={noteForm.category}
            onChange={(e) => setNoteForm({...noteForm, category: e.target.value})}
          >
            <option value="general">Geral</option>
            <option value="work">Trabalho</option>
            <option value="personal">Pessoal</option>
            <option value="study">Estudo</option>
          </select>
          <input
            type="text"
            value={noteForm.tags}
            onChange={(e) => setNoteForm({...noteForm, tags: e.target.value})}
            placeholder="Tags (separadas por vírgula)"
          />
        </div>
        <button onClick={saveNote} className="save-btn">💾 Salvar Nota</button>
      </div>
      
      <div className="notes-list">
        {notes.map((note) => (
          <div key={note.id} className={`note-item ${note.completed ? 'completed' : ''}`}>
            <div className="note-header">
              <h3>{note.title}</h3>
              <div className="note-actions">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={note.completed}
                    onChange={() => toggleNoteComplete(note.id, note.completed)}
                    disabled={isToggling[note.id]}
                  />
                  <span className={`checkmark ${isToggling[note.id] ? 'loading' : ''}`}>
                    {isToggling[note.id] ? '⏳' : '✓'}
                  </span>
                </label>
                <button 
                  onClick={() => deleteItem('note', note.id)} 
                  className="delete-btn-small"
                  disabled={isDeleting[note.id]}
                >
                  {isDeleting[note.id] ? '⏳' : '🗑️'}
                </button>
              </div>
            </div>
            <p>{note.content}</p>
            <div className="note-meta">
              <span className="category">{note.category}</span>
              <span className="tags">
                {note.tags.map(tag => (
                  <span key={tag} className="tag">#{tag}</span>
                ))}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderReminders = () => (
    <div className="reminders-container">
      <div className="reminders-header">
        <h2>📅 Lembretes</h2>
        <button onClick={loadReminders} className="refresh-btn">🔄</button>
      </div>
      
      <div className="reminder-form">
        <input
          type="text"
          value={reminderForm.title}
          onChange={(e) => setReminderForm({...reminderForm, title: e.target.value})}
          placeholder="Título do lembrete"
        />
        <textarea
          value={reminderForm.description}
          onChange={(e) => setReminderForm({...reminderForm, description: e.target.value})}
          placeholder="Descrição"
          rows="3"
        />
        <div className="form-row">
          <input
            type="datetime-local"
            value={reminderForm.date}
            onChange={(e) => setReminderForm({...reminderForm, date: e.target.value})}
          />
          <select
            value={reminderForm.priority}
            onChange={(e) => setReminderForm({...reminderForm, priority: e.target.value})}
          >
            <option value="low">Baixa</option>
            <option value="medium">Média</option>
            <option value="high">Alta</option>
          </select>
        </div>
        <button onClick={saveReminder} className="save-btn">⏰ Criar Lembrete</button>
      </div>
      
      <div className="reminders-list">
        {reminders.map((reminder) => (
          <div key={reminder.id} className={`reminder-item priority-${reminder.priority} ${reminder.completed ? 'completed' : ''}`}>
            <div className="reminder-header">
              <h3>{reminder.title}</h3>
              <div className="reminder-actions">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={reminder.completed}
                    onChange={() => toggleReminderComplete(reminder.id, reminder.completed)}
                    disabled={isToggling[reminder.id]}
                  />
                  <span className={`checkmark ${isToggling[reminder.id] ? 'loading' : ''}`}>
                    {isToggling[reminder.id] ? '⏳' : '✓'}
                  </span>
                </label>
                <button 
                  onClick={() => deleteItem('reminder', reminder.id)} 
                  className="delete-btn-small"
                  disabled={isDeleting[reminder.id]}
                >
                  {isDeleting[reminder.id] ? '⏳' : '🗑️'}
                </button>
              </div>
            </div>
            <p>{reminder.description}</p>
            <div className="reminder-meta">
              <span className="date">
                📅 {new Date(reminder.date).toLocaleString()}
              </span>
              <span className={`priority priority-${reminder.priority}`}>
                {reminder.priority === 'high' ? '🔴' : reminder.priority === 'medium' ? '🟡' : '🟢'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderSearch = () => (
    <div className="search-container">
      <div className="search-header">
        <h2>🔍 Pesquisar</h2>
      </div>
      
      <div className="search-form">
        <div className="search-input">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Digite sua pesquisa..."
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button onClick={handleSearch} disabled={isLoading}>
            {isLoading ? '⏳' : '🔍'}
          </button>
        </div>
      </div>
      
      {searchResults && (
        <div className="search-results">
          <h3>Resultados da Pesquisa:</h3>
          <div className="results-content">
            <pre>{searchResults}</pre>
          </div>
        </div>
      )}
    </div>
  );

  const renderCode = () => (
    <div className="code-container">
      <div className="code-header">
        <h2>💻 Análise e Geração de Código</h2>
      </div>
      
      <div className="code-form">
        <div className="form-row">
          <select
            value={codeLanguage}
            onChange={(e) => setCodeLanguage(e.target.value)}
          >
            <option value="python">Python</option>
            <option value="javascript">JavaScript</option>
            <option value="java">Java</option>
            <option value="cpp">C++</option>
            <option value="html">HTML</option>
            <option value="css">CSS</option>
            <option value="react">React</option>
            <option value="node">Node.js</option>
          </select>
          <select
            value={codeTask}
            onChange={(e) => setCodeTask(e.target.value)}
          >
            <option value="analyze">Analisar Código</option>
            <option value="explain">Explicar Código</option>
            <option value="improve">Melhorar Código</option>
            <option value="generate">Gerar Código</option>
            <option value="create">Criar Código</option>
          </select>
        </div>
        
        {(codeTask === 'generate' || codeTask === 'create') ? (
          <textarea
            value={codeDescription}
            onChange={(e) => setCodeDescription(e.target.value)}
            placeholder="Descreva o que você quer que seja criado... Ex: 'Crie uma função que calcula a área de um círculo'"
            rows="6"
            className="code-textarea"
          />
        ) : (
          <textarea
            value={codeToAnalyze}
            onChange={(e) => setCodeToAnalyze(e.target.value)}
            placeholder="Cole seu código aqui para análise..."
            rows="10"
            className="code-textarea"
          />
        )}
        
        <button onClick={handleCodeAnalysis} disabled={isLoading} className="analyze-btn">
          {isLoading ? '⏳ Processando...' : 
           codeTask === 'generate' || codeTask === 'create' ? '🚀 Gerar Código' : '🔬 Analisar Código'}
        </button>
      </div>
      
      {codeAnalysis && (
        <div className="code-analysis">
          <h3>
            {codeTask === 'generate' || codeTask === 'create' ? 'Código Gerado:' : 'Análise do Código:'}
          </h3>
          <div className="analysis-content">
            <pre>{codeAnalysis}</pre>
          </div>
        </div>
      )}
    </div>
  );

  const renderContent = () => {
    switch(activeTab) {
      case 'chat':
        return renderChat();
      case 'notes':
        return renderNotes();
      case 'reminders':
        return renderReminders();
      case 'search':
        return renderSearch();
      case 'code':
        return renderCode();
      default:
        return renderDashboard();
    }
  };

  return (
    <div className="app">
      <div className="sidebar">
        <div className="sidebar-header">
          <h1>🤖 IA Assistente</h1>
        </div>
        
        <nav className="sidebar-nav">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          >
            📊 Dashboard
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`nav-item ${activeTab === 'chat' ? 'active' : ''}`}
          >
            💬 Chat
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`nav-item ${activeTab === 'notes' ? 'active' : ''}`}
          >
            📝 Notas
          </button>
          <button
            onClick={() => setActiveTab('reminders')}
            className={`nav-item ${activeTab === 'reminders' ? 'active' : ''}`}
          >
            📅 Lembretes
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`nav-item ${activeTab === 'search' ? 'active' : ''}`}
          >
            🔍 Pesquisar
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={`nav-item ${activeTab === 'code' ? 'active' : ''}`}
          >
            💻 Código
          </button>
        </nav>
      </div>
      
      <div className="main-content">
        {renderContent()}
      </div>
      
      {renderActivityModal()}
    </div>
  );
};

export default App;