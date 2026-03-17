#!/usr/bin/env python3
"""
Miraculous Ladybug Transcript Scraper for LLM Fine-Tuning

Extracts back-and-forth conversations for 4 character classes:
- Marinette (civilian)
- Ladybug (hero)
- Adrien (civilian)
- Cat Noir (hero)

Output: JSON/CSV with id, scene, and conversation (with context)
Only captures true back-and-forth between exactly 2 characters.
"""

import json
import csv
import re
import time
import requests
from bs4 import BeautifulSoup
from pathlib import Path
from dataclasses import dataclass, asdict
from collections import defaultdict
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

BASE_URL = "https://miraculousladybug.fandom.com"
API_URL = f"{BASE_URL}/api.php"
OUTPUT_DIR = Path("output")
REQUEST_DELAY = 1.5

# Character classes with aliases
CHARACTER_CLASSES = {
    "marinette": {
        "canonical": "Marinette",
        "aliases": [
            "marinette", "marinette dupain-cheng", "marinette dupain cheng",
            "mari", "marinette's", "marinete"
        ]
    },
    "ladybug": {
        "canonical": "Ladybug",
        "aliases": [
            "ladybug", "lady bug", "lb", "ladybug's",
            "lady noir", "multimouse", "multibug", "pennybug",
            "cosmobug", "aquabug", "dragon bug"
        ]
    },
    "adrien": {
        "canonical": "Adrien",
        "aliases": [
            "adrien", "adrien agreste", "adrien's"
        ]
    },
    "cat_noir": {
        "canonical": "Cat Noir",
        "aliases": [
            "cat noir", "chat noir", "cat noir's", "chat noir's",
            "mister bug", "aspik", "snake noir",
            "aqua noir", "ice noir", "astro cat"
        ]
    }
}

def build_character_lookup() -> dict:
    lookup = {}
    for class_key, data in CHARACTER_CLASSES.items():
        for alias in data["aliases"]:
            lookup[alias.lower()] = class_key
    return lookup

CHARACTER_LOOKUP = build_character_lookup()


@dataclass
class DialogueLine:
    """Single line of dialogue or scene marker."""
    character: str  # Character name or "SCENE" for scene descriptions
    text: str
    character_class: str | None
    is_scene: bool = False  # True if this is a scene description
    line_index: int = 0  # Position in the original transcript


@dataclass
class Conversation:
    """Back-and-forth conversation with context and scene."""
    id: str
    scene: str  # Scene description
    conversation: str  # Includes context line + back-and-forth


class MiraculousScraper:
    
    def __init__(self, output_dir: Path = OUTPUT_DIR):
        self.output_dir = output_dir
        self.output_dir.mkdir(exist_ok=True)
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Connection': 'keep-alive',
        })
        self.conversations: dict[str, list[Conversation]] = defaultdict(list)
        
    def get_transcript_pages(self) -> list[dict]:
        """Fetch all transcript page titles from the wiki API."""
        logger.info("Fetching transcript page list from API...")
        
        all_pages = []
        continue_token = None
        
        while True:
            params = {
                'action': 'query',
                'list': 'categorymembers',
                'cmtitle': 'Category:Episode_transcripts',
                'cmlimit': '500',
                'format': 'json'
            }
            
            if continue_token:
                params['cmcontinue'] = continue_token
            
            response = self.session.get(API_URL, params=params)
            response.raise_for_status()
            data = response.json()
            
            members = data.get('query', {}).get('categorymembers', [])
            
            for page in members:
                if page['ns'] == 0 and page['title'].endswith('/Transcript'):
                    all_pages.append({
                        'pageid': page['pageid'],
                        'title': page['title'],
                        'episode': page['title'].replace('/Transcript', '')
                    })
            
            if 'continue' in data:
                continue_token = data['continue'].get('cmcontinue')
            else:
                break
        
        logger.info(f"Found {len(all_pages)} transcript pages")
        return all_pages
    
    def fetch_transcript(self, page_title: str) -> str | None:
        """Fetch HTML content of a transcript page via MediaWiki API."""
        params = {
            'action': 'parse',
            'page': page_title,
            'format': 'json',
            'prop': 'text'
        }
        
        try:
            response = self.session.get(API_URL, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            if 'error' in data:
                logger.error(f"API error for {page_title}: {data['error']}")
                return None
            
            # The API returns the HTML in parse.text.*
            html = data.get('parse', {}).get('text', {}).get('*', '')
            return html
        except requests.RequestException as e:
            logger.error(f"Failed to fetch {page_title}: {e}")
            return None
    
    def parse_transcript(self, html: str) -> list[DialogueLine]:
        """Parse dialogue lines AND scene markers from transcript HTML."""
        soup = BeautifulSoup(html, 'lxml')
        
        content = soup.find('div', class_='mw-parser-output')
        if not content:
            return []
        
        all_lines = []
        line_index = 0
        
        # Process all elements in order to maintain sequence
        for element in content.children:
            if element.name == 'div' and 'poem' in element.get('class', []):
                # Dialogue container
                lines = self._extract_lines_from_poem(element, line_index)
                for line in lines:
                    line.line_index = line_index
                    all_lines.append(line)
                    line_index += 1
            elif element.name == 'p':
                # Could be dialogue or contain scene markers
                lines = self._extract_lines_from_element(element, line_index)
                for line in lines:
                    line.line_index = line_index
                    all_lines.append(line)
                    line_index += 1
            elif element.name == 'center':
                # Often contains scene descriptions
                scene = self._extract_scene_from_element(element)
                if scene:
                    all_lines.append(DialogueLine(
                        character="SCENE",
                        text=scene,
                        character_class=None,
                        is_scene=True,
                        line_index=line_index
                    ))
                    line_index += 1
        
        return all_lines
    
    def _extract_scene_from_element(self, element) -> str | None:
        """Extract scene description from an element."""
        html_content = str(element)
        
        # Look for Scene: pattern in italics
        scene_pattern = r'<i>\s*Scene:\s*(.*?)</i>'
        match = re.search(scene_pattern, html_content, re.DOTALL | re.IGNORECASE)
        
        if match:
            scene_text = match.group(1)
            # Clean HTML
            scene_text = re.sub(r'<a[^>]*>([^<]*)</a>', r'\1', scene_text)
            scene_text = re.sub(r'<[^>]+>', '', scene_text)
            scene_text = re.sub(r'\s+', ' ', scene_text).strip()
            return scene_text
        
        return None
    
    def _extract_lines_from_poem(self, poem, start_index: int) -> list[DialogueLine]:
        """Extract dialogue lines and scene markers from a poem div."""
        lines = []
        html_content = str(poem)
        
        # First, extract any scene descriptions
        scene_pattern = r'<i>\s*Scene:\s*(.*?)</i>'
        for match in re.finditer(scene_pattern, html_content, re.DOTALL | re.IGNORECASE):
            scene_text = match.group(1)
            scene_text = re.sub(r'<a[^>]*>([^<]*)</a>', r'\1', scene_text)
            scene_text = re.sub(r'<[^>]+>', '', scene_text)
            scene_text = re.sub(r'\s+', ' ', scene_text).strip()
            if scene_text:
                lines.append(DialogueLine(
                    character="SCENE",
                    text=scene_text,
                    character_class=None,
                    is_scene=True
                ))
        
        # Pattern: <b>Character:</b> or <b><a>Character</a>:</b>
        pattern = r'<b>(?:<a[^>]*>)?([^<:]+)(?:</a>)?:?</b>:?\s*(.*?)(?=<br\s*/?>|</p>|<b>(?:<a[^>]*>)?[^<:]+(?:</a>)?:?</b>|$)'
        
        matches = re.findall(pattern, html_content, re.DOTALL | re.IGNORECASE)
        
        for character, text in matches:
            character = character.strip()
            text = self._clean_dialogue_text(text)
            
            # Skip non-dialogue entries
            if not character or not text:
                continue
            if character.startswith('[') or character.startswith('('):
                continue
            if any(skip in character.lower() for skip in [
                'sequence', 'scene', 'theme song', 'end card', 
                'title card', 'eyecatch', 'opening', 'ending'
            ]):
                continue
            
            char_class = self._identify_character_class(character)
            lines.append(DialogueLine(
                character=character,
                text=text,
                character_class=char_class,
                is_scene=False
            ))
        
        return lines
    
    def _extract_lines_from_element(self, element, start_index: int) -> list[DialogueLine]:
        """Extract dialogue lines from a generic element."""
        lines = []
        html_content = str(element)
        
        # First check for scene descriptions
        scene_pattern = r'<i>\s*Scene:\s*(.*?)</i>'
        for match in re.finditer(scene_pattern, html_content, re.DOTALL | re.IGNORECASE):
            scene_text = match.group(1)
            scene_text = re.sub(r'<a[^>]*>([^<]*)</a>', r'\1', scene_text)
            scene_text = re.sub(r'<[^>]+>', '', scene_text)
            scene_text = re.sub(r'\s+', ' ', scene_text).strip()
            if scene_text:
                lines.append(DialogueLine(
                    character="SCENE",
                    text=scene_text,
                    character_class=None,
                    is_scene=True
                ))
        
        # Then extract dialogue
        pattern = r'<b>(?:<a[^>]*>)?([^<:]+)(?:</a>)?:?</b>:?\s*(.*?)(?=<br\s*/?>|</p>|<b>(?:<a[^>]*>)?[^<:]+(?:</a>)?:?</b>|$)'
        
        matches = re.findall(pattern, html_content, re.DOTALL | re.IGNORECASE)
        
        for character, text in matches:
            character = character.strip()
            text = self._clean_dialogue_text(text)
            
            if not character or not text:
                continue
            if character.startswith('[') or character.startswith('('):
                continue
            if any(skip in character.lower() for skip in [
                'sequence', 'scene', 'theme song', 'end card', 
                'title card', 'eyecatch', 'opening', 'ending'
            ]):
                continue
            
            char_class = self._identify_character_class(character)
            lines.append(DialogueLine(
                character=character,
                text=text,
                character_class=char_class,
                is_scene=False
            ))
        
        return lines
    
    def _clean_dialogue_text(self, text: str) -> str:
        """Clean HTML from dialogue text."""
        if not text:
            return ""
        
        # Replace <i>...</i> with (...)
        text = re.sub(r'<i>\s*\(', '(', text)
        text = re.sub(r'\)\s*</i>', ')', text)
        text = re.sub(r'<i>', '(', text)
        text = re.sub(r'</i>', ')', text)
        
        # Remove links but keep text
        text = re.sub(r'<a[^>]*>([^<]*)</a>', r'\1', text)
        
        # Remove remaining HTML tags
        text = re.sub(r'<[^>]+>', '', text)
        
        # Clean up whitespace
        text = re.sub(r'\s+', ' ', text)
        text = text.strip()
        text = text.strip('.,;:')
        
        return text.strip()
    
    def _identify_character_class(self, character_name: str) -> str | None:
        """Identify which character class a name belongs to."""
        name_lower = character_name.lower().strip()
        
        # Direct lookup
        if name_lower in CHARACTER_LOOKUP:
            return CHARACTER_LOOKUP[name_lower]
        
        # Check if name contains any alias
        for alias, class_key in CHARACTER_LOOKUP.items():
            if alias in name_lower or name_lower in alias:
                return class_key
        
        return None
    
    def _find_current_scene(self, all_lines: list[DialogueLine], current_index: int) -> str:
        """Find the most recent scene description before the current index."""
        for i in range(current_index - 1, -1, -1):
            if all_lines[i].is_scene:
                return all_lines[i].text
        return ""  # No scene found
    
    def _find_context_line(self, all_lines: list[DialogueLine], current_index: int) -> DialogueLine | None:
        """Find the previous dialogue line (not scene) for context."""
        for i in range(current_index - 1, -1, -1):
            if not all_lines[i].is_scene:
                return all_lines[i]
        return None
    
    def extract_back_and_forth(
        self, 
        all_lines: list[DialogueLine], 
        episode: str
    ) -> list[tuple[str, Conversation]]:
        """
        Extract true back-and-forth conversations with context and scene.
        
        Rules:
        - Exactly 2 characters alternating (A -> B -> A -> B...)
        - At least 2 turns
        - Include one previous line for context
        - Include current scene description
        - Only save for target character if THEY speak first
        """
        conversations = []
        conv_counter = defaultdict(int)
        
        # Filter out scene markers for dialogue processing, but keep track of indices
        dialogue_lines = [(i, line) for i, line in enumerate(all_lines) if not line.is_scene]
        
        idx = 0
        while idx < len(dialogue_lines) - 1:
            orig_idx, first_line = dialogue_lines[idx]
            
            # Start a potential back-and-forth
            char_a = first_line.character
            char_a_class = first_line.character_class
            
            # Build the back-and-forth sequence
            sequence = [(orig_idx, first_line)]
            char_b = None
            char_b_class = None
            j = idx + 1
            
            while j < len(dialogue_lines):
                curr_orig_idx, current = dialogue_lines[j]
                _, prev = sequence[-1]
                
                if len(sequence) == 1:
                    # Second line: must be different character
                    if current.character == char_a:
                        break
                    char_b = current.character
                    char_b_class = current.character_class
                    sequence.append((curr_orig_idx, current))
                else:
                    # Must alternate strictly between char_a and char_b
                    expected = char_a if prev.character == char_b else char_b
                    if current.character != expected:
                        break
                    sequence.append((curr_orig_idx, current))
                
                j += 1
            
            # Valid if at least 2 turns and target character speaks first
            if len(sequence) >= 2 and char_a_class:
                first_orig_idx = sequence[0][0]
                
                # Find current scene
                scene = self._find_current_scene(all_lines, first_orig_idx)
                
                # Find context line (one previous message)
                context_line = self._find_context_line(all_lines, first_orig_idx)
                
                # Build conversation text with context
                conv_parts = []
                if context_line:
                    conv_parts.append(f"{context_line.character}: {context_line.text}")
                
                for _, line in sequence:
                    conv_parts.append(f"{line.character}: {line.text}")
                
                conv_text = "\n".join(conv_parts)
                
                # Create conversation
                episode_slug = re.sub(r'[^a-z0-9]+', '_', episode.lower())
                conv_counter[char_a_class] += 1
                conv_id = f"{episode_slug}_{char_a_class}_{conv_counter[char_a_class]:04d}"
                
                conversations.append((char_a_class, Conversation(
                    id=conv_id,
                    scene=scene,
                    conversation=conv_text
                )))
            
            # Move forward
            idx = j if len(sequence) >= 2 else idx + 1
        
        return conversations
    
    def process_all_transcripts(self, limit: int | None = None):
        """Process all transcript pages."""
        pages = self.get_transcript_pages()
        
        if limit:
            pages = pages[:limit]
        
        total = len(pages)
        
        for idx, page in enumerate(pages, 1):
            logger.info(f"Processing [{idx}/{total}]: {page['episode']}")
            
            html = self.fetch_transcript(page['title'])
            if not html:
                continue
            
            all_lines = self.parse_transcript(html)
            dialogue_count = sum(1 for l in all_lines if not l.is_scene)
            scene_count = sum(1 for l in all_lines if l.is_scene)
            logger.info(f"  Found {dialogue_count} dialogue lines, {scene_count} scenes")
            
            conversations = self.extract_back_and_forth(all_lines, page['episode'])
            
            for target_class, conv in conversations:
                self.conversations[target_class].append(conv)
            
            logger.info(f"  Extracted {len(conversations)} back-and-forth conversations")
            
            time.sleep(REQUEST_DELAY)
        
        for char_class, convs in self.conversations.items():
            logger.info(f"Total {char_class}: {len(convs)} conversations")
    
    def save_results(self):
        """Save conversations to CSV and JSON files."""
        for char_class, conversations in self.conversations.items():
            if not conversations:
                continue
            
            # Save JSON
            json_path = self.output_dir / f"{char_class}_conversations.json"
            json_data = [asdict(c) for c in conversations]
            
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(json_data, f, indent=2, ensure_ascii=False)
            
            logger.info(f"Saved {json_path} ({len(conversations)} conversations)")
            
            # Save CSV
            csv_path = self.output_dir / f"{char_class}_conversations.csv"
            
            with open(csv_path, 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=['id', 'scene', 'conversation'])
                writer.writeheader()
                
                for conv in conversations:
                    writer.writerow({
                        'id': conv.id,
                        'scene': conv.scene,
                        'conversation': conv.conversation
                    })
            
            logger.info(f"Saved {csv_path}")
        
        # Save summary
        summary_path = self.output_dir / "summary.json"
        summary = {
            "total_conversations": sum(len(c) for c in self.conversations.values()),
            "by_character": {
                char_class: len(convs)
                for char_class, convs in self.conversations.items()
            }
        }
        
        with open(summary_path, 'w', encoding='utf-8') as f:
            json.dump(summary, f, indent=2)
        
        logger.info(f"Saved summary to {summary_path}")


def main():
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Scrape Miraculous Ladybug transcripts for LLM fine-tuning'
    )
    parser.add_argument(
        '--limit', '-l', 
        type=int, 
        default=None,
        help='Limit number of episodes to process (for testing)'
    )
    parser.add_argument(
        '--output', '-o',
        type=Path,
        default=OUTPUT_DIR,
        help='Output directory for results'
    )
    
    args = parser.parse_args()
    
    scraper = MiraculousScraper(output_dir=args.output)
    scraper.process_all_transcripts(limit=args.limit)
    scraper.save_results()
    
    logger.info("Done!")


if __name__ == "__main__":
    main()
