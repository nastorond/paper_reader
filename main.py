import webview
import os
import sys

def get_entrypoint():
    # To support PyInstaller, we check if we are running as an executable
    if getattr(sys, 'frozen', False):
        base_path = sys._MEIPASS
    else:
        base_path = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_path, 'ui', 'index.html')

import base64

class Api:
    def __init__(self):
        self._window = None
        self.current_pdf_path = None
        
        # Initialize Index Manager
        papers_dir = self._get_papers_dir()
        from index_manager import IndexManager
        self.index_manager = IndexManager(papers_dir)

    def _get_papers_dir(self):
        if getattr(sys, 'frozen', False):
            base_dir = os.path.dirname(sys.executable)
        else:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            
        papers_dir = os.path.join(base_dir, 'papers')
        if not os.path.exists(papers_dir):
            os.makedirs(papers_dir, exist_ok=True)
        return papers_dir

    def set_window(self, window):
        self._window = window

    def echo(self, text):
        print(f"Received from JS: {text}")
        return f"Python says: {text}"

    def open_pdf(self):
        if not self._window:
            return None
        
        file_types = ('PDF Files (*.pdf)', 'All files (*.*)')
        result = self._window.create_file_dialog(webview.OPEN_DIALOG, allow_multiple=False, file_types=file_types)
        
        if result and len(result) > 0:
            file_path = result[0]
            self.current_pdf_path = file_path
            
            try:
                with open(file_path, "rb") as f:
                    pdf_data = f.read()
                    base64_pdf = base64.b64encode(pdf_data).decode('utf-8')
                
                # Load sidecar data
                sidecar_data = self._load_sidecar(file_path)
                
                return {
                    "success": True,
                    "filename": os.path.basename(file_path),
                    "filepath": file_path,
                    "data": base64_pdf,
                    "sidecar": sidecar_data
                }
            except Exception as e:
                import traceback
                traceback.print_exc()
                return {"success": False, "error": str(e)}
        return {"success": False, "error": "No file selected"}

    def _get_sidecar_path(self, pdf_path):
        import os
        base, ext = os.path.splitext(pdf_path)
        return f"{base}.json"

    def _load_sidecar(self, pdf_path):
        import os, json
        json_path = self._get_sidecar_path(pdf_path)
        if os.path.exists(json_path):
            with open(json_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        return {"highlights": [], "memos": []}

    def save_highlight(self, highlight_data):
        import json
        if not self.current_pdf_path:
            return {"success": False, "error": "No PDF open"}
            
        json_path = self._get_sidecar_path(self.current_pdf_path)
        data = self._load_sidecar(self.current_pdf_path)
        
        # Add highlight
        data["highlights"].append(highlight_data)
        
        # Save updated data
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
            
        print(f"Saved highlight to {json_path}")
        return {"success": True}

    def delete_highlight(self, timestamp):
        import json
        if not self.current_pdf_path:
            return {"success": False, "error": "No PDF open"}
            
        json_path = self._get_sidecar_path(self.current_pdf_path)
        data = self._load_sidecar(self.current_pdf_path)
        
        original_count = len(data.get("highlights", []))
        data["highlights"] = [h for h in data.get("highlights", []) if h.get("timestamp") != timestamp]
        
        if len(data["highlights"]) < original_count:
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=4)
            print(f"Deleted highlight from {json_path}")
            return {"success": True}
        else:
            return {"success": False, "error": "Highlight not found"}

    def get_local_papers(self):
        import os
        papers_dir = self._get_papers_dir()
            
        papers = []
        
        # Get enriched summary straight from our new index
        summary_data = self.index_manager.get_all_papers_summary()
        
        for p in summary_data:
            filename = p.get('filename')
            filepath = p.get('filepath')
            if not filepath:
                filepath = os.path.join(papers_dir, filename)
                
            # Still load sidecar for memo count locally (memos are personal, not in global index)
            sidecar = self._load_sidecar(filepath)
            memos_count = len(sidecar.get('highlights', []))
            
            # Format author string
            authors = p.get("authors", [])
            author_str = ", ".join(authors[:2]) + (" et al." if len(authors) > 2 else "")
            
            papers.append({
                "filename": filename,
                "filepath": filepath,
                "title": p.get("title", filename),
                "authors": author_str,
                "year": p.get("year", ""),
                "cites_count": p.get("cites_count", 0),
                "cited_by_count": p.get("cited_by_count", 0),
                "memos_count": memos_count
            })
            
        return {"success": True, "papers": papers}
        
    def open_specific_pdf(self, file_path):
        import os, base64
        import traceback
        if not os.path.exists(file_path):
            return {"success": False, "error": "File not found"}
            
        self.current_pdf_path = file_path
        filename = os.path.basename(file_path)
        try:
            with open(file_path, "rb") as f:
                pdf_data = f.read()
                base64_pdf = base64.b64encode(pdf_data).decode('utf-8')
            
            sidecar_data = self._load_sidecar(file_path)
            
            # Get rich index data
            index_data = self.index_manager.get_paper_data(filename)
            
            # Format references into what UI expects, attaching local paths where we know they exist
            formatted_refs = []
            cites_local_filenames = index_data.get("cites", [])
            
            for ref in index_data.get("references", []):
                ref_text = ref.get("text", "")
                ref_title = ref.get("title", "").lower()
                local_path = None
                
                if ref_title:
                    for cf in cites_local_filenames:
                        cf_data = self.index_manager.get_paper_data(cf)
                        if cf_data.get("title", "").lower() == ref_title:
                            local_path = cf_data.get("filepath", os.path.join(self._get_papers_dir(), cf))
                            break
                            
                formatted_refs.append({
                    "text": ref_text,
                    "local_path": local_path
                })
                
            return {
                "success": True,
                "filename": filename,
                "filepath": file_path,
                "data": base64_pdf,
                "sidecar": sidecar_data,
                "index_data": index_data, # Send full index data for Sidebar UI
                "references": formatted_refs
            }
        except Exception as e:
            traceback.print_exc()
            return {"success": False, "error": str(e)}

    def _extract_references(self, pdf_path):
        import fitz # PyMuPDF
        import re
        import os
        import sys
        
        # Get list of local papers
        if getattr(sys, 'frozen', False):
            base_dir = os.path.dirname(sys.executable)
        else:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            
        papers_dir = os.path.join(base_dir, 'papers')
        local_papers = []
        if os.path.exists(papers_dir):
            for file in os.listdir(papers_dir):
                if file.lower().endswith('.pdf'):
                    local_papers.append({
                        "filename": file,
                        "basename": os.path.splitext(file)[0].lower(),
                        "filepath": os.path.join(papers_dir, file)
                    })

        try:
            doc = fitz.open(pdf_path)
            text_from_back = ""
            start_page = max(0, len(doc) - 5)
            for i in range(start_page, len(doc)):
                text_from_back += doc[i].get_text()
                
            ref_match = re.search(r'\n(References|REFERENCES|Bibliography)\n(.*)', text_from_back, re.DOTALL)
            if ref_match:
                ref_text = ref_match.group(2)
                raw_refs = re.split(r'\n\[[0-9]+\]|\n[0-9]+\.', ref_text)
                clean_refs = []
                for r in raw_refs:
                    r = r.strip().replace('\n', ' ')
                    if len(r) > 10:
                        match_path = None
                        r_lower = r.lower()
                        for lp in local_papers:
                            # Heuristic: if the exact filename (minus .pdf) is found in the reference text
                            if lp["basename"] in r_lower:
                                match_path = lp["filepath"]
                                break
                        clean_refs.append({
                            "text": r,
                            "local_path": match_path
                        })
                return clean_refs[:20]  # Limit to 20 for MVP
            return []
        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f"Failed to extract refs: {e}")
            return []

if __name__ == '__main__':
    api = Api()
    window = webview.create_window(
        '📚 Portable Paper Reader', 
        url=get_entrypoint(),
        js_api=api,
        width=1200, 
        height=800,
        text_select=True
    )
    api.set_window(window)
    webview.start(debug=True)

