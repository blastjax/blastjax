# Node ext:nominatim: Nominatim (reverse geocode)
Kind: datastore
## Outgoing connections
- none

## Incoming connections
- routers/travel.py (be:router:travel) -> call
- schemas/ (Pydantic) (be:schemas) -> call
