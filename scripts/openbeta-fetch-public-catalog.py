#!/usr/bin/env python3
"""Fetch only public area/climb catalog columns from production D1.

The output is a catalog-only SQL snapshot suitable for openbeta-reconcile.py.
No user, account, session, send, journal, or moderation rows are queried.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path


AREA_COLUMNS = ("id", "parent_id", "name", "description")
CLIMB_COLUMNS = (
    "id", "area_id", "name", "type", "grade", "description",
    "send_count", "rating_sum", "rating_count",
)
SCHEMA = """PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE IF NOT EXISTS "areas" (
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "parent_id" integer,
  "name" text NOT NULL,
  "description" text,
  FOREIGN KEY ("parent_id") REFERENCES "areas"("id") ON UPDATE no action ON DELETE restrict
);
"""
CLIMB_SCHEMA = """CREATE TABLE IF NOT EXISTS "climbs" (
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "area_id" integer NOT NULL,
  "name" text NOT NULL,
  "type" text NOT NULL,
  "grade" integer,
  "description" text,
  "send_count" integer DEFAULT 0 NOT NULL,
  "rating_sum" integer DEFAULT 0 NOT NULL,
  "rating_count" integer DEFAULT 0 NOT NULL,
  "avg_rating" real GENERATED ALWAYS AS
    (CASE WHEN rating_count > 0 THEN CAST(rating_sum AS REAL) / rating_count ELSE NULL END) VIRTUAL,
  FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON UPDATE no action ON DELETE restrict
);
"""


def sql_value(value: object) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, int):
        return str(value)
    if not isinstance(value, str):
        raise ValueError(f"Unexpected public catalog value type: {type(value).__name__}")
    return "'" + value.replace("'", "''") + "'"


def query(database: str, sql: str) -> list[dict]:
    env = os.environ.copy()
    env.setdefault("WRANGLER_LOG_PATH", "/tmp/betabook-wrangler-catalog.log")
    completed = subprocess.run(
        ["pnpm", "exec", "wrangler", "d1", "execute", database, "--remote",
         "--json", "--command", sql],
        capture_output=True, text=True, env=env, check=False,
    )
    if completed.returncode:
        raise RuntimeError(f"Read-only D1 catalog query failed: {completed.stderr[-500:]}")
    try:
        result = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError("Wrangler did not return JSON for a catalog query") from error
    if len(result) != 1 or not result[0].get("success") or result[0]["meta"].get("changes"):
        raise RuntimeError("Unexpected result for a read-only catalog query")
    return result[0]["results"]


def counts(database: str) -> tuple[int, int, int, int]:
    rows = query(database, "SELECT (SELECT COUNT(*) FROM areas) AS areas, "
                 "(SELECT MAX(id) FROM areas) AS max_area, "
                 "(SELECT COUNT(*) FROM climbs) AS climbs, "
                 "(SELECT MAX(id) FROM climbs) AS max_climb")
    if len(rows) != 1:
        raise RuntimeError("Catalog count query returned no single row")
    row = rows[0]
    return row["areas"], row["max_area"], row["climbs"], row["max_climb"]


def fetch_table(database: str, table: str, columns: tuple[str, ...],
                batch_size: int, output) -> tuple[int, int]:
    column_sql = ",".join(columns)
    quoted = ",".join(f'"{column}"' for column in columns)
    last_id = 0
    count = 0
    while True:
        rows = query(database, f"SELECT {column_sql} FROM {table} "
                     f"WHERE id>{last_id} ORDER BY id LIMIT {batch_size}")
        if not rows:
            break
        for row in rows:
            if set(row) != set(columns) or not isinstance(row["id"], int) or row["id"] <= last_id:
                raise RuntimeError(f"Unexpected {table} row order or columns")
            output.write(f'INSERT INTO "{table}" ({quoted}) VALUES('
                         + ",".join(sql_value(row[column]) for column in columns) + ");\n")
            last_id = row["id"]
            count += 1
        if count % 10000 < len(rows):
            print(f"Fetched {count:,} public {table} rows", file=sys.stderr, flush=True)
    return count, last_id


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", default="DB")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--batch-size", type=int, default=1000)
    args = parser.parse_args()
    if args.batch_size < 1 or args.batch_size > 2000:
        raise ValueError("batch size must be between 1 and 2000")
    if args.output.exists():
        raise FileExistsError(f"Refusing to overwrite {args.output}")
    before = counts(args.database)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    staging = args.output.with_suffix(args.output.suffix + ".staging")
    if staging.exists():
        raise FileExistsError(f"Refusing to overwrite {staging}")
    try:
        with staging.open("x") as output:
            output.write(SCHEMA)
            areas = fetch_table(args.database, "areas", AREA_COLUMNS, args.batch_size, output)
            output.write(CLIMB_SCHEMA)
            climbs = fetch_table(args.database, "climbs", CLIMB_COLUMNS, args.batch_size, output)
        after = counts(args.database)
        if before != after or (areas[0], areas[1], climbs[0], climbs[1]) != before:
            raise RuntimeError(f"Catalog changed while fetching: before={before}, after={after}, "
                               f"fetched={(areas[0], areas[1], climbs[0], climbs[1])}")
        # Verify the public-only SQL can be loaded without any private tables.
        check = sqlite3.connect(":memory:")
        try:
            check.executescript("BEGIN;\n" + staging.read_text() + "\nCOMMIT;")
            if check.execute("PRAGMA foreign_key_check").fetchall():
                raise RuntimeError("Catalog-only snapshot has invalid foreign keys")
        finally:
            check.close()
        staging.replace(args.output)
        print(f"Catalog-only snapshot: {args.output} ({before[0]:,} areas, "
              f"{before[2]:,} climbs)")
    except BaseException:
        staging.unlink(missing_ok=True)
        raise


if __name__ == "__main__":
    main()
