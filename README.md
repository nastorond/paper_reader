# Portable Paper Reader

A portable, cross-platform PDF reading companion designed for researchers, students, and academics. It features a continuous scrolling viewer, an intuitive sidebar interface for organizing local papers, and automatic citation network mapping.

## Features

- **Continuous Scrolling PDF Viewer**: Built on PDF.js for smooth reading without artificial page breaks.
- **Auto Citation Network Mapping**: Extracts references from your localized papers and uses the Semantic Scholar API to build a web of "Cites" and "Cited By" connections automatically.
- **Two-way Reference Navigation**: Clicking a reference in the text snaps to the specific citation in the Right Sidebar. Clicking a citation in the sidebar scrolls to that exact moment in the PDF.
- **Local Memos & Highlights**: Select text anywhere on the PDF and press "Highlight" to save snippets locally without modifying the original source PDF.
- **Cross-Platform Portable App**: Can be bundled completely as a single executable for Windows/Mac to use on the go.
- **Privacy-First Library**: Stores all your metadata and reference tracking cleanly inside `papers_index.json` locally.

## Getting Started

### 1. Simple Run Script (If Python is installed)
On Windows:
Double click `run.bat` to automatically instantiate the virtual environment and start reading.

On Mac/Linux:
Run `./LaunchReader.command` to automatically instantiate the virtual environment and start reading.

### 2. Manual Start (Command Line)
First, make sure to install all dependencies:
```bash
pip install -r requirements.txt
```

Launch the application:
```bash
python main.py
```

## Adding Papers

Simply copy any `.pdf` files into the newly created `papers/` directory next to the program. The Paper Reader will automatically index them, lookup their metadata from Semantic Scholar, and update the connection graph in real-time.

---
_Note: Do not commit the `papers/` directory to this repository as to protect personal library contents._
