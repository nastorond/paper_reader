import os
import sys
import json

def get_config_path():
    if getattr(sys, 'frozen', False):
        base_dir = os.path.dirname(sys.executable)
    else:
        # If running from src/, config should go to the project root
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base_dir, 'config.json')

def load_config():
    path = get_config_path()
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading config: {e}")
    return {}

def save_config(config_data):
    path = get_config_path()
    try:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(config_data, f, ensure_ascii=False, indent=4)
        return True
    except Exception as e:
        print(f"Error saving config: {e}")
        return False
        
def get_library_path():
    config = load_config()
    lib_path = config.get("library_path")
    
    # If explicitly set and exists, use it
    if lib_path and os.path.exists(lib_path):
        return lib_path
        
    # Default fallback
    if getattr(sys, 'frozen', False):
        base_dir = os.path.dirname(sys.executable)
    else:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        
    papers_dir = os.path.join(base_dir, 'papers')
    if not os.path.exists(papers_dir):
        os.makedirs(papers_dir, exist_ok=True)
    return papers_dir

def set_library_path(new_path):
    if not os.path.exists(new_path):
        return False
    config = load_config()
    config["library_path"] = new_path
    return save_config(config)
