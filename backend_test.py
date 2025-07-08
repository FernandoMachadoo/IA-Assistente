import requests
import unittest
import json
from datetime import datetime, timedelta
import os
import sys
import uuid

class AIAssistantAPITest(unittest.TestCase):
    def setUp(self):
        # Get the backend URL from the frontend .env file
        self.base_url = "https://fe826594-0c0c-41d2-a15e-95eb7c4119ec.preview.emergentagent.com"
        self.session_id = None
        self.note_id = None
        self.reminder_id = None
        print(f"Testing against backend URL: {self.base_url}")

    def test_01_health_check(self):
        """Test the health check endpoint"""
        print("\n🔍 Testing health check endpoint...")
        response = requests.get(f"{self.base_url}/api/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ok")
        print("✅ Health check passed")

    def test_02_chat_functionality(self):
        """Test the chat functionality"""
        print("\n🔍 Testing chat functionality...")
        
        # Send a message to the AI
        payload = {
            "message": "Hello, can you introduce yourself?",
            "session_id": None
        }
        
        response = requests.post(
            f"{self.base_url}/api/chat",
            json=payload
        )
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("response", data)
        self.assertIn("session_id", data)
        
        # Save session ID for future tests
        self.session_id = data["session_id"]
        print(f"✅ Chat functionality passed - Session ID: {self.session_id}")
        
        # Test chat history
        if self.session_id:
            print("🔍 Testing chat history...")
            response = requests.get(f"{self.base_url}/api/chat/history/{self.session_id}")
            self.assertEqual(response.status_code, 200)
            history = response.json()
            self.assertIsInstance(history, list)
            print("✅ Chat history passed")

    def test_03_notes_crud(self):
        """Test CRUD operations for notes"""
        print("\n🔍 Testing notes CRUD operations...")
        
        # Create a note
        note_data = {
            "title": "Test Note",
            "content": "This is a test note created by the automated test.",
            "category": "test",
            "tags": ["test", "automated"]
        }
        
        response = requests.post(
            f"{self.base_url}/api/notes",
            json=note_data
        )
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("id", data)
        self.note_id = data["id"]
        print(f"✅ Note creation passed - Note ID: {self.note_id}")
        
        # Get all notes
        print("🔍 Testing get all notes...")
        response = requests.get(f"{self.base_url}/api/notes")
        self.assertEqual(response.status_code, 200)
        notes = response.json()
        self.assertIsInstance(notes, list)
        print("✅ Get all notes passed")
        
        # Update the note
        if self.note_id:
            print("🔍 Testing note update...")
            update_data = {
                "title": "Updated Test Note",
                "content": "This note has been updated by the automated test.",
                "category": "test",
                "tags": ["test", "automated", "updated"]
            }
            
            response = requests.put(
                f"{self.base_url}/api/notes/{self.note_id}",
                json=update_data
            )
            
            self.assertEqual(response.status_code, 200)
            print("✅ Note update passed")
            
            # Delete the note
            print("🔍 Testing note deletion...")
            response = requests.delete(f"{self.base_url}/api/notes/{self.note_id}")
            self.assertEqual(response.status_code, 200)
            print("✅ Note deletion passed")

    def test_04_reminders_crud(self):
        """Test CRUD operations for reminders"""
        print("\n🔍 Testing reminders CRUD operations...")
        
        # Create a reminder
        reminder_date = (datetime.now() + timedelta(days=1)).isoformat()
        reminder_data = {
            "title": "Test Reminder",
            "description": "This is a test reminder created by the automated test.",
            "date": reminder_date,
            "priority": "high"
        }
        
        response = requests.post(
            f"{self.base_url}/api/reminders",
            json=reminder_data
        )
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("id", data)
        self.reminder_id = data["id"]
        print(f"✅ Reminder creation passed - Reminder ID: {self.reminder_id}")
        
        # Get all reminders
        print("🔍 Testing get all reminders...")
        response = requests.get(f"{self.base_url}/api/reminders")
        self.assertEqual(response.status_code, 200)
        reminders = response.json()
        self.assertIsInstance(reminders, list)
        print("✅ Get all reminders passed")
        
        # Get upcoming reminders
        print("🔍 Testing get upcoming reminders...")
        response = requests.get(f"{self.base_url}/api/reminders?upcoming=true")
        self.assertEqual(response.status_code, 200)
        upcoming_reminders = response.json()
        self.assertIsInstance(upcoming_reminders, list)
        print("✅ Get upcoming reminders passed")
        
        # Complete the reminder
        if self.reminder_id:
            print("🔍 Testing reminder completion...")
            response = requests.put(f"{self.base_url}/api/reminders/{self.reminder_id}/complete")
            self.assertEqual(response.status_code, 200)
            print("✅ Reminder completion passed")

    def test_05_search_functionality(self):
        """Test the search functionality"""
        print("\n🔍 Testing search functionality...")
        
        search_data = {
            "query": "artificial intelligence",
            "type": "general"
        }
        
        response = requests.post(
            f"{self.base_url}/api/search",
            json=search_data
        )
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("results", data)
        print("✅ Search functionality passed")

    def test_06_code_analysis(self):
        """Test the code analysis functionality"""
        print("\n🔍 Testing code analysis...")
        
        code_data = {
            "code": "def hello_world():\n    print('Hello, World!')",
            "language": "python",
            "task": "analyze"
        }
        
        response = requests.post(
            f"{self.base_url}/api/code/analyze",
            json=code_data
        )
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("analysis", data)
        print("✅ Code analysis passed")

    def test_07_dashboard(self):
        """Test the dashboard endpoint"""
        print("\n🔍 Testing dashboard...")
        
        response = requests.get(f"{self.base_url}/api/dashboard")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("recent_chats", data)
        self.assertIn("total_notes", data)
        self.assertIn("upcoming_reminders", data)
        print("✅ Dashboard passed")

def run_tests():
    suite = unittest.TestSuite()
    suite.addTest(AIAssistantAPITest('test_01_health_check'))
    suite.addTest(AIAssistantAPITest('test_02_chat_functionality'))
    suite.addTest(AIAssistantAPITest('test_03_notes_crud'))
    suite.addTest(AIAssistantAPITest('test_04_reminders_crud'))
    suite.addTest(AIAssistantAPITest('test_05_search_functionality'))
    suite.addTest(AIAssistantAPITest('test_06_code_analysis'))
    suite.addTest(AIAssistantAPITest('test_07_dashboard'))
    
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    return result.wasSuccessful()

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)