import os
import json
import base64
from pathlib import Path
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

# Storage directory
STORAGE_DIR = Path.home() / ".ladybug"
CHATS_FILE = STORAGE_DIR / "chats.enc"
SALT_FILE = STORAGE_DIR / "salt"


def ensure_storage_dir():
    """Create storage directory if it doesn't exist."""
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)


def get_or_create_salt() -> bytes:
    """Get existing salt or create a new one."""
    ensure_storage_dir()
    if SALT_FILE.exists():
        return SALT_FILE.read_bytes()
    else:
        salt = os.urandom(16)
        SALT_FILE.write_bytes(salt)
        return salt


def derive_key(password: str) -> bytes:
    """Derive a Fernet key from password using PBKDF2."""
    salt = get_or_create_salt()
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=480000,  # OWASP recommended minimum
    )
    key = base64.urlsafe_b64encode(kdf.derive(password.encode()))
    return key


def encrypt_data(data: dict, password: str) -> bytes:
    """Encrypt data dictionary to bytes."""
    key = derive_key(password)
    fernet = Fernet(key)
    json_bytes = json.dumps(data).encode()
    return fernet.encrypt(json_bytes)


def decrypt_data(encrypted: bytes, password: str) -> dict:
    """Decrypt bytes to data dictionary."""
    key = derive_key(password)
    fernet = Fernet(key)
    json_bytes = fernet.decrypt(encrypted)
    return json.loads(json_bytes.decode())


def save_chats(chats: list, password: str) -> bool:
    """Save chats to encrypted file."""
    try:
        ensure_storage_dir()
        encrypted = encrypt_data({"chats": chats}, password)
        CHATS_FILE.write_bytes(encrypted)
        return True
    except Exception as e:
        print(f"Error saving chats: {e}")
        return False


def load_chats(password: str) -> tuple[list | None, str | None]:
    """
    Load chats from encrypted file.
    Returns (chats, error_message).
    - If successful: (chats_list, None)
    - If wrong password: (None, "invalid_password")
    - If no file exists: ([], None) - empty list, new account
    - If other error: (None, error_message)
    """
    if not CHATS_FILE.exists():
        # No existing chats - new account
        return [], None
    
    try:
        encrypted = CHATS_FILE.read_bytes()
        data = decrypt_data(encrypted, password)
        return data.get("chats", []), None
    except InvalidToken:
        return None, "invalid_password"
    except Exception as e:
        return None, str(e)


def account_exists() -> bool:
    """Check if an account (encrypted chats file) already exists."""
    return CHATS_FILE.exists()


def delete_chat(chat_id: str, password: str) -> tuple[bool, str | None]:
    """Delete a specific chat by ID."""
    chats, error = load_chats(password)
    if error:
        return False, error
    
    chats = [c for c in chats if c.get("id") != chat_id]
    success = save_chats(chats, password)
    return success, None if success else "Failed to save"
