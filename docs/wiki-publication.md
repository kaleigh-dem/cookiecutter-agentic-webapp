# Publishing the reviewed GitHub Wiki source

The authoritative, reviewable wiki source lives under `wiki/` in the main repository. The rendered GitHub Wiki is stored in the separate hidden Git repository at `steady-stack.wiki.git`, which does not support the normal pull-request review flow.

## Automated publication

`.github/workflows/wiki-publish.yml` runs after a change under `wiki/` reaches `main`. It:

1. checks out the reviewed main-repository source;
2. clones the current rendered wiki;
3. copies every reviewed top-level `wiki/*.md` file over the corresponding rendered page;
4. removes only rendered pages explicitly listed in `wiki/deletions.txt`;
5. preserves every other page that exists only in the rendered wiki;
6. verifies required operational pages, the Home-to-Agentic-Development-Model link, and every sidebar page target;
7. rejects any staged deletion that is not listed in the reviewed deletion manifest;
8. displays the changed page list and pushes only when the rendered wiki differs.

The workflow may also be run manually with **Publish reviewed wiki** in GitHub Actions.

## Review a page deletion

A rendered page may be removed only through the reviewed deletion manifest:

1. Delete the corresponding Markdown source from `wiki/`.
2. Remove all navigation and cross-page references.
3. Add the top-level Markdown filename to `wiki/deletions.txt`.
4. Update page inventories and publication checks that referenced the page.
5. Confirm the publication diff contains no unrelated deletion.

Manifest entries must be top-level `.md` filenames. An entry fails validation when the corresponding source file still exists under `wiki/`. The manifest is retained as an auditable record, and repeated publication remains idempotent when a listed page is already absent from the rendered wiki.

## Manual fallback

Use this only when the automated workflow cannot publish. Start from a clean temporary directory and authenticate with an account that can write the repository wiki.

```bash
git clone https://github.com/kaleigh-dem/steady-stack.git
cd steady-stack
git switch main
git pull --ff-only

cd ..
git clone https://github.com/kaleigh-dem/steady-stack.wiki.git
```

Copy reviewed pages:

```bash
find steady-stack/wiki -maxdepth 1 -type f -name '*.md' -print0 \
  | while IFS= read -r -d '' source; do
      cp "$source" "steady-stack.wiki/$(basename "$source")"
    done
```

Apply only reviewed deletions:

```bash
python <<'PY'
from pathlib import Path

source = Path('steady-stack/wiki')
rendered = Path('steady-stack.wiki')
manifest = source / 'deletions.txt'

for line_number, raw in enumerate(
    manifest.read_text(encoding='utf-8').splitlines(), start=1
):
    name = raw.split('#', 1)[0].strip()
    if not name:
        continue

    page = Path(name)
    if page.name != name or page.suffix != '.md':
        raise SystemExit(
            f'{manifest}:{line_number}: expected a top-level Markdown filename'
        )
    if (source / page).exists():
        raise SystemExit(
            f'{manifest}:{line_number}: deletion target still exists in wiki/: {name}'
        )

    (rendered / page).unlink(missing_ok=True)
PY
```

Inspect before publishing:

```bash
cd steady-stack.wiki
git status --short
git diff --check
git diff --stat
git diff
```

Stage the candidate and confirm every deleted filename appears in `../steady-stack/wiki/deletions.txt`:

```bash
git add --all -- '*.md'
git diff --cached --name-status
git diff --cached --diff-filter=D --name-only
```

Publish only after confirming that no unrelated deletion is staged:

```bash
git commit -m "Publish reviewed wiki source"
git push origin HEAD
```

## Post-publication verification

Verify the rendered wiki, not only the checked-in source:

- every `_Sidebar` link resolves;
- Home links to Agentic Development Model;
- every page in `wiki/deletions.txt` is absent;
- the source-repository links target `kaleigh-dem/steady-stack`;
- Home and Releases and Upgrades use the current SteadyStack repository, package, plugin, upgrade, and artifact names;
- Image Supply Chain and Releases and Upgrades describe supply-chain evidence and immutable digest promotion;
- Authentication and Authorization, Database and Data Management, Worker and Background Jobs, Containers and Preview Environments, Troubleshooting, and CI Diagnostics exist;
- any page that existed only in the prior rendered wiki remains present unless its filename is in the reviewed deletion manifest.

If the rendered content differs from `wiki/`, treat `wiki/` as the reviewed source, correct the publication mechanism, and rerun publication rather than editing the rendered page independently.
