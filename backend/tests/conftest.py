"""Load backend/.env so tests that import from routes/db work."""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / '.env')
sys.path.insert(0, str(BACKEND_DIR))
