import zipfile
import os

def create_project_zip():
    exclude_dirs = {'node_modules', 'dist', '.git', '.cache'}
    exclude_files = {'ospreyn-source.zip', 'ospreyn-project.zip'}
    
    os.makedirs('public', exist_ok=True)
    zip_path = os.path.join('public', 'ospreyn-source.zip')
    
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk('.'):
            dirs[:] = [d for d in dirs if d not in exclude_dirs and not d.startswith('.')]
            for file in files:
                if file in exclude_files or file.endswith('.pyc') or file.endswith('.zip'):
                    continue
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, '.')
                # Ignore hidden files except important configs
                parts = rel_path.split(os.sep)
                if any(p.startswith('.') and p not in {'.env.example', '.gitignore'} for p in parts):
                    continue
                zf.write(full_path, rel_path)

    print(f"Project ZIP created: {zip_path} ({os.path.getsize(zip_path)} bytes)")

if __name__ == '__main__':
    create_project_zip()
