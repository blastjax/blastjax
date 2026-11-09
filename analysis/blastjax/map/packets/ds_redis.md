# Node ds:redis: Redis cache
Kind: datastore
## Outgoing connections
- none

## Incoming connections
- cache.py (be:core:cache) -> read
- cache.py (be:core:cache) -> write
