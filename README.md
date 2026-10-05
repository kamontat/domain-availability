# Domain Availability

Check if domain is available to purchase or not.

## Get start

- Edit `data/input.yaml` to choose tlds and names
- To execute the command: `bun start`
- Available domains are printed to stdout when count <= `configs.stdoutLimit`, otherwise written to `outputs/YYYY-MM-DD/output-<tld>.txt` (one file per tld, e.g. `outputs/2026-09-15/output-in-th.txt`)

## Input

```yaml
## Other files to merge, relative to `data/` (`.yaml` is optional)
extends:
  - configs/common
  - tlds/common
configs:
  ## Default checkers of tld without `checkers`
  checkers: [rdap, whois, dns]
  chunkSize: 5
tlds:
  - suffix: com
  - suffix: in.th
    ## .th has no RDAP, skip it
    checkers: [pathosting, whois, dns]
names:
  - example
```

`extends` are resolved recursively in order; later files override earlier ones, and the current file overrides all of its extends.

- `configs`: merged by key, newer wins
- `tlds`: merged by `suffix`, newer wins
- `names`: merged without duplicates

Every name is combined with every tld (e.g. `example.com`).

## Checkers

Each domain tries the tld's `checkers` in order; the first definite answer (available or registered) wins. A failed or unclear answer falls back to the next checker. A checker without a server for the tld is dropped once for the whole tld.

- `rdap`: query RDAP server from [IANA bootstrap](https://data.iana.org/rdap/dns.json); not registered (404) means available. Works with most gTLDs and many ccTLDs.
- `whois`: find registry server from `whois.iana.org`, then query it on port 43 and match "not found"-style text. Works with most ccTLDs (e.g. `.th`).
- `pathosting`: [PAT hosting](https://services.pathosting.co.th) API, Thai tlds only (e.g. `in.th`, `co.th`). Not in default `checkers`; add it per tld.
- `dns`: NS lookup; NXDOMAIN means available. Unverified: a registered domain without nameservers also looks available, so keep it last.
