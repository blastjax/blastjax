# Node ds:installment_line: installment_line
Kind: datastore
## Outgoing connections
- none

## Incoming connections
- routers/credit_card.py (be:router:credit_card) -> read
- routers/installment.py (be:router:installment) -> read
- routers/installment.py (be:router:installment) -> write
