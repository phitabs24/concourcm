import json
import os
import re
import sys
from typing import List, Dict, Tuple

SUBJECT_ALIASES = {
    'BIOLOGY': 'biology',
    'CHEMISTRY': 'chemistry',
    'PHYSICS': 'physics',
    'GENERAL KNOWLEDGE': 'general-knowledge',
    'GENERAL KNOWLEDGE SCIENTIFIC FIELD': 'general-knowledge',
    'GENERAL  KNOWLEDGE AND FRENCH': 'general-knowledge',  # mixed; we will still collect GK-like items here
    'GENERAL KNOWLEDGE & LANGUAGE': 'general-knowledge',
    'GENERAL KNOWLEDGE & LANGUAGE ': 'general-knowledge',
    'GENERAL KNOWLEDGE AND FRENCHA.': 'general-knowledge',
    'FRENCH': 'french',
    'FRENCH LANGUAGE': 'french',
}

YEAR_HEADER_RE = re.compile(r"^(20\d{2})\s+NATIONAL QUALIFYING", re.I)
SUBJECT_LINE_RE = re.compile(r"^(BIOLOGY|CHEMISTRY|PHYSICS|GENERAL\s+KNOWLEDGE(?:\s+SCIENTIFIC\s+FIELD)?|GENERAL\s+\s*KNOWLEDGE\s*(?:&|AND)\s*(?:LANGUAGE|FRENCH)(?:A\.)?|FRENCH(?:\s+LANGUAGE)?)\s*$", re.I)
QUESTION_START_RE = re.compile(r"^(\d{1,3})\s*[\).]?\s*(.*)")
OPTION_RE = re.compile(r"^[\s\-\•]*([A-Ea-e])[\).\-:]\s*(.*)")


def normalize_line(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip())


def parse_subject_blocks(lines: List[str]) -> List[Tuple[str, str, int, int]]:
    blocks = []  # (year, subject_key, start_idx, end_idx)
    current_year = None
    last_subject_idx = None
    last_subject_key = None

    for i, raw in enumerate(lines):
        line = normalize_line(raw)
        if not line:
            continue
        m_year = YEAR_HEADER_RE.match(line)
        if m_year:
            current_year = m_year.group(1)
            continue
        m_sub = SUBJECT_LINE_RE.match(line)
        if m_sub:
            subject_title = m_sub.group(1).upper()
            subject_key = SUBJECT_ALIASES.get(subject_title, None)
            if subject_key is None:
                continue
            # close previous subject block
            if last_subject_idx is not None and last_subject_key is not None:
                blocks.append((current_year or '', last_subject_key, last_subject_idx, i))
            last_subject_idx = i + 1  # start after the header line
            last_subject_key = subject_key
    # close tail
    if last_subject_idx is not None and last_subject_key is not None:
        blocks.append((current_year or '', last_subject_key, last_subject_idx, len(lines)))
    return blocks


def parse_questions_from_block(block_lines: List[str], default_year: str) -> List[Dict]:
    questions = []
    i = 0
    while i < len(block_lines):
        line = normalize_line(block_lines[i])
        if not line:
            i += 1
            continue
        m_q = QUESTION_START_RE.match(line)
        if not m_q:
            i += 1
            continue
        # Start a question
        qnum = m_q.group(1)
        qtext_parts = [m_q.group(2).strip()]
        i += 1
        # Accumulate until we hit first option
        while i < len(block_lines):
            nl = normalize_line(block_lines[i])
            if OPTION_RE.match(nl):
                break
            # stop if we hit another question number
            if QUESTION_START_RE.match(nl):
                break
            if nl:
                qtext_parts.append(nl)
            i += 1
        # Now gather options A..E (up to 6 to be safe)
        options = {}
        while i < len(block_lines):
            nl = normalize_line(block_lines[i])
            m_opt = OPTION_RE.match(nl)
            if not m_opt:
                # stop options collection if a new question starts
                if QUESTION_START_RE.match(nl):
                    break
                i += 1
                continue
            letter = m_opt.group(1).upper()
            opt_text = m_opt.group(2).strip()
            # coalesce wrapped option lines
            j = i + 1
            cont_parts = []
            while j < len(block_lines):
                nl2 = normalize_line(block_lines[j])
                if not nl2:
                    j += 1
                    continue
                if OPTION_RE.match(nl2) or QUESTION_START_RE.match(nl2):
                    break
                cont_parts.append(nl2)
                j += 1
            if cont_parts:
                opt_text = normalize_line(opt_text + ' ' + ' '.join(cont_parts))
            options[letter] = opt_text
            i = j
        if options:
            # order options by letter
            ordered_letters = sorted(options.keys())
            opts = [options[k] for k in ordered_letters]
        else:
            opts = []
        question_text = normalize_line(' '.join(qtext_parts)).strip()
        if not question_text:
            continue
        questions.append({
            'question': question_text,
            'options': opts,
            'answer': None,  # answer key not present in source; to be filled later
            'year': default_year or None,
        })
    return questions


def main(txt_path: str, out_dir: str):
    with open(txt_path, 'r', encoding='utf-8', errors='ignore') as f:
        raw_lines = f.read().splitlines()

    blocks = parse_subject_blocks(raw_lines)

    # Collect per subject
    per_subject: Dict[str, List[Dict]] = {
        'biology': [],
        'chemistry': [],
        'physics': [],
        'general-knowledge': [],
        'french': [],
    }

    for year, subject_key, start, end in blocks:
        sub_lines = raw_lines[start:end]
        qs = parse_questions_from_block(sub_lines, year)
        # Heuristic: french subject often appears as standalone header; otherwise detect accented content
        per_subject.setdefault(subject_key, [])
        per_subject[subject_key].extend(qs)

    os.makedirs(out_dir, exist_ok=True)
    for key, items in per_subject.items():
        # Deduplicate rough duplicates by question text
        seen = set()
        deduped = []
        for it in items:
            t = it['question']
            if t in seen:
                continue
            seen.add(t)
            deduped.append(it)
        out_path = os.path.join(out_dir, f"{key}-full.json")
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(deduped, f, ensure_ascii=False, indent=2)
        print(f"Wrote {len(deduped)} questions to {out_path}")


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('Usage: python build_banks.py <input_txt> <output_dir>')
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
