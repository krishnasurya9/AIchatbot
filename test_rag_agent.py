import requests
import json

url = "http://127.0.0.1:8000/api/debugger/chat"
payload = {
    "session_id": "test-session-123",
    "message": "Hello, what can you help me with?",
    "use_rag": True
}

headers = {
    "Content-Type": "application/json"
}

print("Testing RAG Agent...")
print(f"Sending request to: {url}")
print(f"Payload: {json.dumps(payload, indent=2)}")
print("-" * 50)

try:
    response = requests.post(url, json=payload, headers=headers)
    print(f"Status Code: {response.status_code}")
    print(f"Response Text: {response.text}")
    if response.status_code == 200:
        print(f"Response JSON: {json.dumps(response.json(), indent=2)}")
        print("\n✅ RAG Agent is working correctly!")
    else:
        print(f"Error Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")
