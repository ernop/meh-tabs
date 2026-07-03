# Security note — leaked AMO API key (2026-07-03)

The AMO (addons.mozilla.org) JWT API secret was committed to this **public** repo
in `amo-credentials.local` (issuer `AMO_JWT_ISSUER=user:5565935:440`).

## What was done

- History fully scrubbed: `git filter-branch` removed `amo-credentials.local` from
  all commits; backup refs + reflog purged; `gc`; force-pushed `master`. Verified
  the file and secret value are absent from every ref, local and remote.
- The file is gitignored (`amo-credentials.local` and `*.local`).

## Why it mattered

This account also owns the AMO extension `image-gallery-generator`
("4Chan Gallery Viewer WG", ~597 users). A compromised AMO key could push malware
to those users, so this was a real risk, not a false alarm.

## The real fix — key rotation (must confirm)

The repo is public, so scrubbing history is not enough — old commits may remain
reachable by direct SHA on GitHub until GitHub GCs them. **Rotation is the fix.**

- Revoke the leaked key and generate a new one at the AMO key page:
  https://addons.mozilla.org/en-US/developers/addon/api/key/
  (the older `/developers/addon-api/key/` URL is wrong.)
- Prefer publishing via the browser GUI login, which avoids the API key entirely;
  only use a freshly rotated key for `web-ext sign`.

**Open action:** confirm on the AMO site that the leaked key is revoked and a new
one exists. Once confirmed, this note can be deleted.
