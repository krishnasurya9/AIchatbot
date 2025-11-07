# get_messages.py
import requests

# Replace with your actual conversation_id
conversation_id = "0c730bdc-b594-4b6c-b1e8-50f15ee80dfa"

url = f"http://127.0.0.1:8000/api/conversations/{conversation_id}/messages"

response = requests.get(url)

print("Status Code:", response.status_code)

try:
    # Attempt to print JSON response
    messages = response.json()
    print("Messages:", messages)
except ValueError:
    # Fallback if response is not JSON
    print("Response Text:", response.text)
