from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import Optional, List
import os
import json
import uuid
from pymongo import MongoClient
from emergentintegrations.llm.chat import LlmChat, UserMessage
import asyncio
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = FastAPI()

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB Connection
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017/')
client = MongoClient(MONGO_URL)
db = client.ai_assistant

# Collections
chats_collection = db.chats
notes_collection = db.notes
reminders_collection = db.reminders
sessions_collection = db.sessions
searches_collection = db.searches
code_analyses_collection = db.code_analyses

# Google Gemini Configuration
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')

# Pydantic Models
class ChatMessage(BaseModel):
    message: str
    session_id: Optional[str] = None

class ChatResponse(BaseModel):
    response: str
    session_id: str

class Note(BaseModel):
    title: str
    content: str
    category: Optional[str] = "general"
    tags: Optional[List[str]] = []

class NoteResponse(BaseModel):
    id: str
    title: str
    content: str
    category: str
    tags: List[str]
    created_at: datetime
    updated_at: datetime
    completed: bool

class Reminder(BaseModel):
    title: str
    description: str
    date: datetime
    priority: Optional[str] = "medium"

class ReminderResponse(BaseModel):
    id: str
    title: str
    description: str
    date: datetime
    priority: str
    created_at: datetime
    completed: bool

class SearchQuery(BaseModel):
    query: str
    type: Optional[str] = "general"

class CodeAnalysis(BaseModel):
    code: str
    language: Optional[str] = "python"
    task: Optional[str] = "analyze"
    description: Optional[str] = ""

# Helper Functions
def get_or_create_session(session_id: str = None):
    if not session_id:
        session_id = str(uuid.uuid4())
    
    session = sessions_collection.find_one({"session_id": session_id})
    if not session:
        session = {
            "session_id": session_id,
            "created_at": datetime.now(),
            "messages": []
        }
        sessions_collection.insert_one(session)
    
    return session_id

def save_message(session_id: str, message: str, response: str):
    chats_collection.insert_one({
        "session_id": session_id,
        "message": message,
        "response": response,
        "timestamp": datetime.now()
    })

def save_search(query: str, results: str, search_type: str):
    searches_collection.insert_one({
        "id": str(uuid.uuid4()),
        "query": query,
        "results": results,
        "type": search_type,
        "timestamp": datetime.now()
    })

def save_code_analysis(code: str, language: str, task: str, analysis: str, description: str = ""):
    code_analyses_collection.insert_one({
        "id": str(uuid.uuid4()),
        "code": code,
        "language": language,
        "task": task,
        "analysis": analysis,
        "description": description,
        "timestamp": datetime.now()
    })

# API Endpoints
@app.get("/api/health")
async def health():
    return {"status": "ok", "message": "AI Assistant API is running with Gemini 2.0 Flash"}

@app.post("/api/chat", response_model=ChatResponse)
async def chat(chat_request: ChatMessage):
    try:
        session_id = get_or_create_session(chat_request.session_id)
        
        # Get chat history for context
        history = list(chats_collection.find(
            {"session_id": session_id}
        ).sort("timestamp", -1).limit(10))
        
        # Initialize Gemini chat for intent detection
        intent_chat = LlmChat(
            api_key=GEMINI_API_KEY,
            session_id=str(uuid.uuid4()),
            system_message="""Você é um analisador de intenções. Analise a mensagem do usuário e determine se ele está pedindo para:
1. Criar uma nota (palavras-chave: nota, anotar, escrever, salvar texto, lembrar isso)
2. Criar um lembrete (palavras-chave: lembrete, lembrar, agendamento, compromisso, tarefa, fazer em)
3. Apenas conversar normalmente

Responda EXATAMENTE em um destes formatos:
- Se for para criar nota: CRIAR_NOTA|título|conteúdo|categoria
- Se for para criar lembrete: CRIAR_LEMBRETE|título|descrição|data_hora|prioridade
- Se for conversa normal: CONVERSAR

Para lembretes, a data_hora deve estar no formato ISO (ex: 2024-07-10T15:30:00).
Para categoria use: general, work, personal, study
Para prioridade use: low, medium, high

Exemplos:
- "Anote que preciso comprar leite" -> CRIAR_NOTA|Compras|Preciso comprar leite|personal
- "Me lembre de ligar para o médico amanhã às 15h" -> CRIAR_LEMBRETE|Ligar médico|Ligar para o médico|2024-07-09T15:00:00|medium
- "Como você está?" -> CONVERSAR"""
        ).with_model("gemini", "gemini-2.0-flash").with_max_tokens(200)
        
        # Analyze intent
        intent_message = UserMessage(text=chat_request.message)
        intent_response = await intent_chat.send_message(intent_message)
        
        # Process based on intent
        if intent_response.startswith("CRIAR_NOTA|"):
            try:
                parts = intent_response.split("|")
                if len(parts) >= 4:
                    _, title, content, category = parts[0], parts[1], parts[2], parts[3]
                    
                    # Create note
                    note_id = str(uuid.uuid4())
                    note_data = {
                        "id": note_id,
                        "title": title,
                        "content": content,
                        "category": category,
                        "tags": [],
                        "created_at": datetime.now(),
                        "updated_at": datetime.now(),
                        "completed": False
                    }
                    
                    notes_collection.insert_one(note_data)
                    
                    response = f"✅ Nota criada com sucesso!\n\n📝 **{title}**\n{content}\n\nCategoria: {category}\n\nVocê pode ver sua nota na seção 'Notas' do menu."
                else:
                    response = "Entendi que você quer criar uma nota, mas não consegui extrair todas as informações. Pode repetir especificando título e conteúdo?"
            except Exception as e:
                response = f"Entendi que você quer criar uma nota, mas houve um erro: {str(e)}. Pode tentar novamente?"
                
        elif intent_response.startswith("CRIAR_LEMBRETE|"):
            try:
                parts = intent_response.split("|")
                if len(parts) >= 5:
                    _, title, description, date_str, priority = parts[0], parts[1], parts[2], parts[3], parts[4]
                    
                    # Parse date with more flexibility
                    try:
                        # First try to parse the provided date
                        reminder_date = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                    except:
                        try:
                            # Try different common formats
                            from dateutil import parser
                            reminder_date = parser.parse(date_str)
                        except:
                            # If all parsing fails, set for tomorrow at extracted time or 10 AM
                            tomorrow = datetime.now() + timedelta(days=1)
                            
                            # Try to extract hour from original message
                            import re
                            time_match = re.search(r'(\d{1,2})[h:]?(\d{0,2})', chat_request.message.lower())
                            if time_match:
                                hour = int(time_match.group(1))
                                minute = int(time_match.group(2)) if time_match.group(2) else 0
                                # Ensure valid time
                                if 0 <= hour <= 23 and 0 <= minute <= 59:
                                    reminder_date = tomorrow.replace(hour=hour, minute=minute, second=0, microsecond=0)
                                else:
                                    reminder_date = tomorrow.replace(hour=10, minute=0, second=0, microsecond=0)
                            else:
                                reminder_date = tomorrow.replace(hour=10, minute=0, second=0, microsecond=0)
                    
                    # Create reminder
                    reminder_id = str(uuid.uuid4())
                    reminder_data = {
                        "id": reminder_id,
                        "title": title,
                        "description": description,
                        "date": reminder_date,
                        "priority": priority,
                        "created_at": datetime.now(),
                        "completed": False
                    }
                    
                    reminders_collection.insert_one(reminder_data)
                    
                    response = f"⏰ Lembrete criado com sucesso!\n\n📅 **{title}**\n{description}\n\nData: {reminder_date.strftime('%d/%m/%Y às %H:%M')}\nPrioridade: {priority}\n\nVocê pode ver seu lembrete na seção 'Lembretes' do menu."
                else:
                    response = "Entendi que você quer criar um lembrete, mas não consegui extrair todas as informações. Pode repetir especificando título, descrição e quando quer ser lembrado?"
            except Exception as e:
                response = f"Entendi que você quer criar um lembrete, mas houve um erro: {str(e)}. Pode tentar novamente?"
                
        else:
            # Normal conversation
            chat = LlmChat(
                api_key=GEMINI_API_KEY,
                session_id=session_id,
                system_message="Você é um assistente pessoal de IA avançado e inteligente. Você pode ajudar com pesquisas, análises, desenvolvimento de código, organização de tarefas e muito mais. Seja prestativo, criativo e amigável. Responda sempre em português brasileiro. Se o usuário pedir para criar notas ou lembretes, oriente-o a usar comandos claros como 'crie uma nota sobre...' ou 'me lembre de...'."
            ).with_model("gemini", "gemini-2.0-flash").with_max_tokens(4096)
            
            # Create user message
            user_message = UserMessage(text=chat_request.message)
            
            # Send message and get response
            response = await chat.send_message(user_message)
        
        # Save to database
        save_message(session_id, chat_request.message, response)
        
        return ChatResponse(response=response, session_id=session_id)
        
    except Exception as e:
        error_response = f"Desculpe, ocorreu um erro: {str(e)}. Tente novamente."
        save_message(session_id, chat_request.message, error_response)
        raise HTTPException(status_code=500, detail=f"Error processing chat: {str(e)}")

@app.get("/api/chat/history/{session_id}")
async def get_chat_history(session_id: str):
    try:
        history = list(chats_collection.find(
            {"session_id": session_id}
        ).sort("timestamp", 1))
        
        return [
            {
                "id": str(msg["_id"]),
                "message": msg["message"],
                "response": msg["response"],
                "timestamp": msg["timestamp"]
            }
            for msg in history
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching history: {str(e)}")

@app.get("/api/chat/actions")
async def get_chat_actions():
    """Get recent notes and reminders created via chat"""
    try:
        # Get recent notes created in last hour (likely from chat)
        recent_notes = list(notes_collection.find({
            "created_at": {"$gte": datetime.now() - timedelta(hours=1)}
        }).sort("created_at", -1).limit(5))
        
        # Get recent reminders created in last hour (likely from chat)
        recent_reminders = list(reminders_collection.find({
            "created_at": {"$gte": datetime.now() - timedelta(hours=1)}
        }).sort("created_at", -1).limit(5))
        
        return {
            "recent_notes": [
                {
                    "id": note["id"],
                    "title": note["title"],
                    "content": note["content"],
                    "category": note["category"],
                    "created_at": note["created_at"]
                }
                for note in recent_notes
            ],
            "recent_reminders": [
                {
                    "id": reminder["id"],
                    "title": reminder["title"],
                    "description": reminder["description"],
                    "date": reminder["date"],
                    "priority": reminder["priority"],
                    "created_at": reminder["created_at"]
                }
                for reminder in recent_reminders
            ]
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching chat actions: {str(e)}")
async def get_recent_chats():
    try:
        recent_chats = list(chats_collection.find().sort("timestamp", -1).limit(10))
        
        return [
            {
                "id": str(msg["_id"]),
                "message": msg["message"][:100] + "..." if len(msg["message"]) > 100 else msg["message"],
                "response": msg["response"][:200] + "..." if len(msg["response"]) > 200 else msg["response"],
                "timestamp": msg["timestamp"],
                "session_id": msg["session_id"]
            }
            for msg in recent_chats
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching recent chats: {str(e)}")

@app.delete("/api/chat/{chat_id}")
async def delete_chat(chat_id: str):
    try:
        from bson import ObjectId
        # Try both ObjectId and string ID
        try:
            result = chats_collection.delete_one({"_id": ObjectId(chat_id)})
        except:
            # If ObjectId fails, try with string id
            result = chats_collection.delete_one({"id": chat_id})
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Chat not found")
            
        return {"message": "Chat deleted successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting chat: {str(e)}")

@app.post("/api/notes", response_model=NoteResponse)
async def create_note(note: Note):
    try:
        note_id = str(uuid.uuid4())
        note_data = {
            "id": note_id,
            "title": note.title,
            "content": note.content,
            "category": note.category,
            "tags": note.tags,
            "created_at": datetime.now(),
            "updated_at": datetime.now(),
            "completed": False
        }
        
        notes_collection.insert_one(note_data)
        
        return NoteResponse(**note_data)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating note: {str(e)}")

@app.get("/api/notes")
async def get_notes(category: Optional[str] = None, tag: Optional[str] = None, recent: Optional[bool] = False):
    try:
        query = {}
        if category:
            query["category"] = category
        if tag:
            query["tags"] = {"$in": [tag]}
        
        notes = list(notes_collection.find(query).sort("created_at", -1))
        
        if recent:
            notes = notes[:10]  # Limit to 10 recent notes
        
        return [
            {
                "id": note["id"],
                "title": note["title"],
                "content": note["content"],
                "category": note["category"],
                "tags": note["tags"],
                "created_at": note["created_at"],
                "updated_at": note["updated_at"],
                "completed": note.get("completed", False)
            }
            for note in notes
        ]
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching notes: {str(e)}")

@app.put("/api/notes/{note_id}")
async def update_note(note_id: str, note: Note):
    try:
        update_data = {
            "title": note.title,
            "content": note.content,
            "category": note.category,
            "tags": note.tags,
            "updated_at": datetime.now()
        }
        
        result = notes_collection.update_one(
            {"id": note_id},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Note not found")
            
        return {"message": "Note updated successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating note: {str(e)}")

@app.put("/api/notes/{note_id}/complete")
async def complete_note(note_id: str):
    try:
        result = notes_collection.update_one(
            {"id": note_id},
            {"$set": {"completed": True, "updated_at": datetime.now()}}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Note not found")
            
        return {"message": "Note completed successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error completing note: {str(e)}")

@app.put("/api/notes/{note_id}/uncomplete")
async def uncomplete_note(note_id: str):
    try:
        result = notes_collection.update_one(
            {"id": note_id},
            {"$set": {"completed": False, "updated_at": datetime.now()}}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Note not found")
            
        return {"message": "Note uncompleted successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uncompleting note: {str(e)}")

@app.delete("/api/notes/{note_id}")
async def delete_note(note_id: str):
    try:
        result = notes_collection.delete_one({"id": note_id})
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Note not found")
            
        return {"message": "Note deleted successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting note: {str(e)}")

@app.post("/api/reminders", response_model=ReminderResponse)
async def create_reminder(reminder: Reminder):
    try:
        reminder_id = str(uuid.uuid4())
        reminder_data = {
            "id": reminder_id,
            "title": reminder.title,
            "description": reminder.description,
            "date": reminder.date,
            "priority": reminder.priority,
            "created_at": datetime.now(),
            "completed": False
        }
        
        reminders_collection.insert_one(reminder_data)
        
        return ReminderResponse(**reminder_data)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating reminder: {str(e)}")

@app.get("/api/reminders")
async def get_reminders(upcoming: Optional[bool] = None, recent: Optional[bool] = False):
    try:
        query = {}
        if upcoming:
            query["date"] = {"$gte": datetime.now()}
            query["completed"] = False
        
        reminders = list(reminders_collection.find(query).sort("date", 1))
        
        if recent:
            reminders = reminders[:10]  # Limit to 10 recent reminders
            
        return [
            {
                "id": reminder["id"],
                "title": reminder["title"],
                "description": reminder["description"],
                "date": reminder["date"],
                "priority": reminder["priority"],
                "created_at": reminder["created_at"],
                "completed": reminder["completed"]
            }
            for reminder in reminders
        ]
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching reminders: {str(e)}")

@app.put("/api/reminders/{reminder_id}/complete")
async def complete_reminder(reminder_id: str):
    try:
        result = reminders_collection.update_one(
            {"id": reminder_id},
            {"$set": {"completed": True}}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Reminder not found")
            
        return {"message": "Reminder completed successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error completing reminder: {str(e)}")

@app.put("/api/reminders/{reminder_id}/uncomplete")
async def uncomplete_reminder(reminder_id: str):
    try:
        result = reminders_collection.update_one(
            {"id": reminder_id},
            {"$set": {"completed": False}}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Reminder not found")
            
        return {"message": "Reminder uncompleted successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uncompleting reminder: {str(e)}")

@app.delete("/api/reminders/{reminder_id}")
async def delete_reminder(reminder_id: str):
    try:
        result = reminders_collection.delete_one({"id": reminder_id})
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Reminder not found")
            
        return {"message": "Reminder deleted successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting reminder: {str(e)}")

@app.post("/api/search")
async def search(search_query: SearchQuery):
    try:
        # Initialize Gemini chat for search
        chat = LlmChat(
            api_key=GEMINI_API_KEY,
            session_id=str(uuid.uuid4()),
            system_message="Você é um assistente especializado em pesquisas. Forneça respostas precisas, detalhadas e bem estruturadas sobre qualquer tópico pesquisado. Responda sempre em português brasileiro."
        ).with_model("gemini", "gemini-2.0-flash").with_max_tokens(4096)
        
        search_prompt = f"Pesquise e forneça informações detalhadas sobre: {search_query.query}"
        
        user_message = UserMessage(text=search_prompt)
        response = await chat.send_message(user_message)
        
        # Save search to database
        save_search(search_query.query, response, search_query.type)
        
        return {
            "query": search_query.query,
            "results": response,
            "type": search_query.type
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error performing search: {str(e)}")

@app.delete("/api/search/{search_id}")
async def delete_search(search_id: str):
    try:
        result = searches_collection.delete_one({"id": search_id})
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Search not found")
            
        return {"message": "Search deleted successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting search: {str(e)}")

@app.post("/api/code/analyze")
async def analyze_code(code_request: CodeAnalysis):
    try:
        # Initialize Gemini chat for code analysis
        chat = LlmChat(
            api_key=GEMINI_API_KEY,
            session_id=str(uuid.uuid4()),
            system_message="Você é um especialista em desenvolvimento de software. Analise código, identifique problemas, sugira melhorias, forneça explicações detalhadas e GERE CÓDIGO quando solicitado. Responda sempre em português brasileiro."
        ).with_model("gemini", "gemini-2.0-flash").with_max_tokens(4096)
        
        if code_request.task == "analyze":
            prompt = f"Analise este código {code_request.language}:\n\n{code_request.code}\n\nForneça uma análise detalhada incluindo: problemas, melhorias, explicações e sugestões."
        elif code_request.task == "explain":
            prompt = f"Explique detalhadamente este código {code_request.language}:\n\n{code_request.code}"
        elif code_request.task == "improve":
            prompt = f"Melhore este código {code_request.language} e explique as melhorias:\n\n{code_request.code}"
        elif code_request.task == "generate":
            prompt = f"Gere código {code_request.language} para: {code_request.description}\n\nForneça o código completo e funcional com explicações."
        elif code_request.task == "create":
            prompt = f"Crie um código {code_request.language} que faça: {code_request.description}\n\nForneça o código completo, bem estruturado e com comentários explicativos."
        else:
            # Check if user is asking to generate code based on description
            if code_request.description and not code_request.code.strip():
                prompt = f"Crie um código {code_request.language} que faça: {code_request.description}\n\nForneça o código completo, bem estruturado e com comentários explicativos."
            else:
                prompt = f"Analise este código {code_request.language}:\n\n{code_request.code}"
            
        user_message = UserMessage(text=prompt)
        response = await chat.send_message(user_message)
        
        # Save code analysis to database
        save_code_analysis(
            code_request.code, 
            code_request.language, 
            code_request.task, 
            response, 
            code_request.description
        )
        
        return {
            "code": code_request.code,
            "language": code_request.language,
            "task": code_request.task,
            "description": code_request.description,
            "analysis": response
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing code: {str(e)}")

@app.delete("/api/code/{code_id}")
async def delete_code_analysis(code_id: str):
    try:
        result = code_analyses_collection.delete_one({"id": code_id})
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Code analysis not found")
            
        return {"message": "Code analysis deleted successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting code analysis: {str(e)}")

@app.get("/api/dashboard")
async def get_dashboard():
    try:
        # Get recent activity
        recent_chats = chats_collection.count_documents({
            "timestamp": {"$gte": datetime.now() - timedelta(days=7)}
        })
        
        total_notes = notes_collection.count_documents({})
        
        upcoming_reminders = reminders_collection.count_documents({
            "date": {"$gte": datetime.now()},
            "completed": False
        })
        
        # Get recent activities for timeline
        recent_chat_activities = list(chats_collection.find().sort("timestamp", -1).limit(3))
        recent_note_activities = list(notes_collection.find().sort("created_at", -1).limit(3))
        recent_reminder_activities = list(reminders_collection.find().sort("created_at", -1).limit(3))
        recent_search_activities = list(searches_collection.find().sort("timestamp", -1).limit(3))
        recent_code_activities = list(code_analyses_collection.find().sort("timestamp", -1).limit(3))
        
        # Format activities for timeline
        activities = []
        
        # Add recent chats
        for chat in recent_chat_activities:
            activities.append({
                "id": str(chat["_id"]),
                "type": "chat",
                "icon": "💬",
                "title": "Conversa com IA",
                "description": chat["message"][:100] + "..." if len(chat["message"]) > 100 else chat["message"],
                "timestamp": chat["timestamp"],
                "data": {
                    "message": chat["message"],
                    "response": chat["response"],
                    "session_id": chat["session_id"]
                }
            })
        
        # Add recent notes
        for note in recent_note_activities:
            activities.append({
                "id": note["id"],
                "type": "note",
                "icon": "📝",
                "title": f"Nota: {note['title']}",
                "description": note["content"][:100] + "..." if len(note["content"]) > 100 else note["content"],
                "timestamp": note["created_at"],
                "data": {
                    "title": note["title"],
                    "content": note["content"],
                    "category": note["category"],
                    "tags": note["tags"],
                    "completed": note.get("completed", False)
                }
            })
        
        # Add recent reminders
        for reminder in recent_reminder_activities:
            activities.append({
                "id": reminder["id"],
                "type": "reminder",
                "icon": "📅",
                "title": f"Lembrete: {reminder['title']}",
                "description": reminder["description"][:100] + "..." if len(reminder["description"]) > 100 else reminder["description"],
                "timestamp": reminder["created_at"],
                "data": {
                    "title": reminder["title"],
                    "description": reminder["description"],
                    "date": reminder["date"],
                    "priority": reminder["priority"],
                    "completed": reminder["completed"]
                }
            })
        
        # Add recent searches
        for search in recent_search_activities:
            activities.append({
                "id": search["id"],
                "type": "search",
                "icon": "🔍",
                "title": f"Pesquisa: {search['query']}",
                "description": search["results"][:100] + "..." if len(search["results"]) > 100 else search["results"],
                "timestamp": search["timestamp"],
                "data": {
                    "query": search["query"],
                    "results": search["results"],
                    "type": search["type"]
                }
            })
        
        # Add recent code analyses
        for code in recent_code_activities:
            title = f"Código: {code['description']}" if code.get('description') else f"Análise {code['language']}"
            activities.append({
                "id": code["id"],
                "type": "code",
                "icon": "💻",
                "title": title,
                "description": code["analysis"][:100] + "..." if len(code["analysis"]) > 100 else code["analysis"],
                "timestamp": code["timestamp"],
                "data": {
                    "code": code["code"],
                    "language": code["language"],
                    "task": code["task"],
                    "analysis": code["analysis"],
                    "description": code.get("description", "")
                }
            })
        
        # Sort activities by timestamp
        activities.sort(key=lambda x: x["timestamp"], reverse=True)
        activities = activities[:15]  # Limit to 15 most recent activities
        
        return {
            "recent_chats": recent_chats,
            "total_notes": total_notes,
            "upcoming_reminders": upcoming_reminders,
            "last_activity": datetime.now(),
            "activities": activities
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching dashboard data: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)