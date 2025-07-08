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
        
        # Initialize Gemini chat
        chat = LlmChat(
            api_key=GEMINI_API_KEY,
            session_id=session_id,
            system_message="Você é um assistente pessoal de IA avançado e inteligente. Você pode ajudar com pesquisas, análises, desenvolvimento de código, organização de tarefas e muito mais. Seja prestativo, criativo e amigável. Responda sempre em português brasileiro."
        ).with_model("gemini", "gemini-2.0-flash").with_max_tokens(4096)
        
        # Create user message
        user_message = UserMessage(text=chat_request.message)
        
        # Send message and get response
        response = await chat.send_message(user_message)
        
        # Save to database
        save_message(session_id, chat_request.message, response)
        
        return ChatResponse(response=response, session_id=session_id)
        
    except Exception as e:
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
            "updated_at": datetime.now()
        }
        
        notes_collection.insert_one(note_data)
        
        return NoteResponse(**note_data)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating note: {str(e)}")

@app.get("/api/notes")
async def get_notes(category: Optional[str] = None, tag: Optional[str] = None):
    try:
        query = {}
        if category:
            query["category"] = category
        if tag:
            query["tags"] = {"$in": [tag]}
            
        notes = list(notes_collection.find(query).sort("created_at", -1))
        
        return [
            {
                "id": note["id"],
                "title": note["title"],
                "content": note["content"],
                "category": note["category"],
                "tags": note["tags"],
                "created_at": note["created_at"],
                "updated_at": note["updated_at"]
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
async def get_reminders(upcoming: Optional[bool] = None):
    try:
        query = {}
        if upcoming:
            query["date"] = {"$gte": datetime.now()}
            query["completed"] = False
            
        reminders = list(reminders_collection.find(query).sort("date", 1))
        
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
        
        return {
            "query": search_query.query,
            "results": response,
            "type": search_query.type
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error performing search: {str(e)}")

@app.post("/api/code/analyze")
async def analyze_code(code_request: CodeAnalysis):
    try:
        # Initialize Gemini chat for code analysis
        chat = LlmChat(
            api_key=GEMINI_API_KEY,
            session_id=str(uuid.uuid4()),
            system_message="Você é um especialista em desenvolvimento de software. Analise código, identifique problemas, sugira melhorias e forneça explicações detalhadas. Responda sempre em português brasileiro."
        ).with_model("gemini", "gemini-2.0-flash").with_max_tokens(4096)
        
        if code_request.task == "analyze":
            prompt = f"Analise este código {code_request.language}:\n\n{code_request.code}\n\nForneça uma análise detalhada incluindo: problemas, melhorias, explicações e sugestões."
        elif code_request.task == "explain":
            prompt = f"Explique detalhadamente este código {code_request.language}:\n\n{code_request.code}"
        elif code_request.task == "improve":
            prompt = f"Melhore este código {code_request.language} e explique as melhorias:\n\n{code_request.code}"
        else:
            prompt = f"Analise este código {code_request.language}:\n\n{code_request.code}"
            
        user_message = UserMessage(text=prompt)
        response = await chat.send_message(user_message)
        
        return {
            "code": code_request.code,
            "language": code_request.language,
            "task": code_request.task,
            "analysis": response
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing code: {str(e)}")

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
        
        return {
            "recent_chats": recent_chats,
            "total_notes": total_notes,
            "upcoming_reminders": upcoming_reminders,
            "last_activity": datetime.now()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching dashboard data: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)