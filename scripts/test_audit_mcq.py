import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import unittest
import hashlib
import json
spec=importlib.util.spec_from_file_location('audit_mcq',Path(__file__).with_name('audit-mcq.py'))
audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
class McqAuditTests(unittest.TestCase):
    def test_ties_receive_fractional_credit(self):
        r=audit.inspect(['one two','two three','four','five'],0)
        self.assertEqual(r['longest_credit'],.5)
        self.assertEqual(r['guessing_credit'],.25)
    def test_mixed_choice_count_baseline(self):
        result=audit.summarize([audit.inspect(['a','b'],0),audit.inspect(['a','b','c','d'],0)])
        self.assertEqual(result['guessing_baseline'],.375)
        self.assertEqual(result['longest_option_accuracy'],.375)
    def test_invalid_answers_excluded_from_denominator(self):
        result=audit.summarize([audit.inspect(['a','b'],9),audit.inspect(['a','b'],0)])
        self.assertEqual(result['valid_questions'],1)
        self.assertEqual(result['guessing_baseline'],.5)
    def test_length_trigger_needs_ratio_and_absolute_gap(self):
        self.assertNotIn('correct_answer_length',audit.inspect(['one two three','a','b','c'],0)['flags'])
        self.assertIn('correct_answer_length',audit.inspect(['one two three four five six seven eight','a b','c d','e f'],0)['flags'])
    def test_database_readonly_and_active_guide_filter(self):
        with tempfile.TemporaryDirectory() as root:
            p=Path(root)/'data.sqlite'
            with sqlite3.connect(p) as db:
                db.executescript('CREATE TABLE books(id TEXT,active_generation_run_id TEXT); CREATE TABLE study_sets(id TEXT,book_id TEXT,generation_run_id TEXT); CREATE TABLE multiple_choice_questions(id TEXT,study_set_id TEXT,chapter_id TEXT,question_text TEXT,choices_json TEXT,correct_choice_index INTEGER); INSERT INTO books VALUES ("b","r"); INSERT INTO study_sets VALUES ("s","b","r"),("old","b","old-r");')
                db.executemany('INSERT INTO multiple_choice_questions VALUES (?,?,?,?,?,?)',[('q','s','c','Who?',json.dumps(['a','b','c','d']),0),('old-q','old','c','Who?',json.dumps(['a','b','c','d']),1)])
            before=hashlib.sha256(p.read_bytes()).hexdigest();r=audit.audit(p)
            self.assertEqual(r['all_guides']['questions'],2);self.assertEqual(r['active_guides']['questions'],1)
            self.assertEqual(before,hashlib.sha256(p.read_bytes()).hexdigest())
            self.assertNotIn('question',r['review_sample']['unflagged'][0])
if __name__=='__main__': unittest.main()
