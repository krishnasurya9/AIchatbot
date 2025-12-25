# mess.py
import requests

def get_bot_response(message: str) -> str:
    if not message or not message.strip():
        return "Please say something so I can help you."

    msg = message.strip().lower()

    if any(greet in msg for greet in ["hi", "hello", "hey"]):
        return "Hi there! How can I assist you today?"
    elif "how are you" in msg:
        return "I'm doing great! Thanks for asking. How about you?"
    elif "your name" in msg:
        return "I'm your AIchatbot assistant, powered by FastAPI!"
    elif "bye" in msg or "goodbye" in msg:
        return "Goodbye! Have a wonderful day!"
    elif "help" in msg:
        return "Sure! You can ask me about this project or test any query you'd like."
    else:
        return f"You said: {message}"
