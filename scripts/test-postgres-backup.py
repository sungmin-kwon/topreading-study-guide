"""Offline backup integrity/guard tests. Real restore rehearsal uses --verify."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('backup', Path(__file__).with_name('postgres-backup.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class BackupTests(unittest.TestCase):
    def test_nested_manifest_and_corruption(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            (folder/'uploads').mkdir()
            (folder/'uploads/manifest.json').write_text('source content')
            checksums = m.hashes(folder)
            self.assertIn('uploads/manifest.json', checksums)
            (folder/'manifest.json').write_text(json.dumps({'format':1,'schema':m.SCHEMA,'sha256':checksums}))
            (folder/'uploads/manifest.json').write_text('corrupt')
            with patch.object(m,'docker') as docker:
                with self.assertRaisesRegex(RuntimeError,'checksums'): m.verify(folder)
                docker.assert_not_called()
    def test_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp)
            (folder/'link').symlink_to('/etc/passwd')
            with self.assertRaisesRegex(RuntimeError,'Symlinks'): m.hashes(folder)
    def test_no_backup_in_production_checkout(self):
        with patch.object(m,'ROOT',Path('/home/example/topreading-study-guide')):
            with self.assertRaisesRegex(RuntimeError,'separate topreading-staging'): m.backup()
    def test_source_path_traversal(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(m,'sql',return_value='[{"path":"../escape","sha256":"a","bytes":1}]'):
            with self.assertRaisesRegex(RuntimeError,'Unsafe source'): m.verify_sources('unused',Path(tmp),Path('/original/uploads'))

if __name__=='__main__': unittest.main()
