from openai import OpenAI
from dotenv import load_dotenv
import os

load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


video_file = client.files.create(
    file=open("image.png", "rb"),
    purpose="vision"
)

response = client.responses.create(
    model="gpt-4.1-mini",
    input=[{  # type: ignore
        "role": "user",
        "content": [
            {
                "type": "input_text",
                "text": "Describe the entire scene"
            },
            {
                "type": "input_image",
                "file_id": video_file.id
            }
        ]
    }]
)

print(response.output_text)