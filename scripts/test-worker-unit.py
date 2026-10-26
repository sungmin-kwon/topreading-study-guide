import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
spec=importlib.util.spec_from_file_location('worker',Path(__file__).with_name('start-generation-worker.py'))
w=importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)
class UnitTests(unittest.TestCase):
    def test_paths_and_parser(self):
        unit=w.render_unit(Path('/home/sungmin-kwon/topreading-staging'),Path('/home/sungmin-kwon/topreading-staging/.env.local'),'/bin/true','nobody')
        self.assertIn('WorkingDirectory=/home/sungmin-kwon/topreading-staging\n',unit)
        self.assertIn('EnvironmentFile=/home/sungmin-kwon/topreading-staging/.env.local\n',unit)
        self.assertIn('ExecStart="/bin/true" ',unit)
        if not shutil.which('systemd-analyze'): self.skipTest('systemd-analyze required for parser validation')
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'topreading-staging-worker.service';path.write_text(unit)
            (Path(directory)/'docker.service').write_text('[Service]\nExecStart=/bin/true\n')
            env={**os.environ,'SYSTEMD_UNIT_PATH':directory+':'}
            result=subprocess.run(['systemd-analyze','verify','--man=no',str(path)],env=env,capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            path.write_text(unit.replace('WorkingDirectory=/home/sungmin-kwon/topreading-staging','WorkingDirectory="/home/sungmin-kwon/topreading-staging"'))
            rejected=subprocess.run(['systemd-analyze','verify','--man=no',str(path)],env=env,capture_output=True,text=True)
            self.assertNotEqual(rejected.returncode,0)
            self.assertIn('not absolute',rejected.stderr)
    def test_unsafe_paths(self):
        for value in ['relative','/tmp/a\nUser=root','/tmp/"quoted"','/tmp/%n']:
            with self.assertRaises(w.starter.StartError): w.unit_path(value)
if __name__=='__main__':unittest.main()
