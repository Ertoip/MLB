#!/usr/bin/env python3
"""
Interactive Chat with Trained Character Adapters

Chat with your fine-tuned Miraculous Ladybug character models.

Usage:
    python chat.py --character ladybug
    python chat.py --character marinette --system "You are Marinette at school."
"""

import argparse
import torch
from pathlib import Path
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from peft import PeftModel

# =============================================================================
# CONFIGURATION
# =============================================================================

MODEL_ID = "meta-llama/Llama-3.2-3B-Instruct"
ADAPTERS_DIR = Path("./adapters")
CHARACTERS = ["marinette", "ladybug", "adrien", "cat_noir"]

# Default system prompts for each character
DEFAULT_SYSTEM_PROMPTS = {
    "marinette": (
        "You are Marinette Dupain-Cheng, a creative and clumsy Parisian teenager. "
        "You get flustered and stutter when nervous, especially around your crush Adrien. "
        "You're kind, determined, and fiercely loyal to your friends."
    ),
    "ladybug": (
        "You are Ladybug, the superhero of Paris who wields the Miraculous of Creation. "
        "You're confident, quick-thinking, and work alongside your partner Cat Noir to protect the city. "
        "You call him 'kitty' affectionately and use Lucky Charm to solve problems."
    ),
    "adrien": (
        "You are Adrien Agreste, a kind and genuine teenage model. "
        "Despite your fame, you're down-to-earth and sometimes naive about normal life. "
        "You're polite, considerate, and always see the best in people."
    ),
    "cat_noir": (
        "You are Cat Noir, the flirty superhero of Paris who wields the Miraculous of Destruction. "
        "You love making cat puns and flirting with Ladybug, calling her 'm'lady' and 'bugaboo'. "
        "You're brave, playful, and fiercely loyal to your partner."
    ),
}


# =============================================================================
# MODEL LOADING
# =============================================================================

def load_model(character: str):
    """
    Load the base model with the character's LoRA adapter.
    
    Args:
        character: Character name (marinette, ladybug, adrien, cat_noir)
        
    Returns:
        Tuple of (model, tokenizer)
    """
    adapter_path = ADAPTERS_DIR / character
    
    if not adapter_path.exists():
        raise FileNotFoundError(
            f"No adapter found for {character} at {adapter_path}\n"
            f"Train one first with: python train_qlora.py --character {character}"
        )
    
    print(f"Loading base model: {MODEL_ID}")
    
    # Clear GPU memory
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    
    # 4-bit quantization for inference
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.float16,
        bnb_4bit_use_double_quant=True,
    )
    
    # Load base model
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        quantization_config=bnb_config,
        device_map="auto",
        torch_dtype=torch.float16,
        low_cpu_mem_usage=True,
    )
    
    print(f"Loading adapter: {adapter_path}")
    model = PeftModel.from_pretrained(model, adapter_path)
    model.eval()
    
    # Load tokenizer
    tokenizer = AutoTokenizer.from_pretrained(adapter_path)
    tokenizer.pad_token = tokenizer.eos_token
    
    if torch.cuda.is_available():
        allocated = torch.cuda.memory_allocated() / 1024**3
        print(f"GPU Memory: {allocated:.2f}GB allocated")
    
    return model, tokenizer


# =============================================================================
# GENERATION
# =============================================================================

def generate_response(
    model,
    tokenizer,
    messages: list[dict],
    max_new_tokens: int = 256,
    temperature: float = 0.7,
    top_p: float = 0.9,
) -> str:
    """
    Generate a response from the model.
    
    Args:
        model: The loaded model
        tokenizer: The tokenizer
        messages: List of message dicts with 'role' and 'content'
        max_new_tokens: Maximum tokens to generate
        temperature: Sampling temperature (higher = more random)
        top_p: Top-p sampling parameter
        
    Returns:
        Generated response text
    """
    # Apply chat template
    input_text = tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=True,
    )
    
    # Tokenize
    inputs = tokenizer(input_text, return_tensors="pt").to(model.device)
    
    # Generate
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            temperature=temperature,
            top_p=top_p,
            do_sample=True,
            pad_token_id=tokenizer.eos_token_id,
            eos_token_id=tokenizer.eos_token_id,
        )
    
    # Decode only the new tokens
    input_length = inputs["input_ids"].shape[1]
    response = tokenizer.decode(outputs[0][input_length:], skip_special_tokens=True)
    
    return response.strip()


# =============================================================================
# INTERACTIVE CHAT
# =============================================================================

def chat_loop(model, tokenizer, system_prompt: str, character: str):
    """
    Run an interactive chat loop.
    
    Args:
        model: The loaded model
        tokenizer: The tokenizer
        system_prompt: System prompt for the character
        character: Character name (for display)
    """
    print("\n" + "=" * 60)
    print(f"  Chatting with {character.upper()}")
    print("=" * 60)
    print(f"\nSystem: {system_prompt[:100]}...")
    print("\nType 'quit' or 'exit' to end the conversation.")
    print("Type 'clear' to start a new conversation.")
    print("Type 'system <new prompt>' to change the system prompt.")
    print("-" * 60 + "\n")
    
    messages = [{"role": "system", "content": system_prompt}]
    
    while True:
        try:
            user_input = input("You: ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\n\nGoodbye!")
            break
        
        if not user_input:
            continue
        
        # Commands
        if user_input.lower() in ["quit", "exit"]:
            print("\nGoodbye!")
            break
        
        if user_input.lower() == "clear":
            messages = [{"role": "system", "content": system_prompt}]
            print("\n[Conversation cleared]\n")
            continue
        
        if user_input.lower().startswith("system "):
            new_system = user_input[7:].strip()
            if new_system:
                system_prompt = new_system
                messages = [{"role": "system", "content": system_prompt}]
                print(f"\n[System prompt updated: {system_prompt[:50]}...]\n")
            continue
        
        # Add user message
        messages.append({"role": "user", "content": user_input})
        
        # Generate response
        print(f"\n{character.title()}: ", end="", flush=True)
        response = generate_response(model, tokenizer, messages)
        print(response)
        print()
        
        # Add assistant response to history
        messages.append({"role": "assistant", "content": response})


# =============================================================================
# SINGLE QUERY MODE
# =============================================================================

def single_query(model, tokenizer, system_prompt: str, query: str, character: str):
    """
    Run a single query and print the response.
    
    Args:
        model: The loaded model
        tokenizer: The tokenizer
        system_prompt: System prompt for the character
        query: User query
        character: Character name (for display)
    """
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": query},
    ]
    
    print(f"\nYou: {query}")
    print(f"\n{character.title()}: ", end="", flush=True)
    response = generate_response(model, tokenizer, messages)
    print(response)
    print()


# =============================================================================
# CLI
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Chat with trained Miraculous Ladybug character models"
    )
    
    parser.add_argument(
        "--character", "-c",
        type=str,
        required=True,
        choices=CHARACTERS,
        help="Character to chat with"
    )
    
    parser.add_argument(
        "--system", "-s",
        type=str,
        default=None,
        help="Custom system prompt (uses default if not provided)"
    )
    
    parser.add_argument(
        "--query", "-q",
        type=str,
        default=None,
        help="Single query mode (no interactive chat)"
    )
    
    parser.add_argument(
        "--temperature", "-t",
        type=float,
        default=0.7,
        help="Sampling temperature (default: 0.7)"
    )
    
    args = parser.parse_args()
    
    # Load model
    model, tokenizer = load_model(args.character)
    
    # Get system prompt
    system_prompt = args.system or DEFAULT_SYSTEM_PROMPTS[args.character]
    
    # Run chat
    if args.query:
        single_query(model, tokenizer, system_prompt, args.query, args.character)
    else:
        chat_loop(model, tokenizer, system_prompt, args.character)


if __name__ == "__main__":
    main()
