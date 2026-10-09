# Attributed message fixtures

These are synthetic `NSAttributedString`/`NSMutableAttributedString` archives created by
Foundation on macOS 15.7.2. No Messages database or personal message is used. Each archive includes
the ordinary Messages attribute key that the former printable-run heuristic mistook for a
short message. Gzip keeps the 70,000-byte length case small in Git. Expected text is `text`
repeated `repeat` times, independently of the decoder.

Regenerate from this directory:

```sh
clang -framework Foundation -Wno-deprecated-declarations generate.m -o /tmp/sia-generate-messages
/tmp/sia-generate-messages > /tmp/sia-native-message-fixtures.json
python3 - <<'PY'
import base64, gzip, json
from pathlib import Path
rows = json.loads(Path('/tmp/sia-native-message-fixtures.json').read_text())
for row in rows:
    raw = base64.b64decode(row.pop('archiveBase64'))
    row['archiveGzipBase64'] = base64.b64encode(gzip.compress(raw, mtime=0)).decode()
Path('attributed-bodies.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n')
PY
```

The production decoder follows only the root attributed string and its underlying string.
It does not instantiate archived Objective-C objects or search the attribute dictionary for
printable text. Binary lengths, byte order and reference tables follow the typedstream format;
the [python-typedstream format reader](https://github.com/dgelessus/python-typedstream/blob/main/src/typedstream/stream.py)
was consulted as a format reference. The implementation is covered by the independently
generated Foundation fixtures above, including mutable strings, multiple attribute runs,
Unicode, line breaks, attachment placeholders and 1/2/4-byte lengths.
