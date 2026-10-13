"""
Root conftest — adds backend/ to sys.path so tests can import
`backend.app.*` without installing the package.
"""
import sys
import os

# Make `import backend.app.*` work from the jarvis/ root
sys.path.insert(0, os.path.dirname(__file__))
