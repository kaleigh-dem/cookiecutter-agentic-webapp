# Wiki update source

This directory contains the reviewable files changed by this GitHub Wiki update. GitHub stores the rendered wiki in a hidden `.wiki.git` repository that is not available through the connected GitHub contents API and does not provide the normal pull-request workflow used by this repository.

After approval, apply these files over the existing wiki checkout from an authenticated workstation:

```bash
git clone https://github.com/kaleigh-dem/nx-fullstack-platform.wiki.git
cd nx-fullstack-platform.wiki
cp ../nx-fullstack-platform/wiki/*.md .
git add -A
git diff --check
git commit -m "docs: update supply-chain and release wiki guidance"
git push
```

Do not delete unchanged wiki pages. Copy these reviewed files over the existing checkout.
