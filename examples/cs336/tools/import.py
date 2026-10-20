"""Convert the pinned CS336 materials without executing their GPU/network workloads."""
import argparse
import hashlib
import html
import json
import re
import shutil
import subprocess
from pathlib import Path

import pymupdf
import pymupdf4llm
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PIN = 'de53a9f979a6ee35f7d13a5e1aadee5ea1afc58e'
URL = 'https://github.com/stanford-cs336/lectures'
TITLES = {
    1: 'Introduction and tokenization', 2: 'Resource accounting',
    3: 'Architectures and hyperparameters', 4: 'Attention alternatives and mixture of experts',
    5: 'GPUs', 6: 'GPU programming', 7: 'Parallelism', 8: 'Parallelism basics',
    9: 'Scaling laws: basics', 10: 'Inference', 11: 'Scaling laws: case studies and details',
    12: 'Evaluation', 13: 'Data I', 14: 'Data II',
    15: 'After pretraining: mid-training and post-training',
    16: 'Post-training II: reinforcement learning from verifiable rewards', 17: 'Multimodal models',
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def fence(text, language=''):
    ticks = '`' * max(3, max((len(x) for x in re.findall(r'`+', text)), default=0) + 1)
    return f'{ticks}{language}\n{text.rstrip()}\n{ticks}\n'


def frontmatter(n):
    return f'''---
title: "CS336 Lecture {n:02}: {TITLES[n]}"
lang: en
plugins:
  - '@lincyaw/slidev-addon-core'
  - '@lincyaw/slidev-addon-content'
renderers:
  web: {{}}
  slides: {{}}
  notebook: {{}}
---

(cs336-{n:02}-cover)=
# Lecture {n:02}: {TITLES[n]}

Stanford CS336 · Language Modeling from Scratch · Spring 2026.

'''


def clean(text):
    # Keep mathematical inequalities and Python reprs out of raw HTML parsing.
    return re.sub(r'<(?!br\s*/?>)(?=[A-Za-z!/])', '&lt;', text).replace('\x00', '')


def asset(source):
    data = source.read_bytes()
    if source.suffix.lower() in ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']:
        return '../source/' + source.relative_to(ROOT / 'source').as_posix()
    kind = '.png' if data.startswith(b'\x89PNG') else '.jpg' if data.startswith(b'\xff\xd8') else '.gif' if data.startswith(b'GIF') else '.svg' if b'<svg' in data[:1000] else '.webp' if data[:4] == b'RIFF' and data[8:12] == b'WEBP' else '.bin'
    target = ROOT / 'assets' / (digest(data)[:24] + kind)
    target.parent.mkdir(exist_ok=True)
    target.write_bytes(data)
    return '../assets/' + target.name


def observed_value(value):
    if isinstance(value, dict):
        if 'type' in value and 'contents' in value:
            return observed_value(value['contents'])
        return {key: observed_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [observed_value(item) for item in value]
    return value


def value_markdown(value):
    import pprint
    contents = observed_value(value)
    if isinstance(contents, (dict, list)):
        return fence(pprint.pformat(contents, width=88, compact=True, sort_dicts=False), 'python')
    if isinstance(contents, str) and '\n' in contents:
        return fence(contents, 'text')
    return clean(str(contents)) if contents is not None else 'None'


def values_markdown(values):
    scalars, blocks = [], []
    for key, value in values.items():
        plain = observed_value(value)
        rendered = value_markdown(value)
        if not isinstance(plain, (dict, list)) and '\n' not in rendered:
            scalars.append(f"| `{key}` | {rendered.replace('|', '&#124;')} |")
        else:
            shape = value.get('shape') if isinstance(value, dict) else None
            dtype = value.get('dtype') if isinstance(value, dict) else None
            details = ' · '.join(str(item) for item in [dtype, ' × '.join(map(str, shape)) if shape else None] if item)
            blocks.append(f'**`{key}`**' + (f' ({details})' if details else '') + f'\n\n{rendered}')
    if scalars:
        blocks.insert(0, '| Variable | Value |\n| --- | --- |\n' + '\n'.join(scalars))
    return '\n\n'.join(blocks)


def environment_at(trace, index):
    stack = trace['steps'][index]['stack']
    observations = []
    for step in reversed(trace['steps'][:index + 1]):
        previous = step['stack']
        if len(previous) < len(stack):
            break
        if len(previous) == len(stack) and all(a['path'] == b['path'] and a['line_number'] == b['line_number'] for a, b in zip(previous[:-1], stack[:-1])):
            observations.append(step['env'])
    env = {}
    for observation in reversed(observations):
        env.update(observation)
    return {key: value for key, value in env.items() if value is not None}


def rendering_markdown(rendering, source, assets):
    kind, value = rendering['type'], rendering['data']
    if kind == 'markdown':
        match = re.match(r'^#{1,6}\s+[^\n]+', value)
        return clean(value[match.end():].strip() if match else value)
    if kind == 'image':
        target = asset(ROOT / 'source' / value)
        assets.add(target)
        return f'![{html.escape(Path(value).name, quote=False)}]({target})'
    if kind == 'link':
        external = rendering.get('external_link') or {}
        internal = rendering.get('internal_link') or {}
        href = external.get('url')
        if not href and internal:
            href = f"{URL}/blob/{PIN}/{internal['path']}#L{internal['line_number']}"
        label = value.strip('[]') or external.get('title') or 'Reference'
        if href and not re.match(r'^\w+://', href) and (source / href).is_file():
            href = '../source/' + href
        return f'[{clean(label)}]({href})' if href else clean(label)
    raise ValueError(f'Unknown rendering type: {kind}')


def rendering_parts(renderings, source, assets):
    parts, preformatted = [], []
    def flush():
        if preformatted:
            parts.append(fence('\n'.join(preformatted), 'text'))
            preformatted.clear()
    for rendering in renderings:
        if rendering['type'] == 'markdown' and rendering.get('style', {}).get('whiteSpace') == 'pre':
            preformatted.append(rendering['data'])
        else:
            flush()
            parts.append(rendering_markdown(rendering, source, assets))
    flush()
    return parts


def join_reading(parts):
    # Citations emitted by link() continue their sentence or list item.
    joined = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        citation = bool(re.fullmatch(r'\[[^\]]+\]\([^\n]+\)', part))
        continuation = joined and not joined[-1].startswith('![') and re.search(r'\]\([^\n]+\)$', joined[-1]) and re.match(r'^[a-z,:;.]', part)
        if joined and (citation or continuation):
            joined[-1] += ' ' + part
        else:
            joined.append(part)
    out, previous_list = '', False
    for part in joined:
        is_list = bool(re.match(r'^(?:[-*+] |\d+\. )', part))
        out += ('\n' if previous_list and is_list else '\n\n') + part
        previous_list = is_list
    return out.strip()


def inferred_topics(trace):
    from collections import Counter
    headings = sum(bool(re.match(r'^#{1,6}\s+', r['data'])) for step in trace['steps'] for r in step['renderings'] if r['type'] == 'markdown')
    if headings > 1:
        return {}
    def function(step):
        return step['stack'][1]['function_name'] if len(step['stack']) > 1 else None
    counts = Counter(function(step) for step in trace['steps'] if step['renderings'])
    names = {'kv': 'KV', 'gpu': 'GPU', 'gpus': 'GPUs', 'lm': 'LM', 'llms': 'LLMs',
        'ddp': 'DDP', 'clip': 'CLIP', 'siglip': 'SigLIP', 'llava': 'LLaVA', 'qwen': 'Qwen',
        'vl': 'VL', 'dclm': 'DCLM', 'gpt3': 'GPT-3', 'gpt4': 'GPT-4', 't5': 'T5',
        'c4': 'C4', 'ccnet': 'CCNet', 'arxiv': 'arXiv', 'github': 'GitHub'}
    seen, topics = set(), {}
    for index, step in enumerate(trace['steps']):
        name = function(step)
        if name and counts[name] >= 2 and name not in seen and (step['renderings'] or step['env']):
            seen.add(name)
            title = ' '.join(names.get(word, word) for word in name.split('_'))
            topics[index] = title[0].upper() + title[1:]
    return topics


def reading_trace(n, trace, source, assets):
    topics, inferred = [], inferred_topics(trace)
    for index, step in enumerate(trace['steps']):
        headings = [re.match(r'^(#{1,6})\s+([^\n]+)', r['data']) for r in step['renderings'] if r['type'] == 'markdown']
        headings = [item for item in headings if item]
        if headings or index in inferred or not topics:
            title = headings[0].group(2).strip() if headings else inferred.get(index, TITLES[n])
            topics.append({'title': title, 'start': index, 'depth': max(2, len(headings[0].group(1))) if headings else 2})
    out, previous_values = frontmatter(n), {}
    for number, topic in enumerate(topics):
        end = topics[number + 1]['start'] if number + 1 < len(topics) else len(trace['steps'])
        entries = {}
        for index in range(topic['start'], end):
            step = trace['steps'][index]
            frame = step['stack'][-1]
            key = (tuple((frame['path'], frame['function_name']) for frame in step['stack']), frame['line_number'])
            # A loop revisiting the same statement replaces its displayed result.
            # Preserve the complete history in slides.md, and the last result here.
            parts = rendering_parts(step['renderings'], source, assets)
            text = join_reading(parts)
            if text:
                entries[(key, 'output')] = (index, text)
            if any(value is not None for value in step['env'].values()):
                env = environment_at(trace, index)
                entries[(key, 'values')] = (index, env)
        parts = []
        for (_, kind), (index, content) in sorted(entries.items(), key=lambda item: item[1][0]):
            if kind == 'values':
                changed = {key: value for key, value in content.items() if previous_values.get(key) != value}
                previous_values.update(content)
                if not changed:
                    continue
                content = values_markdown(changed)
            parts.append(content)
        if not parts:
            continue
        out += f"\n(cs336-{n:02}-topic-{number + 1:03})=\n{'#' * topic['depth']} {topic['title']}\n\n{join_reading(parts)}\n"
    # Empty statements before the first rendered heading are not a document topic.
    out = out.replace('  slides: {}\n', '')
    return out, len(re.findall(r'^## ', out, re.M)) + 1


def convert_trace(n, source):
    name = f'lecture_{n:02}'
    raw = (source / 'var/traces' / f'{name}.json').read_bytes()
    trace = json.loads(raw)
    current = (source / f'{name}.py').read_text()
    if current != trace['files'][f'{name}.py']:
        (ROOT / 'source' / f'{name}.recorded.py').write_text(trace['files'][f'{name}.py'])
    ranges, records, assets = [], [], set()
    topic, count, seen_env = TITLES[n], 0, None
    inferred = inferred_topics(trace)
    for index, step in enumerate(trace['steps']):
        headings = [re.match(r'^#{1,6}\s+([^\n]+)', r['data']) for r in step['renderings'] if r['type'] == 'markdown']
        headings = [heading for heading in headings if heading]
        if headings or index in inferred:
            topic, count = headings[0].group(1).strip() if headings else inferred[index], 5
        inspection = bool(step['env']) and step['env'] != seen_env
        if step['renderings'] or inspection:
            if count >= 5 or not ranges:
                ranges.append({'section': len(ranges) + 1, 'start': index if ranges else 0, 'title': topic})
                count = 0
            count += bool(step['renderings']) + inspection
            if inspection:
                seen_env = step['env']
        for k, rendering in enumerate(step['renderings']):
            records.append({'step': index, 'rendering': k, 'type': rendering['type'], 'sha256': digest(json.dumps(rendering, sort_keys=True).encode())})
    out = frontmatter(n)
    for number, segment in enumerate(ranges):
        start, end = segment['start'], ranges[number + 1]['start'] - 1 if number + 1 < len(ranges) else len(trace['steps']) - 1
        segment['end'] = end
        out += f"\n(cs336-{n:02}-section-{number + 1:03})=\n## {segment['title']}\n\n"
        blocks, latest, mapping = [], {}, []
        previous_env, env_block, presentation, shown = {}, None, 0, False
        for index in range(start, end + 1):
            step = trace['steps'][index]
            line = step['stack'][-1]['line_number']
            parts = rendering_parts(step['renderings'], source, assets)
            content = '\n\n'.join(part for part in parts if part).strip()
            env = environment_at(trace, index)
            changes = bool(content) or env != previous_env
            if changes:
                if shown:
                    presentation += 1
                shown = True
                if content:
                    if line in latest:
                        blocks[latest[line]]['until'] = presentation
                    latest[line] = len(blocks)
                    blocks.append({'at': presentation, 'content': content, 'sourceStep': index, 'kind': 'output'})
                if env != previous_env:
                    if env_block is not None:
                        blocks[env_block]['until'] = presentation
                    env_block = None
                    if env:
                        env_block = len(blocks)
                        body = values_markdown(env)
                        blocks.append({'at': presentation, 'content': body, 'sourceStep': index, 'kind': 'values'})
                    previous_env = env
            mapping.append(presentation)
        segment['steps'], segment['sourceToStep'] = presentation, mapping
        segment['blocks'] = []
        for index, block in enumerate(blocks):
            label = f"cs336-{n:02}-{number + 1:03}-{block['kind']}-{index + 1:03}"
            delim = ':' * max(3, max((len(x) for x in re.findall(r':{3,}', block['content'])), default=0) + 1)
            out += f"{delim}{{slide}}\n:label: {label}\n:at: {block['at']}\n"
            if 'until' in block:
                out += f":until: {block['until']}\n"
            out += block['content'] + f'\n{delim}\n\n'
            segment['blocks'].append({key: value for key, value in {**block, 'label': label, 'contentSha256': digest(block['content'].encode())}.items() if key != 'content'})
    target = ROOT / name / 'lecture.md'
    target.parent.mkdir(exist_ok=True)
    out = out.replace('  web: {}\n', '').replace('  notebook: {}\n', '')
    (target.parent / 'slides.md').write_text(out)
    slides_hash = digest(out.encode())
    out, reading_sections = reading_trace(n, trace, source, assets)
    target.write_text(out)
    return {'documentSha256': digest(out.encode()), 'lecture': n, 'kind': 'python', 'title': TITLES[n], 'entry': str(target.relative_to(ROOT)), 'source': f'source/{name}.py', 'sourceSha256': digest(current.encode()), 'traceSha256': digest(raw), 'steps': len(trace['steps']), 'slidesEntry': f'{name}/slides.md', 'slidesSha256': slides_hash, 'readingSections': reading_sections, 'nativeSteps': ranges, 'renderings': records, 'inspections': sum(bool(s['env']) for s in trace['steps']), 'assets': sorted(assets), 'sections': len(ranges) + 1}


def reading_pdf(n, doc, folder):
    figures = folder / 'figures'
    figures.mkdir(exist_ok=True)
    out, previous_heading = frontmatter(n).replace('  slides: {}\n', ''), None
    for index, page in enumerate(doc):
        text = pymupdf4llm.to_markdown(doc, pages=[index], write_images=True,
            image_path=str(figures), image_format='png', show_progress=False).strip()
        tables = re.findall(r'(?:^\|[^\n]*\n?)+', text, re.M)
        malformed = any(len(re.findall(r'\bCol\d+\b', table)) >= 2 or len(table.splitlines()[0]) > 200 or any(
            any(len(cell) > 18 and cells.count(cell) >= 3 for cell in cells)
            for cells in [[cell.strip() for cell in row.split('|') if cell.strip()] for row in table.splitlines()]) for table in tables)
        if malformed:
            # Decorative rectangles can look like dozens of table cells. Re-extract
            # prose without those lines, retaining the independently captured figures.
            originals = re.findall(r'!\[[^\]]*\]\(([^)]+)\)', text)
            text = pymupdf4llm.to_markdown(doc, pages=[index], write_images=True,
                ignore_graphics=True, image_path=str(figures / 'text'), image_format='png', show_progress=False).strip()
            present = {digest(Path(path).read_bytes()) for path in re.findall(r'!\[[^\]]*\]\(([^)]+)\)', text)}
            for path in originals:
                checksum = digest(Path(path).read_bytes())
                if checksum not in present:
                    text += f'\n\n![]({path})'
                    present.add(checksum)
        # Colored footer rules are slide decoration, not document figures.
        def document_image(match):
            path = Path(match.group(1))
            with Image.open(path) as image:
                colors = image.resize((40, 40)).getcolors(1600)
                if image.width > image.height * 15 and colors and len(colors) < 8:
                    return ''
            return match.group(0)
        text = re.sub(r'!\[[^\]]*\]\(([^)]+)\)', document_image, text)
        text = text.replace(str(figures) + '/', 'figures/')
        if n == 3 and index == 0:
            text = re.sub(r'^#{0,6}\s*E V ER Y[^\n]+', "Everything you didn’t want to know about LM architecture and hyperparameters", text, flags=re.M)
        # Empty inferred table headers remain empty, instead of invented Col1 labels.
        text = re.sub(r'\bCol\d+\b(?=\|)', '', text)
        lines, page_heading = [], False
        for line in text.splitlines():
            line = line.strip()
            heading = re.match(r'^#{1,6}\s+(.+)', line)
            if heading:
                title = heading.group(1).strip().strip('*').strip()
                if not page_heading and len(title) <= 110:
                    page_heading = True
                    if title == previous_heading:
                        continue
                    line = '## ' + title
                    previous_heading = title
                else:
                    line = title
            if any(bullet in line for bullet in ['❖', '•', '●']):
                line = re.sub(r'[❖•●]\s*', '\n- ', line).strip()
            lines.append(line)
        out += f'\n(cs336-{n:02}-page-{index + 1:03})=\n\n{clean(chr(10).join(lines))}\n'
    return out


def pdf_slides(text):
    css = """<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>"""
    return re.sub(r'(^## [^\n]+\n)',
        lambda match: match.group(1) + '\n:::{hints}\nslides:\n  class: cs336-pdf-page\n:::\n\n' + css + '\n', text, flags=re.M)


def convert_pdf(n, source):
    name = f'lecture_{n:02}'
    path = source / f'{name}.pdf'
    doc = pymupdf.open(path)
    folder = ROOT / name
    folder.mkdir(exist_ok=True)
    images = folder / 'pages'
    images.mkdir(exist_ok=True)
    out = frontmatter(n)
    pages = []
    # Each page is converted independently so there is no implicit dropped-page limit.
    for index, page in enumerate(doc):
        text = pymupdf4llm.to_markdown(doc, pages=[index], ignore_images=True, ignore_graphics=True, show_progress=False).strip()
        plain = page.get_text(sort=True).strip()
        first = next((line.strip().strip('#* ') for line in text.splitlines() if line.strip().strip('#* ')), f'Page {index + 1}')
        title = re.sub(r'\s+', ' ', first)[:140]
        output = images / f'page-{index + 1:03}.webp'
        # Preserve vector diagrams and math exactly; text is not replaced by an OCR guess.
        if not output.exists():
            pix = page.get_pixmap(matrix=pymupdf.Matrix(2, 2), alpha=False)
            Image.frombytes('RGB', (pix.width, pix.height), pix.samples).save(output, lossless=True, method=4)
        out += f'\n(cs336-{n:02}-page-{index + 1:03})=\n## {title} · {index + 1}\n\n![Lecture {n}, page {index + 1}: {html.escape(title, quote=False)}](pages/{output.name})\n\n'
        mdfile = images / f'page-{index + 1:03}.md'
        mdfile.write_text(text + '\n')
        pages.append({'page': index + 1, 'image': str(output.relative_to(ROOT)), 'imageSha256': digest(output.read_bytes()), 'markdownSha256': digest(mdfile.read_bytes()), 'textCharacters': len(plain), 'textSha256': digest(plain.encode()), 'markdown': str(mdfile.relative_to(ROOT))})
        if (index + 1) % 20 == 0:
            print(f'{name}: {index + 1}/{len(doc)} pages', flush=True)
    out = out.replace('  web: {}\n', '').replace('  notebook: {}\n', '')
    out = pdf_slides(out)
    (folder / 'slides.md').write_text(out)
    slides_hash = digest(out.encode())
    out = reading_pdf(n, doc, folder)
    (folder / 'lecture.md').write_text(out)
    return {'slidesEntry': f'{name}/slides.md', 'slidesSha256': slides_hash, 'readingSections': len(re.findall(r'^## ', out, re.M)) + 1, 'documentSha256': digest(out.encode()), 'lecture': n, 'kind': 'pdf', 'title': TITLES[n], 'entry': f'{name}/lecture.md', 'source': f'source/{name}.pdf', 'sourceSha256': digest(path.read_bytes()), 'pages': pages, 'sections': len(doc) + 1}


def main():
    args = argparse.ArgumentParser()
    args.add_argument('--upstream', type=Path, required=True)
    args.add_argument('--only', type=int, nargs='*')
    options = args.parse_args()
    upstream = options.upstream.resolve()
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=upstream, text=True).strip()
    if commit != PIN:
        raise ValueError(f'Expected {PIN}, got {commit}')
    source = ROOT / 'source'
    source.mkdir(exist_ok=True)
    for item in upstream.iterdir():
        if item.name in ['images', 'var']:
            shutil.copytree(item, source / item.name, dirs_exist_ok=True)
        elif item.suffix in ['.py', '.pdf'] or item.name in ['README.md', 'pyproject.toml', 'uv.lock']:
            shutil.copy2(item, source / item.name)
    previous = ROOT / 'coverage.json'
    lectures = {row['lecture']: row for row in json.loads(previous.read_text())['lectures']} if previous.exists() else {}
    for n in options.only or range(1, 18):
        print(f'Converting {n:02}: {TITLES[n]}', flush=True)
        lectures[n] = convert_trace(n, upstream) if (source / f'lecture_{n:02}.py').exists() else convert_pdf(n, upstream)
        manifest = {'upstream': URL, 'commit': commit, 'lectures': [lectures[k] for k in sorted(lectures)]}
        previous.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print('Converted', len(lectures), 'lectures', flush=True)


if __name__ == '__main__':
    main()
