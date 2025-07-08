import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const App = () => {
  const [activeTab, setActiveTab] = useState('chat');
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
  const [dashboardData, setDashboardData] = useState({});
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState(null);
  const [selectedNote, setSelectedNote] = useState(null);
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
      const response = await fetch(`${BACKEND_URL}/api/reminders?upcoming=true`);
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
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'pt-BR';
      utterance.rate = 0.9;
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
    } catch (error) {
      console.error('Error searching:', error);
      setSearchResults('Erro na pesquisa. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCodeAnalysis = async () => {
    if (!codeToAnalyze.trim()) return;

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
          task: 'analyze'
        }),
      });

      const data = await response.json();
      setCodeAnalysis(data.analysis);
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
      }
    } catch (error) {
      console.error('Error saving reminder:', error);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const renderChat = () => (
    <div className="chat-container">
      <div className="chat-header">
        <h2>💬 Assistente Pessoal</h2>
        <div className="voice-controls">
          <button
            onClick={isListening ? stopListening : startListening}
            className={`voice-btn ${isListening ? 'listening' : ''}`}
          >
            {isListening ? '🛑 Parar' : '🎤 Falar'}
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
          placeholder="Digite sua mensagem ou use o microfone..."
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
          <div key={note.id} className="note-item">
            <h3>{note.title}</h3>
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
          <div key={reminder.id} className={`reminder-item priority-${reminder.priority}`}>
            <h3>{reminder.title}</h3>
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
        <h2>💻 Análise de Código</h2>
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
          </select>
        </div>
        <textarea
          value={codeToAnalyze}
          onChange={(e) => setCodeToAnalyze(e.target.value)}
          placeholder="Cole seu código aqui para análise..."
          rows="10"
          className="code-textarea"
        />
        <button onClick={handleCodeAnalysis} disabled={isLoading} className="analyze-btn">
          {isLoading ? '⏳ Analisando...' : '🔬 Analisar Código'}
        </button>
      </div>
      
      {codeAnalysis && (
        <div className="code-analysis">
          <h3>Análise do Código:</h3>
          <div className="analysis-content">
            <pre>{codeAnalysis}</pre>
          </div>
        </div>
      )}
    </div>
  );

  const renderDashboard = () => (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h2>📊 Dashboard</h2>
        <button onClick={loadDashboard} className="refresh-btn">🔄</button>
      </div>
      
      <div className="dashboard-stats">
        <div className="stat-card">
          <h3>💬 Conversas (7 dias)</h3>
          <span className="stat-number">{dashboardData.recent_chats || 0}</span>
        </div>
        <div className="stat-card">
          <h3>📝 Total de Notas</h3>
          <span className="stat-number">{dashboardData.total_notes || 0}</span>
        </div>
        <div className="stat-card">
          <h3>⏰ Lembretes Pendentes</h3>
          <span className="stat-number">{dashboardData.upcoming_reminders || 0}</span>
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
    </div>
  );
};

export default App;