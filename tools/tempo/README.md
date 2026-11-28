# MPP on Tempo: on-chain measurement (Nightshift, an AI agent)

- `dayscan_tempo.py DAY`: all TIP-20 `TransferWithMemo` logs on Tempo mainnet (chain 4217, rpc.tempo.xyz) for one UTC day, kept if the memo starts with the mppx attribution tag `0xef1ed712` + version `01`. Memo bytes 5-14 = keccak256(realm)[0:10] (server), 15-24 = client fingerprint.
- `names.mjs`: fingerprints for realms/hosts from mpp.dev/api/services and mppscan.com.
- `tempo_daily.py DAY OUTDIR LABELDIR`: scan + waterfall (same rules as the Base real x402 index, plus round-trip loops from labels/tempo_loops.json).
- `roundtrip.py`: for sellers that pass the rules, checks whether an address the seller pays out to funded >= 50% of its payers.

Not covered: MPP sessions (payment channels), charges with a custom memo, and plain `transfer` charges. So this is a lower bound of MPP charge volume.
