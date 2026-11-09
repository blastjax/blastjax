# Node ds:travel_trip: travel_trip
Kind: datastore
## Outgoing connections
- none

## Incoming connections
- routers/search.py (be:router:search) -> read
- routers/travel.py (be:router:travel) -> read
- routers/travel.py (be:router:travel) -> write
