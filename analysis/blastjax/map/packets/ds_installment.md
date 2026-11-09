# Node ds:installment: installment
Kind: datastore
## Outgoing connections
- none

## Incoming connections
- routers/credit_card.py (be:router:credit_card) -> read
- routers/installment.py (be:router:installment) -> read
- routers/installment.py (be:router:installment) -> write
- routers/search.py (be:router:search) -> read
