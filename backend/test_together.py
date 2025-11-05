from together import Together
import os
from dotenv import load_dotenv

load_dotenv()
client = Together(api_key=os.getenv("TOGETHER_API_KEY"))

response = client.chat.completions.create(
    model="meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
    messages=[
        {"role": "user", "content": "Say hello from Together AI!"}
    ]
)
print(response.choices[0].message.content)
