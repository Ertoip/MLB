from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from llama_cpp import Llama
import json
from typing import Optional

import storage

app = FastAPI(title="Miraculous Chat API")

# CORS configuration to allow frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load model on startup
print("Loading model...")
llm = Llama.from_pretrained(
    repo_id="bartowski/Llama-3.2-3B-Instruct-GGUF",
    filename="*Q4_K_M.gguf",
    chat_format="llama-3",
    verbose=False,
    n_ctx=4096,
)
print("Model loaded!")

# Persona system messages
PERSONAS = {
    "ladybug": {
        "role": "system",
        "content": "Your name is Ladybug. You are a helpful, friendly assistant who always replies in a cheerful and enthusiastic tone. You're optimistic, caring, and always ready to help. You use positive language and occasionally reference being a hero or helping others.",
    },
    "chatnoir": {
        "role": "system", 
        "content": "Your name is Chat Noir. You are a charming, flirty, and cool assistant. You're witty, confident, and love making puns (especially cat puns). You're smooth and suave, often complimenting the user in a playful way. You have a mysterious, confident vibe but are always helpful. You occasionally make references to being a cat or having cat-like qualities.",
    },
}

# Stop sequences to prevent model from generating fake conversation turns
STOP_SEQUENCES = ["<|eot_id|>", "<|start_header_id|>"]


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    persona: str = "ladybug"
    temperature: float = 0.8
    max_tokens: int = 1024


@app.get("/health")
async def health_check():
    return {"status": "ok", "model": "Miraculous Chat (Llama-3.2-3B-Instruct)"}


@app.post("/chat")
async def chat(request: ChatRequest):
    """Non-streaming chat endpoint"""
    # Get persona system message
    system_message = PERSONAS.get(request.persona, PERSONAS["ladybug"])
    
    # Build messages with system prompt
    messages = [system_message] + [msg.model_dump() for msg in request.messages]
    
    response = llm.create_chat_completion(
        messages=messages,
        max_tokens=request.max_tokens,
        temperature=request.temperature,
        stop=STOP_SEQUENCES,
        stream=False,
    )
    
    return {
        "content": response["choices"][0]["message"]["content"],
        "role": "assistant",
    }


@app.post("/chat/stream")
def chat_stream(request: ChatRequest):
    """Streaming chat endpoint using Server-Sent Events"""
    
    def generate():
        # Send immediate acknowledgment so frontend knows we're processing
        yield f"data: {json.dumps({'status': 'thinking'})}\n\n"
        
        # Get persona system message
        system_message = PERSONAS.get(request.persona, PERSONAS["ladybug"])
        
        # Build messages with system prompt
        messages = [system_message] + [msg.model_dump() for msg in request.messages]
        
        stream = llm.create_chat_completion(
            messages=messages,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            stop=STOP_SEQUENCES,
            stream=True,
        )
        
        for chunk in stream:
            delta = chunk["choices"][0].get("delta", {})
            content = delta.get("content", "")
            if content:
                # SSE format: data: {json}\n\n
                yield f"data: {json.dumps({'content': content})}\n\n"
        
        # Signal end of stream
        yield f"data: {json.dumps({'done': True})}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ============== Chat Storage Endpoints ==============

class SaveChatsRequest(BaseModel):
    chats: list


@app.get("/account/exists")
async def account_exists():
    """Check if an account already exists."""
    return {"exists": storage.account_exists()}


@app.post("/chats/load")
async def load_chats(x_password: Optional[str] = Header(None)):
    """Load all chats (requires password in header)."""
    if not x_password:
        raise HTTPException(status_code=400, detail="Password required")
    
    chats, error = storage.load_chats(x_password)
    
    if error == "invalid_password":
        raise HTTPException(status_code=401, detail="Invalid password")
    elif error:
        raise HTTPException(status_code=500, detail=error)
    
    return {"chats": chats}


@app.post("/chats/save")
async def save_chats(request: SaveChatsRequest, x_password: Optional[str] = Header(None)):
    """Save all chats (requires password in header)."""
    if not x_password:
        raise HTTPException(status_code=400, detail="Password required")
    
    success = storage.save_chats(request.chats, x_password)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save chats")
    
    return {"success": True}


@app.delete("/chats/{chat_id}")
async def delete_chat(chat_id: str, x_password: Optional[str] = Header(None)):
    """Delete a specific chat."""
    if not x_password:
        raise HTTPException(status_code=400, detail="Password required")
    
    success, error = storage.delete_chat(chat_id, x_password)
    
    if error == "invalid_password":
        raise HTTPException(status_code=401, detail="Invalid password")
    elif error:
        raise HTTPException(status_code=500, detail=error)
    
    return {"success": success}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
