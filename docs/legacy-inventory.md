# Legacy Inventory

Original project path:

```text
F:/VSCode-Local/topreading_study_guide_maker
```

## Keep As Reference

- Express API behavior
- SQLite persistence model
- generation run logging/cancellation
- prompt requirements for ESL vocabulary, MCQs, and short answers
- PDF export options

## Do Not Carry Forward Directly

- giant browser `public/app.js`
- ad hoc legacy Python generation scripts
- hardcoded secrets
- generated exports and local database files
- stale README instructions

## Immediate Security Cleanup Before Publishing Legacy Code Anywhere

The old `generate_questions.py` contains a hardcoded OpenAI API key. Do not upload that file as-is.

