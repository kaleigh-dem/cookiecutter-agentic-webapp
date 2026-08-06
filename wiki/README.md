# Wiki source

This directory is the authoritative, reviewable source for the SteadyStack GitHub Wiki. GitHub renders the wiki from the separate hidden `steady-stack.wiki.git` repository, which does not provide the normal pull-request workflow used by the main repository.

## Publication

After reviewed `wiki/` changes reach `main`, `.github/workflows/wiki-publish.yml`:

1. clones the current rendered wiki;
2. copies every top-level `wiki/*.md` file over its rendered counterpart;
3. removes only rendered pages explicitly listed in `wiki/deletions.txt`;
4. preserves every other page that exists only in the rendered wiki;
5. verifies required pages, the Home link, and every sidebar page target;
6. rejects staged deletions that are not in the reviewed manifest;
7. publishes only when the rendered wiki differs.

The workflow can also be dispatched manually as **Publish reviewed wiki**.

## Reviewed deletions

To delete a rendered page, remove its source file, remove all links to it, and add its top-level `.md` filename to `wiki/deletions.txt`. A manifest entry is invalid while the corresponding source file still exists. Entries remain in the manifest as an auditable and idempotent deletion record.

## Manual fallback

Use the checked-in procedure in [`docs/wiki-publication.md`](https://github.com/kaleigh-dem/steady-stack/blob/main/docs/wiki-publication.md) only when automated publication cannot push to the hidden wiki repository.

Inspect the rendered wiki after publication and verify every sidebar link, every approved deletion, current SteadyStack names on Home and Releases and Upgrades, operational pages, and source-repository links.
