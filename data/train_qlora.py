#!/usr/bin/env python3
"""
QLoRA Fine-tuning Script for Llama-3.2-3B-Instruct

Fine-tunes a LoRA adapter on Miraculous Ladybug character dialogue data.

Requirements:
    pip install torch transformers peft bitsandbytes trl accelerate datasets

Usage:
    python train_qlora.py --character ladybug
    python train_qlora.py --character marinette --epochs 3
"""

import argparse
import json
import torch
from pathlib import Path
from datasets import Dataset
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training, PeftModel
from trl import SFTTrainer, SFTConfig

# =============================================================================
# CONFIGURATION
# =============================================================================

MODEL_ID = "meta-llama/Llama-3.2-3B-Instruct"
CHARACTERS = ["marinette", "ladybug", "adrien", "cat_noir"]

# Default training hyperparameters (optimized for ~6GB VRAM)
DEFAULT_CONFIG = {
    "epochs": 3,
    "batch_size": 1,                    # Reduced for low VRAM
    "gradient_accumulation_steps": 8,   # Compensate for small batch
    "learning_rate": 2e-4,
    "max_seq_length": 1024,             # Reduced for low VRAM
    "lora_r": 8,                        # Reduced for low VRAM
    "lora_alpha": 16,
    "lora_dropout": 0.05,
}


# =============================================================================
# DATA LOADING
# =============================================================================

def load_character_data(character: str, data_dir: Path = Path(".progress"), data_file: str = None) -> list[dict]:
    """
    Load processed conversation data for a character.
    
    Args:
        character: Character name (marinette, ladybug, adrien, cat_noir)
        data_dir: Directory containing the cache files
        data_file: Optional path to a specific data file (overrides default)
        
    Returns:
        List of conversation dicts with 'messages' key
    """
    if data_file:
        cache_file = Path(data_file)
    else:
        cache_file = data_dir / f"{character}_enhanced_cache.json"
    
    if not cache_file.exists():
        raise FileNotFoundError(
            f"No data found for {character}. Run preprocess.py first.\n"
            f"Expected file: {cache_file}"
        )
    
    with open(cache_file, 'r') as f:
        data = json.load(f)
    
    # Extract just the messages for training
    conversations = [{"messages": item["messages"]} for item in data]
    
    print(f"Loaded {len(conversations)} conversations from {cache_file}")
    return conversations


def format_chat_template(example: dict, tokenizer) -> str:
    """
    Format a conversation using the model's chat template.
    
    Args:
        example: Dict with 'messages' key containing list of role/content dicts
        tokenizer: The tokenizer with chat template
        
    Returns:
        Formatted string ready for training
    """
    return tokenizer.apply_chat_template(
        example["messages"],
        tokenize=False,
        add_generation_prompt=False
    )


# =============================================================================
# MODEL SETUP
# =============================================================================

def load_model_and_tokenizer(model_id: str = MODEL_ID, low_memory: bool = True):
    """
    Load Llama model with 4-bit quantization for QLoRA training.
    
    Args:
        model_id: HuggingFace model identifier
        low_memory: Use extra memory optimizations for small GPUs (< 8GB)
        
    Returns:
        Tuple of (model, tokenizer)
    """
    print(f"Loading model: {model_id}")
    
    # Clear any cached memory
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    
    # 4-bit quantization config for QLoRA
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.float16,  # Use float16 instead of bfloat16 for older GPUs
        bnb_4bit_use_double_quant=True,
    )
    
    # Load tokenizer
    tokenizer = AutoTokenizer.from_pretrained(model_id)
    tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"
    
    # Load model with quantization
    model = AutoModelForCausalLM.from_pretrained(
        model_id,
        quantization_config=bnb_config,
        device_map="auto",
        torch_dtype=torch.float16,
        trust_remote_code=True,
        low_cpu_mem_usage=True,  # Reduces CPU RAM during loading
    )
    
    # Prepare model for k-bit training
    model = prepare_model_for_kbit_training(model)
    
    # Print memory usage
    if torch.cuda.is_available():
        allocated = torch.cuda.memory_allocated() / 1024**3
        reserved = torch.cuda.memory_reserved() / 1024**3
        print(f"GPU Memory: {allocated:.2f}GB allocated, {reserved:.2f}GB reserved")
    
    print(f"Model loaded on device: {model.device}")
    return model, tokenizer


def setup_lora(model, config: dict):
    """
    Configure and apply LoRA adapters to the model.
    
    Args:
        model: The base model
        config: Dict with lora_r, lora_alpha, lora_dropout
        
    Returns:
        Model with LoRA adapters
    """
    lora_config = LoraConfig(
        r=config["lora_r"],
        lora_alpha=config["lora_alpha"],
        lora_dropout=config["lora_dropout"],
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=[
            "q_proj", "k_proj", "v_proj", "o_proj",  # Attention
            "gate_proj", "up_proj", "down_proj",      # MLP
        ],
    )
    
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()
    
    return model


# =============================================================================
# TRAINING
# =============================================================================

def train(
    character: str,
    output_dir: str = None,
    config: dict = None,
    resume_from_checkpoint: bool = False,
    data_file: str = None,
    resume_adapter: str = None,
):
    """
    Run QLoRA fine-tuning for a character.
    
    Args:
        character: Character to train (marinette, ladybug, adrien, cat_noir)
        output_dir: Directory to save the adapter
        config: Training configuration dict
        resume_from_checkpoint: Whether to resume from last checkpoint
        data_file: Optional path to custom training data file
        resume_adapter: Path to existing adapter to continue training from
    """
    config = config or DEFAULT_CONFIG
    output_dir = output_dir or f"./adapters/{character}"
    
    # Load data
    conversations = load_character_data(character, data_file=data_file)
    dataset = Dataset.from_list(conversations)
    
    # Split into train/eval (90/10)
    split = dataset.train_test_split(test_size=0.1, seed=42)
    train_dataset = split["train"]
    eval_dataset = split["test"]
    
    print(f"Train: {len(train_dataset)}, Eval: {len(eval_dataset)}")
    
    # Load model and tokenizer
    model, tokenizer = load_model_and_tokenizer()
    
    # Apply LoRA - either fresh or from existing adapter
    if resume_adapter:
        print(f"Loading existing adapter from: {resume_adapter}")
        model = PeftModel.from_pretrained(model, resume_adapter, is_trainable=True)
        model.print_trainable_parameters()
    else:
        model = setup_lora(model, config)
    
    # Format dataset with chat template
    def formatting_func(example):
        return format_chat_template(example, tokenizer)
    
    # SFTConfig combines training args with SFT-specific settings
    # Optimized for low VRAM (~6GB)
    sft_config = SFTConfig(
        output_dir=output_dir,
        num_train_epochs=config["epochs"],
        per_device_train_batch_size=config["batch_size"],
        per_device_eval_batch_size=config["batch_size"],
        gradient_accumulation_steps=config["gradient_accumulation_steps"],
        learning_rate=config["learning_rate"],
        weight_decay=0.01,
        warmup_ratio=0.03,
        lr_scheduler_type="cosine",
        logging_steps=10,
        save_steps=100,
        eval_strategy="steps",
        eval_steps=100,
        save_total_limit=2,             # Reduced to save disk space
        fp16=False,                     # Disable mixed precision to avoid dtype issues
        bf16=False,
        gradient_checkpointing=True,
        gradient_checkpointing_kwargs={"use_reentrant": False},
        optim="paged_adamw_8bit",
        report_to="none",               # Set to "wandb" if you want W&B logging
        push_to_hub=False,
        dataloader_pin_memory=False,    # Reduce memory usage
        # SFT-specific settings
        max_length=config["max_seq_length"],
        packing=False,
        dataset_text_field="text",      # Will be set by formatting_func
    )
    
    # Create trainer
    trainer = SFTTrainer(
        model=model,
        args=sft_config,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        processing_class=tokenizer,
        formatting_func=formatting_func,
    )
    
    # Train
    print(f"\nStarting training for {character}...")
    print(f"Output directory: {output_dir}")
    
    trainer.train(resume_from_checkpoint=resume_from_checkpoint)
    
    # Save final adapter
    trainer.save_model()
    tokenizer.save_pretrained(output_dir)
    
    print(f"\nTraining complete! Adapter saved to: {output_dir}")
    
    return trainer


# =============================================================================
# INFERENCE (for testing)
# =============================================================================

def test_inference(adapter_path: str, prompt: str = "Hello, how are you?"):
    """
    Test the trained adapter with a simple inference.
    
    Args:
        adapter_path: Path to the saved LoRA adapter
        prompt: Test prompt to generate response
    """
    from peft import PeftModel
    
    print(f"Loading adapter from: {adapter_path}")
    
    # Load base model
    model, tokenizer = load_model_and_tokenizer()
    
    # Load LoRA adapter
    model = PeftModel.from_pretrained(model, adapter_path)
    model.eval()
    
    # Format as chat
    messages = [
        {"role": "system", "content": "You are Ladybug, the superhero of Paris."},
        {"role": "user", "content": prompt}
    ]
    
    input_text = tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=True
    )
    
    inputs = tokenizer(input_text, return_tensors="pt").to(model.device)
    
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=256,
            do_sample=True,
            temperature=0.7,
            top_p=0.9,
            pad_token_id=tokenizer.eos_token_id,
        )
    
    response = tokenizer.decode(outputs[0], skip_special_tokens=True)
    print(f"\nPrompt: {prompt}")
    print(f"\nResponse: {response}")
    
    return response


# =============================================================================
# CLI
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Fine-tune Llama-3.2-3B-Instruct with QLoRA on character data"
    )
    
    parser.add_argument(
        "--character", "-c",
        type=str,
        required=True,
        choices=CHARACTERS,
        help="Character to train"
    )
    
    parser.add_argument(
        "--output-dir", "-o",
        type=str,
        default=None,
        help="Output directory for adapter (default: ./adapters/{character})"
    )
    
    parser.add_argument(
        "--epochs",
        type=int,
        default=DEFAULT_CONFIG["epochs"],
        help="Number of training epochs"
    )
    
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_CONFIG["batch_size"],
        help="Training batch size"
    )
    
    parser.add_argument(
        "--learning-rate", "-lr",
        type=float,
        default=DEFAULT_CONFIG["learning_rate"],
        help="Learning rate"
    )
    
    parser.add_argument(
        "--lora-r",
        type=int,
        default=DEFAULT_CONFIG["lora_r"],
        help="LoRA rank"
    )
    
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Resume from last checkpoint (same data, continue training)"
    )
    
    parser.add_argument(
        "--resume-adapter",
        type=str,
        default=None,
        metavar="ADAPTER_PATH",
        help="Path to existing adapter to continue training with new data"
    )
    
    parser.add_argument(
        "--data-file", "-d",
        type=str,
        default=None,
        help="Path to custom training data JSON file (overrides default cache)"
    )
    
    parser.add_argument(
        "--test",
        type=str,
        default=None,
        metavar="ADAPTER_PATH",
        help="Test inference with a trained adapter"
    )
    
    args = parser.parse_args()
    
    # Test mode
    if args.test:
        test_inference(args.test)
        return
    
    # Training mode
    config = DEFAULT_CONFIG.copy()
    config["epochs"] = args.epochs
    config["batch_size"] = args.batch_size
    config["learning_rate"] = args.learning_rate
    config["lora_r"] = args.lora_r
    
    train(
        character=args.character,
        output_dir=args.output_dir,
        config=config,
        resume_from_checkpoint=args.resume,
        data_file=args.data_file,
        resume_adapter=args.resume_adapter,
    )


if __name__ == "__main__":
    main()
