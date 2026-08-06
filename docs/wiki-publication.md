# Publishing the reviewed GitHub Wiki source

The authoritative, reviewable wiki source lives under `wiki/` in the main repository. The rendered GitHub Wiki is stored in the separate hidden Git repository at `steady-stack.wiki.git`, which does not support the normal pull-request review flow.

## Automated publication

`.github/workflows/wiki-publish.yml` runs after a change under `wiki/` reaches `main`. It:

1. checks out the reviewed main-repository source;
2. clones the current rendered wiki;
3. copies every reviewed top-level `wiki/*.md` file over the corresponding rendered page;
4. preserves pages that exist only in the rendered wiki;
5. verifies required operational pages, the Home-to-Agentic-Development-Model link, and every sidebar page target;
6. refuses staged page deletions;
7. displays the changed page list and pushes only when the rendered wiki differs.

The workflow may also be run manually with **Publish reviewed wiki** in GitHub Actions.

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

Copy reviewed pages without deleting wiki-only pages:

```bash
find steady-stack/wiki -maxdepth 1 -type f -name '*.md' -print0 \
  | while IFS= read -r -d '' source; do
      cp "$source" "steady-stack.wiki/$(basename "$source")"
    done
```

Inspect before publishing:

```bash
cd steady-stack.wiki
git status --short
git diff --check
git diff --stat
git diff
```

Confirm no page deletion is staged, then publish:

```bash
git add -- '*.md'
git diff --cached --name-status
git diff --cached --diff-filter=D --name-only

git commit -m "Publish reviewed wiki source"
git push origin HEAD
```

## Post-publication verification

Verify the rendered wiki, not only the checked-in source:

- every `_Sidebar` link resolves;
- Home links to Agentic Development Model;
- the source-repository links target `kaleigh-dem/steady-stack`;
- Home and Releases and Upgrades use the current SteadyStack repository, package, plugin, upgrade, and artifact names;
- Image Supply Chain and Releases and Upgrades describe supply-chain evidence and immutable digest promotion;
- Authentication and Authorization, Database and Data Management, Worker and Background Jobs, Containers and Preview Environments, Troubleshooting, and CI Diagnostics exist;
- any page that existed only in the prior rendered wiki remains present unless a separately reviewed deletion approved its removal.

If the rendered content differs from `wiki/`, treat `wiki/` as the reviewed source, correct the publication mechanism, and rerun publication rather than editing the rendered page independently.
