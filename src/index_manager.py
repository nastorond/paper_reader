import os
import json
import time
import fitz  # PyMuPDF
import requests
import re
import threading

class IndexManager:
    """Manages the local paper index (papers_index.json) and Semantic Scholar API queries."""
    
    def __init__(self, papers_dir):
        self.papers_dir = papers_dir
        self.index_file = os.path.join(papers_dir, "papers_index.json")
        self.index_data = self._load_index()
        self.api_url = "https://api.semanticscholar.org/graph/v1/paper/search"
        self.api_details_url = "https://api.semanticscholar.org/graph/v1/paper/{paper_id}"
        
        # Start background scanner thread
        self.scanner_thread = threading.Thread(target=self._scan_directory, daemon=True)
        self.scanner_thread.start()

    def _load_index(self):
        if os.path.exists(self.index_file):
            try:
                with open(self.index_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                print(f"Error loading index: {e}")
        return {}

    def _save_index(self):
        try:
            with open(self.index_file, 'w', encoding='utf-8') as f:
                json.dump(self.index_data, f, ensure_ascii=False, indent=4)
        except Exception as e:
            print(f"Error saving index: {e}")

    def _scan_directory(self):
        """Continuously scans the papers directory for new files to index."""
        while True:
            if os.path.exists(self.papers_dir):
                for filename in os.listdir(self.papers_dir):
                    if filename.lower().endswith('.pdf'):
                        filepath = os.path.join(self.papers_dir, filename)
                        
                        # Use filename as unique key for simplicity in our local library
                        if filename not in self.index_data:
                            print(f"New PDF detected: {filename}. Starting indexing...")
                            self._index_paper(filepath, filename)
            
            # Re-evaluate network connections every cycle
            self._update_network_links()
            time.sleep(10)  # Scan every 10 seconds

    def _index_paper(self, filepath, filename):
        """Extracts basic info via PyMuPDF, then enriches with Semantic Scholar."""
        # 1. Extract base title from filename or first page text
        base_title = self._guess_title(filepath, filename)
        
        # Initialize basic entry
        paper_entry = {
            "filename": filename,
            "filepath": filepath,
            "title": base_title,
            "authors": [],
            "abstract": "",
            "year": "",
            "semantic_scholar_id": None,
            "references": [], # the raw strings or dicts from the paper
            "cites": [],      # indices of local papers this paper cites
            "cited_by": []    # indices of local papers that cite this paper
        }
        
        # 2. Try to get rich data from Semantic Scholar
        rich_data = self._query_semantic_scholar_by_title(base_title)
        
        if rich_data:
            print(f"Found Semantic Scholar match for: {base_title}")
            paper_entry["title"] = rich_data.get("title", base_title)
            paper_entry["authors"] = [a.get("name") for a in rich_data.get("authors", [])]
            paper_entry["abstract"] = rich_data.get("abstract", "")
            paper_entry["year"] = rich_data.get("year", "")
            paper_entry["semantic_scholar_id"] = rich_data.get("paperId")
            
            # Fetch references using the paperId
            paper_entry["references"] = self._fetch_references_from_api(rich_data.get("paperId"))
        else:
            print(f"No Semantic Scholar match for: {base_title}. Using local fallback.")
            # Fallback to local parsing for references
            paper_entry["references"] = self._extract_references_local(filepath)
            
        self.index_data[filename] = paper_entry
        self._save_index()
        print(f"Indexing complete for: {filename}")

    def _guess_title(self, filepath, filename):
        """Attempts to guess the title. Semantic scholar search is fuzzy so this doesn't need to be perfect."""
        # Clean filename first
        clean_name = os.path.splitext(filename)[0]
        # Just use the filename. Parsing the first page is too unreliable for Korean theses
        # and frequently corrupts the Semantic Scholar search query.
        return clean_name

    def _query_semantic_scholar_by_title(self, title):
        """Searches Semantic Scholar API by title and returns the best match."""
        try:
            params = {
                "query": title,
                "limit": 1,
                "fields": "title,authors,abstract,year"
            }
            # Add a small delay to respect API rate limits (100 req / 5 min without key)
            time.sleep(1)
            response = requests.get(self.api_url, params=params)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("data") and len(data["data"]) > 0:
                    return data["data"][0]
        except Exception as e:
            print(f"Error querying Semantic Scholar: {e}")
        return None

    def _fetch_references_from_api(self, paper_id):
        """Fetches the reference list for a given paper ID."""
        if not paper_id:
            return []
            
        try:
            url = f"{self.api_details_url.format(paper_id=paper_id)}/references"
            params = {
                "fields": "title,authors,year",
                "limit": 100
            }
            time.sleep(1)
            response = requests.get(url, params=params)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("data"):
                    refs = []
                    for ref in data["data"]:
                        if ref.get("citedPaper"):
                            cp = ref["citedPaper"]
                            # Format into our standard reference dictionary
                            author_str = ", ".join([a.get("name", "") for a in cp.get("authors", []) if a.get("name")])
                            title_str = cp.get("title", "")
                            year_str = str(cp.get("year", ""))
                            text_rep = f"{author_str} ({year_str}). {title_str}"
                            
                            refs.append({
                                "text": text_rep,
                                "title": title_str, # Store raw title for easier matching later
                                "semantic_scholar_id": cp.get("paperId")
                            })
                    return refs
        except Exception as e:
            print(f"Error fetching references: {e}")
        return []

    def _extract_references_local(self, pdf_path):
        """Fallback local extraction (similar to old main.py logic)."""
        try:
            doc = fitz.open(pdf_path)
            text_from_back = ""
            # Theses can have many appendix pages, so check the last 20 pages
            start_page = max(0, len(doc) - 20)
            for i in range(start_page, len(doc)):
                text_from_back += doc[i].get_text()
                
            # Find all matches and take the last one to avoid Table of Contents
            # Relaxed regex to allow matching even if it's the very first string of the block
            matches = list(re.finditer(r'(?:\n|^). {0,15}?(References|REFERENCES|Bibliography|참고문헌|참\s*고\s*문\s*헌)\s*\n(.*)', text_from_back, re.DOTALL))
            if matches:
                ref_text = matches[-1].group(2)
                # Split by [number], number., or number) capturing erratic spaces and newlines
                raw_refs = re.split(r'\n\s*\[[0-9]+\]\s*\n|\n\s*\[[0-9]+\]\s*|\n\s*[0-9]+\.\s*|\n\s*[0-9]+\)\s*', ref_text)
                clean_refs = []
                for r in raw_refs:
                    r = r.strip().replace('\n', ' ')
                    r = re.sub(r'\s+', ' ', r) # Clean erratic spacing
                    if len(r) > 10:
                        clean_refs.append({"text": r})
                return clean_refs[:80] # Increase limit since some theses have many refs
        except Exception:
            pass
        return []

    def _update_network_links(self):
        """Cross-references papers to figure out Cites / Cited By relationships locally."""
        # Wipe current links
        for filename, data in self.index_data.items():
            data["cites"] = []
            data["cited_by"] = []
            
        filenames = list(self.index_data.keys())
        
        for p1_file, p1_data in self.index_data.items():
            for p2_file in filenames:
                if p1_file == p2_file:
                    continue
                    
                p2_data = self.index_data[p2_file]
                
                # Check if p1 cites p2
                cites_p2 = False
                
                # Method A: Semantic Scholar ID matching (Highly accurate)
                if p2_data.get("semantic_scholar_id"):
                    target_id = p2_data["semantic_scholar_id"]
                    for ref in p1_data.get("references", []):
                        if ref.get("semantic_scholar_id") == target_id:
                            cites_p2 = True
                            break
                
                # Method B: Title fuzzy matching (Fallback)
                if not cites_p2 and p2_data.get("title"):
                    target_title_lower = p2_data["title"].lower()
                    if len(target_title_lower) > 10: # Only try matching substantial titles
                        for ref in p1_data.get("references", []):
                            ref_text_lower = ref.get("text", "").lower()
                            if target_title_lower in ref_text_lower:
                                cites_p2 = True
                                break
                                
                if cites_p2:
                    if p2_file not in p1_data["cites"]:
                        p1_data["cites"].append(p2_file)
                    if p1_file not in p2_data["cited_by"]:
                        p2_data["cited_by"].append(p1_file)
                        
        self._save_index()
        
    def get_paper_data(self, filename):
        return self.index_data.get(filename, {})
        
    def get_all_papers_summary(self):
        summary = []
        for filename, data in self.index_data.items():
            summary.append({
                "filename": filename,
                "filepath": data.get("filepath", ""),
                "title": data.get("title", filename),
                "authors": data.get("authors", []),
                "year": data.get("year", ""),
                "cites_count": len(data.get("cites", [])),
                "cited_by_count": len(data.get("cited_by", []))
            })
        return summary
