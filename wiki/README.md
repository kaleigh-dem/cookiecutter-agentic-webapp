# Wiki source

This directory is the authoritative, reviewable source for the SteadyStack GitHub Wiki. GitHub renders the wiki from the separate hidden `steady-stack.wiki.git` repository, which does not provide the normal pull-request workflow used by the main repository.

## Publication

After reviewed `wiki/` changes reach `main`, `.github/workflows/wiki-publish.yml`:

1. clones the current rendered wiki;
2. copies every top-level `wiki/*.md` file over its rendered counterpart;
3. preserves pages that exist only in the rendered wiki;
4. verifies required pages, the Home link, and every sidebar page target;
5. refuses staged page deletions;
6. publishes only when the rendered wiki differs.

The workflow can also be dispatched manually as **Publish reviewed wiki**.

## Manual fallback

Use the checked-in procedure in [`docs/wiki-publication.md`](https://github.com/kaleigh-dem/steady-stack/blob/main/docs/wiki-publication.md) only when automated publication cannot push to the hidden wiki repository.

Do not delete wiki-only pages while synchronizing reviewed source. Inspect the rendered wiki after publication and verify every sidebar link, the SteadyStack identity migration page, operational pages, and source-repository links.
