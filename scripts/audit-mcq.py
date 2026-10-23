"""Read-only MCQ audit; never changes questions or calls a model."""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import random
import sqlite3


def inspect(choices, correct):
    if not isinstance(choices, list) or len(choices) < 2 or any(not isinstance(c, str) or not c.strip() for c in choices) or not isinstance(correct, int) or not 0 <= correct < len(choices):
        return {'flags': ['invalid_choices_or_answer'], 'valid': False}
    lengths = [len(c.split()) for c in choices]
    distractors = [n for i, n in enumerate(lengths) if i != correct]
    longest = max(lengths)
    flags = []
    if len({' '.join(c.casefold().split()) for c in choices}) != len(choices): flags.append('duplicate_choices')
    if lengths[correct] > 1.5 * max(distractors) and lengths[correct] - max(distractors) >= 5: flags.append('correct_answer_length')
    if lengths[correct] >= 8 and min(distractors) <= 2: flags.append('very_short_distractor')
    return {'flags': flags, 'valid': True, 'word_counts': lengths, 'correct_position': correct,
            'guessing_credit': 1 / len(choices), 'longest_credit': (1 / lengths.count(longest)) if lengths[correct] == longest else 0,
            'correct_to_distractor_mean': lengths[correct] / (sum(distractors) / len(distractors))}


def summarize(records):
    valid = [r for r in records if r['valid']]
    n = len(valid)
    return {'questions': len(records), 'valid_questions': n, 'flagged_questions': sum(bool(r['flags']) for r in records),
            'flags': dict(Counter(f for r in records for f in r['flags'])),
            'correct_positions': dict(sorted(Counter(chr(65+r['correct_position']) for r in valid).items())),
            'longest_option_accuracy': sum(r['longest_credit'] for r in valid) / n if n else None,
            'guessing_baseline': sum(r['guessing_credit'] for r in valid) / n if n else None,
            'mean_correct_to_distractor_length_ratio': sum(r['correct_to_distractor_mean'] for r in valid) / n if n else None}


def audit(database, include_content=False):
    database = Path(database).resolve()
    records = []
    with sqlite3.connect(database.as_uri()+'?mode=ro', uri=True) as db:
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA query_only=ON')
        db.execute('BEGIN')
        rows = db.execute('''SELECT q.*, s.book_id, s.generation_run_id, b.active_generation_run_id
            FROM multiple_choice_questions q JOIN study_sets s ON s.id=q.study_set_id JOIN books b ON b.id=s.book_id ORDER BY q.id''')
        for row in rows:
            try: choices = json.loads(row['choices_json'])
            except (ValueError, TypeError): choices = None
            result = inspect(choices, row['correct_choice_index'])
            result.update(id=row['id'], book_id=row['book_id'], study_set_id=row['study_set_id'], chapter_id=row['chapter_id'],
                          active_guide=row['generation_run_id'] is not None and row['generation_run_id'] == row['active_generation_run_id'])
            if include_content: result.update(question=row['question_text'], choices=choices, correct_index=row['correct_choice_index'])
            records.append(result)
    by_book = defaultdict(list)
    for r in records: by_book[r['book_id']].append(r)
    rng = random.Random(42)
    flagged = [r for r in records if r['flags']]
    unflagged = [r for r in records if not r['flags']]
    return {'version': 1, 'all_guides': summarize(records), 'active_guides': summarize([r for r in records if r['active_guide']]),
            'by_book': {key: summarize(value) for key,value in by_book.items()},
            'review_sample': {'flagged': rng.sample(flagged, min(20,len(flagged))), 'unflagged': rng.sample(unflagged,min(20,len(unflagged)))},
            'flagged': flagged, 'notes': ['Length counts whitespace-separated words.', 'Ties in longest-option selection receive fractional credit.', 'Heuristics flag review candidates; they do not establish semantic correctness.', 'Records may be correlated across chapters and guide versions; these are descriptive metrics.']}


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database',required=True,type=Path)
    parser.add_argument('--report',type=Path)
    parser.add_argument('--include-content',action='store_true',help='Include private question content in the local report')
    args=parser.parse_args()
    result=audit(args.database,args.include_content)
    if args.report:
        with args.report.open('x') as file: json.dump(result,file,indent=2,ensure_ascii=False)
    print(json.dumps({key: result[key] for key in ('all_guides','active_guides')},indent=2))
