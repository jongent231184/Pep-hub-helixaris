"""Helper: serialise MongoDB document to API response."""
from datetime import datetime
from typing import Any, Dict


def doc_to_dict(doc: Dict[str, Any]) -> Dict[str, Any]:
    if not doc:
        return doc
    d = dict(doc)
    d.pop('_id', None)
    d.pop('password_hash', None)
    return d
