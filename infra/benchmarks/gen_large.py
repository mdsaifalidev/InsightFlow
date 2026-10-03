"""Deterministic benchmark dataset: 1M order rows x 12 columns as CSV (PRD §7:
"100MB CSV, ~1M rows x 12 cols"). Values come from hashes of the row number,
so every run produces the same bytes.

    uv run --project services/data-py python infra/benchmarks/gen_large.py [rows] [out.csv]
"""

import sys
import time
from pathlib import Path

import polars as pl

ROWS = int(sys.argv[1]) if len(sys.argv) > 1 else 1_000_000
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).parent / "data" / "orders_1m.csv"

REGIONS = ["North America", "Europe", "Asia Pacific", "Latin America", "Middle East", "Africa"]
CATEGORIES = ["Electronics", "Home & Kitchen", "Toys", "Books", "Beauty", "Sports", "Garden", "Grocery"]
CHANNELS = ["Web", "Mobile app", "Marketplace", "Retail partner"]


def pick(seed: int, options: list[str]) -> pl.Expr:
    index = (pl.col("i").hash(seed) % len(options)).cast(pl.UInt32)
    return pl.lit(pl.Series(options)).gather(index)


def unit(seed: int) -> pl.Expr:
    """A pseudo-random float in [0, 1)."""
    return (pl.col("i").hash(seed) % 1_000_000).cast(pl.Float64) / 1_000_000


def main() -> None:
    started = time.perf_counter()
    quantity = (pl.col("i").hash(4) % 5 + 1).cast(pl.Int64)
    price = (unit(5) * 290 + 10).round(2)
    discount = ((pl.col("i").hash(6) % 5) * 5).cast(pl.Int64)
    frame = (
        pl.DataFrame({"i": pl.int_range(0, ROWS, eager=True)})
        .with_columns(
            order_id=pl.format("ORD-{}", pl.col("i").cast(pl.String).str.zfill(7)),
            order_date=pl.date(2024, 1, 1) + pl.duration(days=pl.col("i") * 730 // ROWS),
            region=pick(1, REGIONS),
            category=pick(2, CATEGORIES),
            channel=pick(3, CHANNELS),
            customer_type=pl.when(unit(7) < 0.38).then(pl.lit("New")).otherwise(pl.lit("Returning")),
            quantity=quantity,
            unit_price=price,
            discount_pct=discount,
        )
        .with_columns(
            revenue=(pl.col("quantity") * pl.col("unit_price") * (1 - pl.col("discount_pct") / 100)).round(2),
            returned=unit(8) < 0.04,
            shipping_days=(pl.col("i").hash(9) % 9 + 1).cast(pl.Int64),
        )
        .drop("i")
    )
    OUT.parent.mkdir(parents=True, exist_ok=True)
    frame.write_csv(OUT)
    size = OUT.stat().st_size
    elapsed = time.perf_counter() - started
    print(f"{OUT}: {frame.height:,} rows x {frame.width} columns, {size / 1e6:.1f} MB in {elapsed:.1f}s")


if __name__ == "__main__":
    main()
