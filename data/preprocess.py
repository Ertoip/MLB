#!/usr/bin/env python3
"""
Miraculous Ladybug Data Preprocessing Pipeline

This script preprocesses scraped transcript data for LLM fine-tuning:
1. Rule-based cleaning (removes visual directions, keeps emotional cues)
2. Claude API enhancement (naturalizes dialogue)
3. System prompt generation (personality-focused prompts per character)
4. Train/Val/Test splitting (85/10/5)

Output: JSONL files ready for QLoRA fine-tuning on Llama-3.2-3B

Author: MLB Data Pipeline
License: MIT
"""

import json
import os
import re
import time
import random
import hashlib
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import Optional
from dotenv import load_dotenv
import anthropic
import logging
from tqdm import tqdm

# =============================================================================
# CONFIGURATION
# =============================================================================

# Load environment variables from .env file
load_dotenv()

# Logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Directory paths
INPUT_DIR = Path("output")          # Scraped data from scrape_miraculous.py
OUTPUT_DIR = Path("training")       # Processed training data
PROGRESS_DIR = Path(".progress")    # Progress tracking for resumability

# API configuration
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-3-5-haiku-latest")
RATE_LIMIT_RPM = int(os.getenv("RATE_LIMIT_RPM", "50"))

# Data split ratios
TRAIN_RATIO = 0.85
VAL_RATIO = 0.10
TEST_RATIO = 0.05

# Character configuration
CHARACTERS = ["ladybug", "cat_noir", "marinette", "adrien"]

# =============================================================================
# EMOTIONAL KEYWORD ROOTS
# =============================================================================

# Word roots for emotional/meaningful stage directions to KEEP
# We check if any of these roots appear in the parenthetical content
# Using roots means "laugh" matches "laughs", "laughing", "laughed", etc.
EMOTIONAL_ROOTS = [
    # Vocal expressions
    'laugh', 'chuckle', 'giggle', 'snicker', 'chortle',
    'sigh', 'gasp', 'groan', 'moan', 'grunt',
    'scream', 'yell', 'shout', 'shriek', 'squeal',
    'whisper', 'murmur', 'mumble', 'mutter', 'stutter', 'stammer',
    'cry', 'sob', 'weep', 'sniffle', 'whimper',
    'cough', 'sneeze', 'yawn', 'hiccup',
    
    # Emotional states
    'nervous', 'anxious', 'worried', 'scared', 'frighten', 'terrif',
    'excite', 'happy', 'joy', 'delight', 'thrill',
    'sad', 'depress', 'upset', 'disappoint',
    'angry', 'furious', 'annoyed', 'irritat', 'frustrat',
    'surpris', 'shock', 'stun', 'astonish',
    'confus', 'puzzl', 'perplex', 'bewilder',
    'embarrass', 'ashamed', 'humiliat',
    'proud', 'confident', 'determined', 'resolute',
    'relieved', 'calm', 'relaxed', 'content',
    'desperate', 'hopeless', 'helpless',
    'jealous', 'envious',
    'disgust', 'revolt', 'sicken',
    
    # Manner of speaking/acting
    'sarcastic', 'ironic', 'mock', 'teas', 'taunt',
    'playful', 'flirt', 'coy', 'seduct',
    'serious', 'solemn', 'grave', 'stern',
    'gentle', 'soft', 'tender', 'kind',
    'firm', 'harsh', 'cold', 'bitter', 'cruel',
    'warm', 'loving', 'affection',
    'dramatic', 'theatric',
    'defensive', 'aggressive',
    'dismissive', 'contempt',
    'thoughtful', 'pensive', 'reflect',
    'hesitant', 'reluctant', 'uncertain', 'unsure',
    'eager', 'enthusiastic',
    'quiet', 'loud', 'hushed',
    'pleading', 'begging', 'implor',
    'reassur', 'comfort', 'sooth', 'console',
    
    # Facial expressions
    'smil', 'grin', 'beam', 'smirk',  # 'smil' matches smile, smiles, smiling
    'frown', 'scowl', 'glare', 'glower',
    'pout', 'sulk',
    'blush', 'flush', 'redden',
    'wink', 'blink',
    'tear', 'teary', 'watery eyes',
    'roll eyes', 'eye roll',
    
    # Physical gestures (emotional ones)
    'nod', 'shake head', 'shrug',
    'hug', 'embrace', 'hold', 'squeeze',
    'kiss', 'peck',
    'clap', 'applaud',
    'punch', 'slap', 'hit',  # emotional reactions
    'tremble', 'shiver', 'shudder', 'shake',
    'clench', 'grip', 'tighten',
    
    # Mental/emotional actions
    'realize', 'understand', 'comprehend',
    'remember', 'recall', 'reminisce',
    'notice', 'observe',
    'think', 'ponder', 'consider', 'contemplate',
    'decide', 'resolve',
    'hesitate', 'pause', 'falter',
    'interrupt', 'interject',
    'continue', 'resume',
    
    # Breathing
    'breath', 'exhale', 'inhale', 'pant', 'wheeze',
    'clear throat', 'gulp', 'swallow',
]

# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class RawConversation:
    """Represents a raw conversation from scraped data."""
    id: str
    scene: str
    conversation: str


@dataclass
class CleanedConversation:
    """Represents a cleaned multi-turn conversation ready for enhancement."""
    id: str
    scene: str
    turns: list                 # List of {"role": "user"|"assistant", "content": str}
    character: str              # Which character class this belongs to
    original_conversation: str  # Full original conversation for reference


@dataclass
class EnhancedConversation:
    """Represents a fully processed conversation ready for training."""
    id: str
    messages: list = field(default_factory=list)  # [system, user, assistant]


@dataclass
class ProcessingProgress:
    """Tracks processing progress for resumability."""
    character: str
    processed_ids: set = field(default_factory=set)
    total_count: int = 0
    processed_count: int = 0
    
    def to_dict(self) -> dict:
        return {
            "character": self.character,
            "processed_ids": list(self.processed_ids),
            "total_count": self.total_count,
            "processed_count": self.processed_count
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "ProcessingProgress":
        progress = cls(
            character=data["character"],
            total_count=data.get("total_count", 0),
            processed_count=data.get("processed_count", 0)
        )
        progress.processed_ids = set(data.get("processed_ids", []))
        return progress


# =============================================================================
# CLEANING FUNCTIONS
# =============================================================================

def clean_html_entities(text: str) -> str:
    """
    Replace HTML entities with their corresponding characters.
    
    Args:
        text: Input text potentially containing HTML entities
        
    Returns:
        Text with HTML entities replaced
        
    Example:
        >>> clean_html_entities("Tom &amp; Sabine")
        "Tom & Sabine"
    """
    replacements = {
        "&amp;": "&",
        "&lt;": "<",
        "&gt;": ">",
        "&quot;": '"',
        "&#39;": "'",
        "&apos;": "'",
        "&nbsp;": " ",
    }
    for entity, char in replacements.items():
        text = text.replace(entity, char)
    return text


def contains_emotional_root(text: str) -> bool:
    """
    Check if text contains any emotional keyword root.
    
    Uses simple substring matching with word roots, so "laugh" will match
    "laughs", "laughing", "laughed", etc.
    
    Args:
        text: The content inside parentheses (without the parentheses)
        
    Returns:
        True if any emotional root is found
        
    Example:
        >>> contains_emotional_root("laughs nervously")
        True
        >>> contains_emotional_root("camera pans to window")
        False
    """
    text_lower = text.lower()
    return any(root in text_lower for root in EMOTIONAL_ROOTS)


def clean_stage_directions(text: str) -> str:
    """
    Process all stage directions: keep emotional ones, remove the rest.
    
    Simple approach:
    1. Find all parenthetical expressions (...)
    2. Check if they contain any emotional keyword root
    3. Keep if emotional, remove if not
    
    Args:
        text: Input text with stage directions in parentheses
        
    Returns:
        Text with only emotional stage directions remaining
        
    Example:
        >>> clean_stage_directions("Hello (walks to door) (nervously) how are you?")
        "Hello (nervously) how are you?"
        >>> clean_stage_directions("Hi (camera pans left) (laughs) there")
        "Hi (laughs) there"
    """
    def replace_parenthetical(match):
        """Keep parenthetical if it contains emotional content, else remove."""
        full_match = match.group(0)  # Including parentheses: "(laughs)"
        inner_content = match.group(1)  # Without parentheses: "laughs"
        
        if contains_emotional_root(inner_content):
            return full_match  # Keep it
        return ''  # Remove it
    
    # Find all (...) and decide whether to keep each one
    result = re.sub(r'\(([^)]+)\)', replace_parenthetical, text)
    
    # Clean up whitespace (multiple spaces) BUT preserve newlines
    # Replace multiple spaces (not newlines) with single space
    result = re.sub(r'[^\S\n]+', ' ', result)  # Replace non-newline whitespace
    result = re.sub(r' *\n *', '\n', result)    # Clean spaces around newlines
    result = re.sub(r'\n{3,}', '\n\n', result)  # Max 2 consecutive newlines
    return result.strip()


def parse_conversation_lines(conversation: str) -> list[tuple[str, str]]:
    """
    Parse a conversation string into a list of (speaker, text) tuples.
    
    Handles the format "Speaker: dialogue text" and properly extracts
    both the speaker name and their dialogue.
    
    Args:
        conversation: Multi-line conversation string
        
    Returns:
        List of (speaker, text) tuples
        
    Example:
        >>> parse_conversation_lines("Marinette: Hi!\\nAdrien: Hello!")
        [("Marinette", "Hi!"), ("Adrien", "Hello!")]
    """
    lines = conversation.strip().split('\n')
    parsed = []
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Find the first colon that separates speaker from dialogue
        colon_idx = line.find(':')
        if colon_idx > 0:
            speaker = line[:colon_idx].strip()
            text = line[colon_idx + 1:].strip()
            parsed.append((speaker, text))
        else:
            # Line without colon - might be continuation or narration
            # Skip these for now
            pass
    
    return parsed


def is_target_character(speaker: str, character: str) -> bool:
    """
    Check if a speaker name matches the target character.
    
    Handles variations in character names (e.g., "Marinette", "Marinete", "Mari").
    
    Args:
        speaker: Speaker name from the conversation
        character: Target character class (marinette, ladybug, etc.)
        
    Returns:
        True if the speaker is the target character
    """
    # Character name variations for matching
    char_names = {
        "marinette": ["marinette", "marinete", "mari"],
        "ladybug": ["ladybug", "lady bug", "lb"],
        "adrien": ["adrien"],
        "cat_noir": ["cat noir", "chat noir", "cat noir's"]
    }
    
    names = char_names.get(character, [character])
    speaker_lower = speaker.lower().strip()
    
    return any(speaker_lower == name or speaker_lower.startswith(name) for name in names)


def extract_multi_turn_conversation(conversation: str, character: str) -> list[dict]:
    """
    Extract a full multi-turn conversation as user/assistant turns.
    
    Converts a conversation with multiple speakers into alternating
    user/assistant format where:
    - assistant = target character's lines
    - user = all other characters' lines (merged if consecutive)
    
    Args:
        conversation: Multi-line conversation string
        character: The target character class (marinette, ladybug, etc.)
        
    Returns:
        List of {"role": "user"|"assistant", "content": str} dicts
        
    Example:
        >>> extract_multi_turn_conversation(
        ...     "Adrien: Hi!\\nMarinette: Hey!\\nAdrien: How are you?\\nMarinette: Good!",
        ...     "marinette"
        ... )
        [
            {"role": "user", "content": "Hi!"},
            {"role": "assistant", "content": "Hey!"},
            {"role": "user", "content": "How are you?"},
            {"role": "assistant", "content": "Good!"}
        ]
    """
    # Parse into (speaker, text) pairs
    parsed_lines = parse_conversation_lines(conversation)
    
    if len(parsed_lines) < 2:
        return []
    
    turns = []
    current_role = None
    current_content = []
    
    for speaker, text in parsed_lines:
        # Determine role based on whether this is our target character
        if is_target_character(speaker, character):
            role = "assistant"
        else:
            role = "user"
        
        # If same role as previous, merge the content
        if role == current_role:
            current_content.append(text)
        else:
            # Save previous turn if exists
            if current_role is not None and current_content:
                turns.append({
                    "role": current_role,
                    "content": " ".join(current_content)
                })
            # Start new turn
            current_role = role
            current_content = [text]
    
    # Don't forget the last turn
    if current_role is not None and current_content:
        turns.append({
            "role": current_role,
            "content": " ".join(current_content)
        })
    
    # Validate: need at least one user and one assistant turn
    has_user = any(t["role"] == "user" for t in turns)
    has_assistant = any(t["role"] == "assistant" for t in turns)
    
    if not (has_user and has_assistant):
        return []
    
    # Ensure conversation starts with user (if starts with assistant, drop that first turn)
    if turns and turns[0]["role"] == "assistant":
        turns = turns[1:]
    
    # Ensure we still have valid turns after trimming
    if len(turns) < 2:
        return []
    
    return turns


def clean_conversation(raw: RawConversation, character: str) -> Optional[CleanedConversation]:
    """
    Apply all cleaning steps to a raw conversation.
    
    This is the main cleaning pipeline that:
    1. Cleans HTML entities
    2. Removes visual stage directions
    3. Keeps emotional cues
    4. Extracts multi-turn user/assistant conversation
    5. Validates the result
    
    Args:
        raw: RawConversation object from scraped data
        character: Target character class
        
    Returns:
        CleanedConversation if valid, None if should be skipped
    """
    # Clean the conversation text
    cleaned_conv = clean_html_entities(raw.conversation)
    cleaned_conv = clean_stage_directions(cleaned_conv)
    cleaned_scene = clean_html_entities(raw.scene)
    cleaned_scene = clean_stage_directions(cleaned_scene)
    
    # Extract multi-turn conversation
    turns = extract_multi_turn_conversation(cleaned_conv, character)
    
    # Validate: need at least 2 turns (one user, one assistant)
    if len(turns) < 2:
        return None
    
    # Check that at least one assistant response is substantial
    assistant_turns = [t for t in turns if t["role"] == "assistant"]
    if not any(len(t["content"].strip()) >= 5 for t in assistant_turns):
        return None
    
    return CleanedConversation(
        id=raw.id,
        scene=cleaned_scene,
        turns=turns,
        character=character,
        original_conversation=raw.conversation
    )


# =============================================================================
# CLAUDE API FUNCTIONS
# =============================================================================

class ClaudeClient:
    """
    Wrapper for Anthropic Claude API with rate limiting and error handling.
    
    This class handles all interactions with the Claude API, including:
    - Rate limiting to avoid API errors
    - Automatic retries on transient failures
    - Structured prompting for dialogue enhancement
    """
    
    def __init__(self, api_key: str, model: str = CLAUDE_MODEL, rpm: int = RATE_LIMIT_RPM):
        """
        Initialize the Claude client.
        
        Args:
            api_key: Anthropic API key
            model: Claude model to use (default: claude-3-haiku)
            rpm: Rate limit in requests per minute
        """
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = model
        self.rpm = rpm
        self.min_interval = 60.0 / rpm  # Minimum seconds between requests
        self.last_request_time = 0
    
    def _rate_limit(self):
        """Ensure we don't exceed the rate limit."""
        elapsed = time.time() - self.last_request_time
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)
        self.last_request_time = time.time()
    
    def _call_api(self, system: str, user: str, max_retries: int = 3) -> Optional[str]:
        """
        Make an API call with rate limiting and retries.
        
        Args:
            system: System prompt for Claude
            user: User message to send
            max_retries: Number of retries on failure
            
        Returns:
            Claude's response text, or None on failure
        """
        for attempt in range(max_retries):
            try:
                self._rate_limit()
                
                response = self.client.messages.create(
                    model=self.model,
                    max_tokens=1024,
                    system=system,
                    messages=[{"role": "user", "content": user}]
                )
                
                return response.content[0].text.strip()
                
            except anthropic.RateLimitError:
                wait_time = (2 ** attempt) * 10  # Exponential backoff
                logger.warning(f"Rate limited. Waiting {wait_time}s before retry...")
                time.sleep(wait_time)
                
            except anthropic.APIError as e:
                logger.error(f"API error: {e}")
                if attempt < max_retries - 1:
                    time.sleep(5)
                else:
                    return None
                    
            except Exception as e:
                logger.error(f"Unexpected error: {e}")
                return None
        
        return None
    
    def naturalize_dialogue(self, cleaned: CleanedConversation) -> Optional[list[dict]]:
        """
        Use Claude to rewrite a multi-turn conversation into natural dialogue.
        
        This sends the entire conversation to Claude with instructions
        to rewrite it as a coherent, natural back-and-forth dialogue while
        preserving the character's personality.
        
        Args:
            cleaned: CleanedConversation with multi-turn conversation
            
        Returns:
            List of {"role": "user"|"assistant", "content": str} dicts, or None on failure
        """
        character_descriptions = {
            "marinette": "Marinette, a creative and clumsy teenage girl who gets flustered around her crush Adrien",
            "ladybug": "Ladybug, a confident and quick-thinking superhero who protects Paris",
            "adrien": "Adrien, a kind and somewhat sheltered teenage model who is genuinely nice to everyone",
            "cat_noir": "Cat Noir, a flirty and playful superhero who loves making cat puns"
        }
        
        char_desc = character_descriptions.get(cleaned.character, cleaned.character)
        
        # Format the original conversation for the prompt
        original_conv_text = ""
        for turn in cleaned.turns:
            role_label = "USER" if turn["role"] == "user" else "ASSISTANT"
            original_conv_text += f"{role_label}: {turn['content']}\n"
        
        system_prompt = """You are an expert dialogue writer preparing training data for a character chatbot.

Your task is to REWRITE a multi-turn conversation into natural, coherent dialogue.

IMPORTANT RULES:

1. MAINTAIN THE SAME NUMBER OF TURNS - If the input has 4 turns (USER, ASSISTANT, USER, ASSISTANT), output exactly 4 turns in the same order.

2. ONLY SPOKEN WORDS - Write ONLY what characters SAY. This is a text chatbot, not a screenplay.

3. NO PHYSICAL ACTIONS - Never write things like "*pushes you*", "*grabs your hand*", "*runs to the door*", "*looks around nervously*". These are FORBIDDEN.

4. ONLY THESE BRIEF CUES ARE ALLOWED: *laughs*, *sighs*, *gasps*, *giggles*, *groans*, *chuckles*, *nods*, *smiles*. Nothing else. One word only, maximum two words.

5. EXPAND THE DIALOGUE - The original transcript may be choppy. Add more spoken words, sentences, and conversational filler to make it natural and complete.

6. KEEP THE MEANING - Preserve the core meaning and emotional tone, but heavily rewrite to make it coherent and conversational.

7. MAKE IT FLOW - Each turn should naturally follow the previous one as a real conversation.

8. CHARACTER VOICE - The ASSISTANT turns must sound like the character with their verbal quirks and personality.

GOOD: "Oh! *laughs* I didn't expect to see you here! How have you been?"
BAD: "*nervously fidgets and looks around before speaking* Hi there."

OUTPUT FORMAT - Return ONLY the rewritten conversation:
USER: [rewritten line]
ASSISTANT: [rewritten line]
...

No quotes, no explanations, no extra text."""

        user_prompt = f"""CHARACTER (for ASSISTANT turns): {char_desc}

SCENE CONTEXT: {cleaned.scene}

ORIGINAL CONVERSATION TO REWRITE:
{original_conv_text}
Rewrite this conversation to be natural and coherent while keeping the same number of turns:"""

        response = self._call_api(system_prompt, user_prompt)
        
        if not response:
            return None
        
        # Parse the response back into turns
        new_turns = []
        lines = response.strip().split('\n')
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            if line.upper().startswith("USER:"):
                content = line[5:].strip()
                if content:
                    new_turns.append({"role": "user", "content": content})
            elif line.upper().startswith("ASSISTANT:"):
                content = line[10:].strip()
                if content:
                    new_turns.append({"role": "assistant", "content": content})
        
        # Validate we got a reasonable result
        if len(new_turns) < 2:
            return None
        
        has_user = any(t["role"] == "user" for t in new_turns)
        has_assistant = any(t["role"] == "assistant" for t in new_turns)
        
        if not (has_user and has_assistant):
            return None
        
        return new_turns
    
    def generate_system_prompts_batch(self, character: str, sample_conversations: list[CleanedConversation], num_prompts: int = 10) -> list[str]:
        """
        Generate multiple varied system prompts for a character.
        
        Creates a batch of different system prompts to prevent overfitting
        from having identical system messages across all training data.
        
        Args:
            character: Character class name
            sample_conversations: List of sample conversations to analyze
            num_prompts: Number of different prompts to generate (default: 10)
            
        Returns:
            List of generated system prompt strings
        """
        # Character info with lore for better system prompts
        character_info = {
            "marinette": {
                "name": "Marinette Dupain-Cheng",
                "lore": """Marinette is a Parisian teenager who secretly transforms into the superhero Ladybug using her Miraculous earrings and kwami Tikki. 
In her civilian life, she's a clumsy, creative aspiring fashion designer who has a massive crush on Adrien Agreste and gets tongue-tied around him.
She's half-Chinese, her parents own a bakery, and her best friend is Alya. She's the class representative and fiercely protective of her friends.
As Marinette, she stammers, rambles, and often says things wrong when nervous. She's determined, kind-hearted, and sometimes overthinks situations."""
            },
            "ladybug": {
                "name": "Ladybug",
                "lore": """Ladybug is the superhero identity of Marinette Dupain-Cheng, wielding the Miraculous of Creation. She protects Paris from akumatized villains created by Hawk Moth/Shadow Moth.
Her powers include Lucky Charm (summoning a random object to solve problems) and Miraculous Ladybug (repairing all damage after battle).
She partners with Cat Noir, whom she calls "kitty" or "chaton", and is the guardian of the Miracle Box. She's confident, strategic, and quick-thinking in battle.
She has complicated feelings for Cat Noir but is focused on their mission. Her catchphrase is "Spots on!" to transform and "Miraculous Ladybug!" when using her restoration power."""
            },
            "adrien": {
                "name": "Adrien Agreste", 
                "lore": """Adrien is a famous teenage model and the son of fashion mogul Gabriel Agreste. He secretly transforms into Cat Noir using his ring Miraculous and kwami Plagg.
He lost his mother Emilie and has an emotionally distant, controlling father. Despite his wealth and fame, he's lonely and sheltered, having been homeschooled most of his life.
He attends Collège Françoise Dupont where he made his first real friends: Nino (his best friend), Marinette, and Alya. He's kind, patient, and sees the good in everyone.
He's fluent in Chinese, plays piano, and fences. He's oblivious to Marinette's crush on him but treasures her as a friend."""
            },
            "cat_noir": {
                "name": "Cat Noir",
                "lore": """Cat Noir (Chat Noir in French) is the superhero identity of Adrien Agreste, wielding the Miraculous of Destruction. His power is Cataclysm, which destroys anything he touches.
He's deeply in love with Ladybug, calling her "m'lady", "bugaboo", and constantly flirting with her despite her rejections. He's her loyal partner and would sacrifice himself for her.
As Cat Noir, he's free from his restrictive civilian life - playful, punny, and full of cat-themed jokes and wordplay. He's brave, sometimes reckless, and fiercely loyal.
His kwami is Plagg, who loves Camembert cheese. His catchphrase is "Claws out!" to transform. He wears a black suit with cat ears and a belt tail."""
            }
        }
        
        char_data = character_info.get(character, {"name": character, "lore": ""})
        char_name = char_data["name"]
        char_lore = char_data["lore"]
        
        # Format sample conversations for the prompt (using multi-turn structure)
        samples = []
        for c in sample_conversations[:15]:
            conv_text = ""
            for turn in c.turns:
                role = "User" if turn["role"] == "user" else "Assistant"
                conv_text += f"{role}: {turn['content']}\n"
            samples.append(conv_text.strip())
        samples_text = "\n\n---\n\n".join(samples)
        
        system_prompt = """You are an expert at writing character roleplay system prompts for AI chatbots.

Your task is to write MULTIPLE different system prompts for the same character. Each prompt MUST:

1. START WITH THE CHARACTER'S NAME - Always begin with "You are [Character Name]" using their actual name.

2. INCLUDE SHOW-SPECIFIC DETAILS - Reference the Miraculous Ladybug universe: transformations, powers, relationships, kwamis, Paris setting, etc.

3. DESCRIBE SPEECH PATTERNS - How they talk: verbal quirks, catchphrases, how they address others, stammering (for Marinette), puns (for Cat Noir), etc.

4. BE 2-3 SENTENCES - Concise but specific.

5. BE UNIQUE - Each prompt should emphasize different aspects of the character.

Return ONLY numbered prompts like:
1. You are [Name]...
2. You are [Name]...
3. You are [Name]..."""

        user_prompt = f"""CHARACTER: {char_name}

BACKGROUND LORE:
{char_lore}

EXAMPLE DIALOGUE (showing how they speak):
{samples_text}

Write {num_prompts} DIFFERENT system prompts for {char_name}. Each must mention their name and include Miraculous Ladybug universe details:"""

        response = self._call_api(system_prompt, user_prompt)
        
        if not response:
            return []
        
        # Parse the numbered prompts
        prompts = []
        lines = response.strip().split('\n')
        for line in lines:
            # Remove numbering like "1. " or "1) " or just numbers
            line = line.strip()
            if not line:
                continue
            # Remove common numbering patterns
            import re
            cleaned = re.sub(r'^[\d]+[\.\)]\s*', '', line)
            if cleaned and len(cleaned) > 20:  # Must be substantial
                prompts.append(cleaned)
        
        return prompts if prompts else []
    
    def generate_system_prompt(self, character: str, sample_conversations: list[CleanedConversation]) -> Optional[str]:
        """
        Generate a single personality-focused system prompt for a character.
        (Legacy method - kept for compatibility)
        
        Args:
            character: Character class name
            sample_conversations: List of sample conversations to analyze
            
        Returns:
            Generated system prompt string, or None on failure
        """
        prompts = self.generate_system_prompts_batch(character, sample_conversations, num_prompts=1)
        return prompts[0] if prompts else None


# =============================================================================
# PROGRESS TRACKING (RESUMABILITY)
# =============================================================================

class ProgressTracker:
    """
    Tracks processing progress for resumability.
    
    This class saves progress to disk so that if the script is interrupted,
    it can resume from where it left off rather than reprocessing everything.
    """
    
    def __init__(self, progress_dir: Path = PROGRESS_DIR):
        """
        Initialize the progress tracker.
        
        Args:
            progress_dir: Directory to store progress files
        """
        self.progress_dir = progress_dir
        self.progress_dir.mkdir(exist_ok=True)
    
    def _get_progress_file(self, character: str) -> Path:
        """Get the progress file path for a character."""
        return self.progress_dir / f"{character}_progress.json"
    
    def load_progress(self, character: str) -> ProcessingProgress:
        """
        Load progress for a character, or create new if none exists.
        
        Args:
            character: Character class name
            
        Returns:
            ProcessingProgress object
        """
        progress_file = self._get_progress_file(character)
        
        if progress_file.exists():
            try:
                with open(progress_file, 'r') as f:
                    data = json.load(f)
                return ProcessingProgress.from_dict(data)
            except (json.JSONDecodeError, KeyError) as e:
                logger.warning(f"Could not load progress for {character}: {e}")
        
        return ProcessingProgress(character=character)
    
    def save_progress(self, progress: ProcessingProgress):
        """
        Save progress to disk.
        
        Args:
            progress: ProcessingProgress object to save
        """
        progress_file = self._get_progress_file(progress.character)
        
        with open(progress_file, 'w') as f:
            json.dump(progress.to_dict(), f, indent=2)
    
    def mark_processed(self, progress: ProcessingProgress, conversation_id: str):
        """
        Mark a conversation as processed and save progress.
        
        Args:
            progress: ProcessingProgress object
            conversation_id: ID of the processed conversation
        """
        progress.processed_ids.add(conversation_id)
        progress.processed_count = len(progress.processed_ids)
        self.save_progress(progress)
    
    def is_processed(self, progress: ProcessingProgress, conversation_id: str) -> bool:
        """
        Check if a conversation has already been processed.
        
        Args:
            progress: ProcessingProgress object
            conversation_id: ID to check
            
        Returns:
            True if already processed
        """
        return conversation_id in progress.processed_ids
    
    def clear_progress(self, character: str):
        """
        Clear progress for a character (start fresh).
        
        Args:
            character: Character class name
        """
        progress_file = self._get_progress_file(character)
        if progress_file.exists():
            progress_file.unlink()


# =============================================================================
# DATA SPLITTING
# =============================================================================

def split_data(
    conversations: list[EnhancedConversation],
    train_ratio: float = TRAIN_RATIO,
    val_ratio: float = VAL_RATIO,
    test_ratio: float = TEST_RATIO,
    seed: int = 42
) -> tuple[list, list, list]:
    """
    Split conversations into train/val/test sets.
    
    Uses stratified splitting by episode (extracted from conversation ID)
    to ensure variety across all splits.
    
    Args:
        conversations: List of EnhancedConversation objects
        train_ratio: Proportion for training (default 0.85)
        val_ratio: Proportion for validation (default 0.10)
        test_ratio: Proportion for test (default 0.05)
        seed: Random seed for reproducibility
        
    Returns:
        Tuple of (train_list, val_list, test_list)
    """
    assert abs(train_ratio + val_ratio + test_ratio - 1.0) < 0.001, \
        "Ratios must sum to 1.0"
    
    random.seed(seed)
    
    # Group by episode (extracted from ID like "action_ladybug_0001" -> "action")
    episodes = {}
    for conv in conversations:
        # Extract episode from ID (everything before the character name)
        parts = conv.id.rsplit('_', 2)
        episode = parts[0] if len(parts) >= 3 else "unknown"
        
        if episode not in episodes:
            episodes[episode] = []
        episodes[episode].append(conv)
    
    # Shuffle episodes and conversations within episodes
    episode_list = list(episodes.keys())
    random.shuffle(episode_list)
    
    for ep in episode_list:
        random.shuffle(episodes[ep])
    
    # Flatten back into a single list (shuffled by episode groups)
    shuffled = []
    for ep in episode_list:
        shuffled.extend(episodes[ep])
    
    # Split
    n = len(shuffled)
    train_end = int(n * train_ratio)
    val_end = train_end + int(n * val_ratio)
    
    train = shuffled[:train_end]
    val = shuffled[train_end:val_end]
    test = shuffled[val_end:]
    
    return train, val, test


# =============================================================================
# OUTPUT FUNCTIONS
# =============================================================================

def save_jsonl(conversations: list[EnhancedConversation], filepath: Path):
    """
    Save conversations to a JSONL file.
    
    Each line in the output file is a valid JSON object containing
    the messages array in the format expected by SFTTrainer.
    
    Args:
        conversations: List of EnhancedConversation objects
        filepath: Output file path
    """
    filepath.parent.mkdir(parents=True, exist_ok=True)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        for conv in conversations:
            # Format for Llama-3.2 / trl SFTTrainer
            data = {"messages": conv.messages}
            f.write(json.dumps(data, ensure_ascii=False) + '\n')
    
    logger.info(f"Saved {len(conversations)} conversations to {filepath}")


def save_system_prompts(prompts: dict[str, list[str]], filepath: Path):
    """
    Save generated system prompts to a JSON file.
    
    Args:
        prompts: Dictionary mapping character names to list of system prompts
        filepath: Output file path
    """
    filepath.parent.mkdir(parents=True, exist_ok=True)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(prompts, f, indent=2, ensure_ascii=False)
    
    logger.info(f"Saved system prompts to {filepath}")


# =============================================================================
# MAIN PIPELINE
# =============================================================================

class PreprocessingPipeline:
    """
    Main preprocessing pipeline orchestrator.
    
    This class coordinates the entire preprocessing workflow:
    1. Loading raw data
    2. Cleaning conversations
    3. Enhancing with Claude API
    4. Generating system prompts
    5. Splitting data
    6. Saving output files
    """
    
    def __init__(
        self,
        input_dir: Path = INPUT_DIR,
        output_dir: Path = OUTPUT_DIR,
        api_key: Optional[str] = None
    ):
        """
        Initialize the preprocessing pipeline.
        
        Args:
            input_dir: Directory containing scraped JSON files
            output_dir: Directory for output JSONL files
            api_key: Anthropic API key (or loaded from env)
        """
        self.input_dir = input_dir
        self.output_dir = output_dir
        self.output_dir.mkdir(exist_ok=True)
        
        # Initialize Claude client
        key = api_key or ANTHROPIC_API_KEY
        if not key:
            raise ValueError(
                "Anthropic API key not found. Set ANTHROPIC_API_KEY in .env file "
                "or pass api_key parameter."
            )
        self.claude = ClaudeClient(api_key=key)
        
        # Initialize progress tracker
        self.progress_tracker = ProgressTracker()
        
        # Storage for system prompts
        self.system_prompts: dict[str, str] = {}
    
    def load_raw_conversations(self, character: str) -> list[RawConversation]:
        """
        Load raw conversations for a character from JSON file.
        
        Args:
            character: Character class name
            
        Returns:
            List of RawConversation objects
        """
        filepath = self.input_dir / f"{character}_conversations.json"
        
        if not filepath.exists():
            logger.warning(f"No data file found for {character} at {filepath}")
            return []
        
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        conversations = []
        for item in data:
            conversations.append(RawConversation(
                id=item['id'],
                scene=item.get('scene', ''),
                conversation=item['conversation']
            ))
        
        logger.info(f"Loaded {len(conversations)} conversations for {character}")
        return conversations
    
    def process_character(self, character: str) -> list[EnhancedConversation]:
        """
        Process all conversations for a single character.
        
        This method:
        1. Loads raw data
        2. Cleans each conversation
        3. Enhances with Claude API (with resumability)
        4. Returns the enhanced conversations
        
        Args:
            character: Character class name
            
        Returns:
            List of EnhancedConversation objects
        """
        logger.info(f"\n{'='*60}")
        logger.info(f"Processing character: {character}")
        logger.info(f"{'='*60}")
        
        # Load raw data
        raw_conversations = self.load_raw_conversations(character)
        if not raw_conversations:
            return []
        
        # Load progress
        progress = self.progress_tracker.load_progress(character)
        progress.total_count = len(raw_conversations)
        
        logger.info(f"Progress: {progress.processed_count}/{progress.total_count} already processed")
        
        # Clean conversations
        cleaned = []
        for raw in raw_conversations:
            result = clean_conversation(raw, character)
            if result:
                cleaned.append(result)
        
        logger.info(f"Cleaned {len(cleaned)} valid conversations (from {len(raw_conversations)} raw)")
        
        # Generate system prompt if not already done
        # Generate batch of system prompts for variety (prevents overfitting)
        NUM_SYSTEM_PROMPTS = 10
        
        if character not in self.system_prompts and cleaned:
            logger.info(f"Generating {NUM_SYSTEM_PROMPTS} varied system prompts for {character}...")
            # Use a sample of conversations for prompt generation
            sample = cleaned[:min(15, len(cleaned))]
            prompts = self.claude.generate_system_prompts_batch(character, sample, num_prompts=NUM_SYSTEM_PROMPTS)
            
            if prompts:
                self.system_prompts[character] = prompts
                logger.info(f"Generated {len(prompts)} system prompts. First: {prompts[0][:80]}...")
            else:
                # Fallback to default prompts (as a list)
                default = self._get_default_system_prompt(character)
                self.system_prompts[character] = [default]
                logger.warning(f"Using default system prompt for {character}")
        
        system_prompts_list = self.system_prompts.get(character, [""])
        
        # Enhance conversations with Claude
        enhanced = []
        
        # First, load any already-processed conversations from cache
        cache_file = PROGRESS_DIR / f"{character}_enhanced_cache.json"
        cached_enhanced = {}
        if cache_file.exists():
            try:
                with open(cache_file, 'r') as f:
                    cached_data = json.load(f)
                cached_enhanced = {item['id']: item for item in cached_data}
                logger.info(f"Loaded {len(cached_enhanced)} cached enhanced conversations")
            except Exception as e:
                logger.warning(f"Could not load cache: {e}")
        
        # Process conversations
        to_process = [c for c in cleaned if not self.progress_tracker.is_processed(progress, c.id)]
        logger.info(f"Need to process {len(to_process)} new conversations")
        
        # Counter for rotating through system prompts
        prompt_counter = 0
        
        for conv in tqdm(cleaned, desc=f"Enhancing {character}"):
            # Check cache first
            if conv.id in cached_enhanced:
                enhanced.append(EnhancedConversation(
                    id=conv.id,
                    messages=cached_enhanced[conv.id]['messages']
                ))
                continue
            
            # Check if already processed
            if self.progress_tracker.is_processed(progress, conv.id):
                continue
            
            # Select system prompt (rotate through the batch)
            current_system_prompt = system_prompts_list[prompt_counter % len(system_prompts_list)]
            prompt_counter += 1
            
            # Enhance with Claude (returns list of turns)
            enhanced_turns = self.claude.naturalize_dialogue(conv)
            
            if enhanced_turns:
                # Create the message structure: system prompt + all turns
                messages = [{"role": "system", "content": current_system_prompt}]
                messages.extend(enhanced_turns)
                
                enhanced_conv = EnhancedConversation(
                    id=conv.id,
                    messages=messages
                )
                enhanced.append(enhanced_conv)
                
                # Update cache
                cached_enhanced[conv.id] = {
                    'id': conv.id,
                    'messages': messages
                }
            else:
                # Fallback: use cleaned but not enhanced version
                messages = [{"role": "system", "content": current_system_prompt}]
                messages.extend(conv.turns)
                enhanced.append(EnhancedConversation(id=conv.id, messages=messages))
            
            # Mark as processed
            self.progress_tracker.mark_processed(progress, conv.id)
            
            # Save cache after EVERY conversation (for safety)
            with open(cache_file, 'w') as f:
                json.dump(list(cached_enhanced.values()), f, ensure_ascii=False, indent=2)
        
        # Final cache save
        with open(cache_file, 'w') as f:
            json.dump(list(cached_enhanced.values()), f)
        
        logger.info(f"Enhanced {len(enhanced)} conversations for {character}")
        return enhanced
    
    def _get_default_system_prompt(self, character: str) -> str:
        """Get a default system prompt for a character if API generation fails."""
        defaults = {
            "marinette": (
                "You are a creative and kind-hearted teenage girl who is passionate about fashion design. "
                "You tend to get flustered and stutter when nervous, especially around your crush. "
                "You're fiercely loyal to your friends and always try to help others, even if you're clumsy about it."
            ),
            "ladybug": (
                "You are a confident and quick-thinking superhero who protects Paris from villains. "
                "You're resourceful, brave, and always find creative solutions to problems. "
                "You work as a team with Cat Noir, often calling him 'kitty' affectionately while keeping him focused on the mission."
            ),
            "adrien": (
                "You are a kind and genuine teenage boy who tries to see the best in everyone. "
                "Despite being a famous model, you're down-to-earth and sometimes naive about normal teenage life. "
                "You're polite, considerate, and always willing to help your friends."
            ),
            "cat_noir": (
                "You are a playful and flirtatious superhero who loves making cat puns and jokes. "
                "You're loyal and brave in battle, but also enjoy teasing and flirting with Ladybug, calling her 'm'lady' and 'bugaboo'. "
                "You use humor to lighten tense situations and your catchphrase is 'Cataclysm!' when using your power."
            )
        }
        return defaults.get(character, "You are a helpful assistant who responds naturally and conversationally.")
    
    def run(self, characters: Optional[list[str]] = None):
        """
        Run the full preprocessing pipeline.
        
        Args:
            characters: List of characters to process (default: all)
        """
        characters = characters or CHARACTERS
        
        logger.info(f"Starting preprocessing pipeline for: {characters}")
        logger.info(f"Input directory: {self.input_dir}")
        logger.info(f"Output directory: {self.output_dir}")
        
        all_results = {}
        
        # Process each character
        for character in characters:
            enhanced = self.process_character(character)
            if enhanced:
                all_results[character] = enhanced
        
        # Split and save for each character
        for character, conversations in all_results.items():
            logger.info(f"\nSplitting data for {character}...")
            
            train, val, test = split_data(conversations)
            
            logger.info(f"  Train: {len(train)}, Val: {len(val)}, Test: {len(test)}")
            
            # Save JSONL files
            save_jsonl(train, self.output_dir / f"{character}_train.jsonl")
            save_jsonl(val, self.output_dir / f"{character}_val.jsonl")
            save_jsonl(test, self.output_dir / f"{character}_test.jsonl")
        
        # Save system prompts
        save_system_prompts(self.system_prompts, self.output_dir / "system_prompts.json")
        
        # Print summary
        logger.info(f"\n{'='*60}")
        logger.info("PREPROCESSING COMPLETE")
        logger.info(f"{'='*60}")
        
        for character, conversations in all_results.items():
            train, val, test = split_data(conversations)
            logger.info(f"\n{character.upper()}:")
            logger.info(f"  Total: {len(conversations)}")
            logger.info(f"  Train: {len(train)} ({len(train)/len(conversations)*100:.1f}%)")
            logger.info(f"  Val: {len(val)} ({len(val)/len(conversations)*100:.1f}%)")
            logger.info(f"  Test: {len(test)} ({len(test)/len(conversations)*100:.1f}%)")
        
        logger.info(f"\nOutput files saved to: {self.output_dir}")


# =============================================================================
# CLI ENTRY POINT
# =============================================================================

def main():
    """Main entry point for the preprocessing script."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Preprocess Miraculous Ladybug data for LLM fine-tuning',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Process all characters
  python preprocess.py
  
  # Process specific characters only
  python preprocess.py --characters marinette ladybug
  
  # Clear progress and start fresh
  python preprocess.py --clear-progress
  
  # Dry run (no API calls, just cleaning)
  python preprocess.py --dry-run
        """
    )
    
    parser.add_argument(
        '--characters', '-c',
        nargs='+',
        choices=CHARACTERS,
        default=None,
        help='Characters to process (default: all)'
    )
    
    parser.add_argument(
        '--input', '-i',
        type=Path,
        default=INPUT_DIR,
        help='Input directory with scraped data'
    )
    
    parser.add_argument(
        '--output', '-o',
        type=Path,
        default=OUTPUT_DIR,
        help='Output directory for training data'
    )
    
    parser.add_argument(
        '--clear-progress',
        action='store_true',
        help='Clear all progress and start fresh'
    )
    
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Only clean data, skip API enhancement'
    )
    
    args = parser.parse_args()
    
    # Clear progress if requested
    if args.clear_progress:
        tracker = ProgressTracker()
        for char in CHARACTERS:
            tracker.clear_progress(char)
            cache_file = PROGRESS_DIR / f"{char}_enhanced_cache.json"
            if cache_file.exists():
                cache_file.unlink()
        logger.info("Cleared all progress")
    
    # Check for API key
    if not args.dry_run and not ANTHROPIC_API_KEY:
        logger.error(
            "ANTHROPIC_API_KEY not found. Please set it in .env file.\n"
            "Copy .env.example to .env and add your API key."
        )
        return 1
    
    # Run pipeline
    try:
        pipeline = PreprocessingPipeline(
            input_dir=args.input,
            output_dir=args.output
        )
        pipeline.run(characters=args.characters)
        return 0
    except Exception as e:
        logger.error(f"Pipeline failed: {e}")
        raise


if __name__ == "__main__":
    exit(main())
