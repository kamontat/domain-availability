# Domain Availability

Check if domain is available to purchase or not.

## Get start

- Edit `data/input.yaml` to choose tlds and names
- To execute the command: `bun start`
- Checked domains are printed to stdout when count <= `configs.outputStdoutLimit` (default 20), otherwise written per tld to `outputs/YYYY-MM-DD/available-<tld>.txt` (one domain per line) and `outputs/YYYY-MM-DD/registered-<tld>.txt` (`<domain> <checker>` per line), e.g. `outputs/2026-09-15/available-in-th.txt`

## Input

```yaml
## Other files to merge, relative to `data/` (`.yaml` is optional)
extends:
  - configs/common
  - tlds/common
configs:
  ## Domains checked concurrently (default: 5)
  checkerChunk: 5
  ## Timeout per checker request in milliseconds (default: 5000)
  checkerTimeout: 5000
  ## Retries per checker request (default: 3)
  checkerRetries: 3
  ## Backoff before first retry in milliseconds (default: 200)
  checkerBackoffInit: 200
  ## Backoff multiplier after each retry (default: 1.5)
  checkerBackoffFactor: 1.5
  ## Maximum backoff between retries in milliseconds (default: 10000)
  checkerBackoffMax: 10000
  ## Print available domains to stdout when total <= limit, otherwise write files; 0 always writes files (default: 20)
  outputStdoutLimit: 20
  ## Checkers per tld suffix; tld without entry uses its parent suffix, then `_default`
  checkers:
    _default: [rdap, whois, dns]
    ## .th has no RDAP, skip it
    in.th: [pathosting, whois, dns]
tlds:
  - com
  - in.th
names:
  - example
```

`extends` are resolved recursively in order; later files override earlier ones, and the current file overrides all of its extends.

- `configs.checkers`: merged by suffix, newer wins
- `tlds`: merged without duplicates
- `names`: merged without duplicates

Every name is combined with every tld (e.g. `example.com`).

## Checkers

Each domain tries the tld's `checkers` in order; the first definite answer (available or registered) wins. A failed or unclear answer falls back to the next checker. A checker without a server for the tld is dropped once for the whole tld.

- `rdap`: query RDAP server from [IANA bootstrap](https://data.iana.org/rdap/dns.json); not registered (404) means available. Works with most gTLDs and many ccTLDs.
- `whois`: find registry server from `whois.iana.org`, then query it on port 43 and match "not found"-style text. Works with most ccTLDs (e.g. `.th`).
- `pathosting`: [PAT hosting](https://services.pathosting.co.th) API, Thai tlds only (e.g. `in.th`, `co.th`). Not in `_default` checkers; add it per tld in `configs.checkers`.
- `dns`: NS lookup; NXDOMAIN means available. Unverified: a registered domain without nameservers also looks available, so keep it last.
