# chatbot_demo.py
import requests

BASE_URL = "http://127.0.0.1:8000/api"

def create_user(name: str, email: str) -> str:
    """Create a new user and return user_id."""
    payload = {"name": name, "email": email}
    print(f"➡️ Creating user {name} ({email})...")
    resp = requests.post(f"{BASE_URL}/users", json=payload)
    resp.raise_for_status()
    user = resp.json()
    user_id = user["user_id"]
    print(f"✅ User created: {user_id}")
    return user_id

def create_conversation(user_id: str, title: str = "New Conversation", source: str = "chatbot") -> str:
    """Create a new conversation for a given user."""
    payload = {"title": title, "source": source}
    print(f"➡️ Creating conversation for user {user_id}...")
    resp = requests.post(f"{BASE_URL}/conversations/users/{user_id}/conversations", json=payload)
    resp.raise_for_status()
    conversation = resp.json()
    conversation_id = conversation["conversation_id"]
    print(f"✅ Conversation created: {conversation_id}")
    return conversation_id

def send_message(conversation_id: str, role: str, content: str):
    """Send a message to a conversation."""
    url = f"{BASE_URL}/conversations/{conversation_id}/messages"
    payload = {"role": role, "content": content}
    print(f"➡️ Sending message to conversation {conversation_id}: '{content}'")
    resp = requests.post(url, json=payload, headers={"Content-Type": "application/json"})
    resp.raise_for_status()
    message = resp.json()
    print(f"✅ Message sent: {message}")
    return message

def get_messages(conversation_id: str):
    """Fetch messages from a conversation."""
    url = f"{BASE_URL}/conversations/{conversation_id}/messages"
    print(f"➡️ Fetching messages for conversation {conversation_id}...")
    resp = requests.get(url)
    resp.raise_for_status()
    try:
        messages = resp.json()
        print(f"📄 Messages ({len(messages)}):")
        for msg in messages:
            print(f"[{msg['timestamp']}] {msg['role']}: {msg['content']}")
        return messages
    except ValueError:
        print("❌ Failed to parse JSON response")
        print(resp.text)
        return []

if __name__ == "__main__":
    # Step 1: Create user
    user_name = input("Enter user name: ")
    user_email = input("Enter user email: ")
    user_id = create_user(user_name, user_email)

    # Step 2: Create conversation
    conv_title = input("Enter conversation title: ")
    conversation_id = create_conversation(user_id, title=conv_title)

    # Step 3: Send messages interactively
    while True:
        msg = input("Enter message to send (or 'exit' to finish): ")
        if msg.lower() == "exit":
            break
        send_message(conversation_id, role="user", content=msg)

    # Step 4: Fetch conversation history
    get_messages(conversation_id)
