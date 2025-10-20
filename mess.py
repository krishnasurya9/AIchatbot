# send_message.py
import requests

# Replace with your actual conversation_id
conversation_id = "0c730bdc-b594-4b6c-b1e8-50f15ee80dfa"

url = f"http://127.0.0.1:8000/api/conversations/{conversation_id}/messages"

payload = {
    "role": "user",
    "content": "Hello, AI!"
}

headers = {
    "Content-Type": "application/json"
}

response = requests.post(url, json=payload, headers=headers)

print("Status Code:", response.status_code)
print("Response:", response.json())
