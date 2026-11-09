# Node be:scripts: scripts/ (migrations)
Kind: module
Language: python, 798 lines of code, location: backend/scripts

Files in this directory (largest first):
- backend/scripts/migrate_ids_to_uuid.py
- backend/scripts/bill_accuracy.py
- backend/scripts/add_page_link_columns.py
- backend/scripts/add_credit_card_budget_columns.py
- backend/scripts/add_credit_card_bill_link.py
- backend/scripts/add_bill_minimum_due.py
- backend/scripts/add_bill_defaults.py
- backend/scripts/add_monthly_expense_skipped_months.py
- backend/scripts/add_monthly_expense_date.py
- backend/scripts/add_calendar_saved.py
- backend/scripts/add_travel_paid_price.py
- backend/scripts/add_bills.py
- backend/scripts/add_passkeys.py
- backend/scripts/sync_schema.py

Source excerpt: backend/scripts/migrate_ids_to_uuid.py (first 132 lines)
```
   1  #!/usr/bin/env python3
   2  """
   3  Switch every integer ``id``, and every foreign key pointing at one, to a UUID,
   4  keeping every row and every link between rows. One transaction; does nothing
   5  once the ids are UUIDs, so it's safe to re-run.
   6  
   7  The integer-id tables move, untouched, into the ``pre_uuid_ids`` schema as a
   8  backup; ``schema.py`` builds the UUID tables in their place; the rows are
   9  copied across with each old id swapped for a new uuid7. The new ids are handed
  10  out in old-id order, so ORDER BY id still means oldest first. Once the app
  11  looks right, drop the backup:
  12  
  13      DROP SCHEMA pre_uuid_ids CASCADE;
  14  
  15  A column ``schema.py`` has but a table lacks stops it before anything changes:
  16  run that column's ``add_*.py`` script first.
  17  
  18  The deploy runs it with the new API image, before the API starts:
  19  
  20      docker compose run --rm --no-deps api python scripts/migrate_ids_to_uuid.py [--dry-run]
  21  
  22  Reads the Postgres URL from ``DATABASE_URL``, like the API.
  23  """
  24  
  25  from __future__ import annotations
  26  
  27  import argparse
  28  import sys
  29  import uuid
  30  from pathlib import Path
  31  from typing import Any
  32  
  33  sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
  34  
  35  BACKUP = "pre_uuid_ids"
  36  
  37  
  38  def migrate(conn: Any) -> str:
  39      from sqlalchemy import BigInteger, Column, Integer, MetaData, PrimaryKeyConstraint, Table, Text, Uuid, inspect, text
  40      from sqlalchemy.dialects.postgresql import insert
  41  
  42      import schema
  43  
  44      insp = inspect(conn)
  45      present = set(insp.get_table_names())
  46      tables = [t for t in schema.Base.metadata.sorted_tables if t.name in present]
  47      remapped = {
  48          t.name
  49          for t in tables
  50          if "id" in t.c and isinstance({c["name"]: c["type"] for c in insp.get_columns(t.name)}["id"], Integer)
  51      }
  52      if not remapped:
  53          return "ids are already UUIDs; nothing to do"
  54  
  55      # A deploy waiting on a busy table should fail, not hang; the transaction then changes nothing.
  56      conn.execute(text("SET LOCAL lock_timeout = '30s'"))
  57      conn.execute(text(f"CREATE SCHEMA {BACKUP}"))
  58      for t in tables:
  59          conn.execute(text(f'ALTER TABLE "{t.name}" SET SCHEMA {BACKUP}'))
  60      schema.Base.metadata.create_all(conn)
  61  
  62      id_map = Table(
  63          "uuid_id_map",
  64          MetaData(),
  65          Column("tbl", Text),
  66          Column("old", BigInteger),
  67          Column("new", Uuid),
  68          PrimaryKeyConstraint("tbl", "old"),
  69          prefixes=["TEMPORARY"],
  70          postgresql_on_commit="DROP",
  71      )
  72      id_map.create(conn)
  73      for name in sorted(remapped):
  74          old_ids = conn.execute(text(f'SELECT id FROM {BACKUP}."{name}" ORDER BY id')).scalars().all()
  75          if old_ids:
  76              conn.execute(insert(id_map), [{"tbl": name, "old": i, "new": uuid.uuid7()} for i in old_ids])
  77  
  78      copied = 0
  79      for t in tables:
  80          old_cols = {c["name"] for c in inspect(conn).get_columns(t.name, schema=BACKUP)}
  81          missing = [c.name for c in t.c if c.name not in old_cols]
  82          if missing:
  83              raise RuntimeError(f"{t.name} has no {', '.join(missing)}: run its add_*.py script first")
  84          exprs, joins = [], []
  85          for c in t.c:
  86              parent = t.name if c.name == "id" else next((fk.column.table.name for fk in c.foreign_keys), None)
  87              if parent in remapped:
  88                  m = f"m{len(joins)}"
  89                  joins.append(f"LEFT JOIN uuid_id_map {m} ON {m}.tbl = '{parent}' AND {m}.old = o.\"{c.name}\"")
  90                  exprs.append(f"{m}.new")
  91              else:
  92                  exprs.append(f'o."{c.name}"')
  93          cols = ", ".join(f'"{c.name}"' for c in t.c)
  94          rows = conn.execute(
  95              text(f'INSERT INTO "{t.name}" ({cols}) SELECT {", ".join(exprs)} FROM {BACKUP}."{t.name}" o {" ".join(joins)}')
  96          ).rowcount
  97          before = conn.scalar(text(f'SELECT count(*) FROM {BACKUP}."{t.name}"'))
  98          if rows != before:
  99              raise RuntimeError(f"{t.name}: copied {rows} of {before} rows")
 100          copied += rows
 101  
 102      return f"{len(remapped)} table(s) now have UUID ids; copied {copied} rows; the old tables are in {BACKUP}"
 103  
 104  
 105  def main() -> int:
 106      ap = argparse.ArgumentParser(description="Switch integer ids to UUIDs.")
 107      ap.add_argument("--dry-run", action="store_true")
 108      args = ap.parse_args()
 109  
 110      from sqlalchemy import create_engine
 111  
 112      import db
 113  
 114      url = db.database_url()
 115      if not url:
 116          sys.exit("DATABASE_URL is not set to a Postgres URL")
 117  
 118      engine = create_engine("postgresql+psycopg2://" + url.split("://", 1)[1])
 119      with engine.connect() as conn:
 120          tx = conn.begin()
 121          print(migrate(conn))
 122          if args.dry_run:
 123              tx.rollback()
 124              print("--dry-run: rolled back, nothing changed")
 125          else:
 126              tx.commit()
 127      engine.dispose()
 128      return 0
 129  
 130  
 131  if __name__ == "__main__":
 132      raise SystemExit(main())
```

## Outgoing connections
- call -> db.py (be:core:db)
- call -> schema.py (be:core:schema)
- call -> services/bill_extract.py (be:service:bill_extract)
- call -> services/payslip_parse.py (be:service:payslip_parse)

## Incoming connections
- none
