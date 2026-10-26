#!/usr/bin/env python3
"""
Switch every integer ``id``, and every foreign key pointing at one, to a UUID,
keeping every row and every link between rows. One transaction; does nothing
once the ids are UUIDs, so it's safe to re-run.

The integer-id tables move, untouched, into the ``pre_uuid_ids`` schema as a
backup; ``schema.py`` builds the UUID tables in their place; the rows are
copied across with each old id swapped for a new uuid7. The new ids are handed
out in old-id order, so ORDER BY id still means oldest first. Once the app
looks right, drop the backup:

    DROP SCHEMA pre_uuid_ids CASCADE;

A column ``schema.py`` has but a table lacks stops it before anything changes:
run that column's ``add_*.py`` script first.

The deploy runs it with the new API image, before the API starts:

    docker compose run --rm --no-deps api python scripts/migrate_ids_to_uuid.py [--dry-run]

Reads the Postgres URL from ``DATABASE_URL``, like the API.
"""

from __future__ import annotations

import argparse
import sys
import uuid
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

BACKUP = "pre_uuid_ids"


def migrate(conn: Any) -> str:
    from sqlalchemy import BigInteger, Column, Integer, MetaData, PrimaryKeyConstraint, Table, Text, Uuid, inspect, text
    from sqlalchemy.dialects.postgresql import insert

    import schema

    insp = inspect(conn)
    present = set(insp.get_table_names())
    tables = [t for t in schema.Base.metadata.sorted_tables if t.name in present]
    remapped = {
        t.name
        for t in tables
        if "id" in t.c and isinstance({c["name"]: c["type"] for c in insp.get_columns(t.name)}["id"], Integer)
    }
    if not remapped:
        return "ids are already UUIDs; nothing to do"

    # A deploy waiting on a busy table should fail, not hang; the transaction then changes nothing.
    conn.execute(text("SET LOCAL lock_timeout = '30s'"))
    conn.execute(text(f"CREATE SCHEMA {BACKUP}"))
    for t in tables:
        conn.execute(text(f'ALTER TABLE "{t.name}" SET SCHEMA {BACKUP}'))
    schema.Base.metadata.create_all(conn)

    id_map = Table(
        "uuid_id_map",
        MetaData(),
        Column("tbl", Text),
        Column("old", BigInteger),
        Column("new", Uuid),
        PrimaryKeyConstraint("tbl", "old"),
        prefixes=["TEMPORARY"],
        postgresql_on_commit="DROP",
    )
    id_map.create(conn)
    for name in sorted(remapped):
        old_ids = conn.execute(text(f'SELECT id FROM {BACKUP}."{name}" ORDER BY id')).scalars().all()
        if old_ids:
            conn.execute(insert(id_map), [{"tbl": name, "old": i, "new": uuid.uuid7()} for i in old_ids])

    copied = 0
    for t in tables:
        old_cols = {c["name"] for c in inspect(conn).get_columns(t.name, schema=BACKUP)}
        missing = [c.name for c in t.c if c.name not in old_cols]
        if missing:
            raise RuntimeError(f"{t.name} has no {', '.join(missing)}: run its add_*.py script first")
        exprs, joins = [], []
        for c in t.c:
            parent = t.name if c.name == "id" else next((fk.column.table.name for fk in c.foreign_keys), None)
            if parent in remapped:
                m = f"m{len(joins)}"
                joins.append(f"LEFT JOIN uuid_id_map {m} ON {m}.tbl = '{parent}' AND {m}.old = o.\"{c.name}\"")
                exprs.append(f"{m}.new")
            else:
                exprs.append(f'o."{c.name}"')
        cols = ", ".join(f'"{c.name}"' for c in t.c)
        rows = conn.execute(
            text(f'INSERT INTO "{t.name}" ({cols}) SELECT {", ".join(exprs)} FROM {BACKUP}."{t.name}" o {" ".join(joins)}')
        ).rowcount
        before = conn.scalar(text(f'SELECT count(*) FROM {BACKUP}."{t.name}"'))
        if rows != before:
            raise RuntimeError(f"{t.name}: copied {rows} of {before} rows")
        copied += rows

    return f"{len(remapped)} table(s) now have UUID ids; copied {copied} rows; the old tables are in {BACKUP}"


def main() -> int:
    ap = argparse.ArgumentParser(description="Switch integer ids to UUIDs.")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    from sqlalchemy import create_engine

    import db

    url = db.database_url()
    if not url:
        sys.exit("DATABASE_URL is not set to a Postgres URL")

    engine = create_engine("postgresql+psycopg2://" + url.split("://", 1)[1])
    with engine.connect() as conn:
        tx = conn.begin()
        print(migrate(conn))
        if args.dry_run:
            tx.rollback()
            print("--dry-run: rolled back, nothing changed")
        else:
            tx.commit()
    engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
