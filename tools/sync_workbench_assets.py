"""Synchronize vendored assets for the independent, offline-capable workbenches."""
import argparse
from pathlib import Path

portal = Path(__file__).resolve().parents[1]
workspace = portal.parent
parser = argparse.ArgumentParser()
parser.add_argument("--check", action="store_true")
args = parser.parse_args()

spectra = ["GrainPeak/web", "Peakfit-CntRaman/web", "UV/web"]
themes = spectra + ["OptCNT/web", "cnt-bet-workbench", "sim-db/public",
                    "tem-cnt-workbench/static/js", "sem-cnt/frontend/static/js", "cnt-xrd/src"]
pairs = [(portal / "theme.js", workspace / root / "theme.js") for root in themes]
pairs.extend((portal / "usage-client.js", workspace / root / "usage-client.js")
             for root in [*themes, "cnt-production-analysis/web_app/frontend/public"])
pairs.extend((portal / "shared/spectrum-theme.css", workspace / root / "spectrum-theme.css") for root in spectra)
pairs.extend((p, workspace / "sem-cnt/frontend/static/css" / p.name)
             for p in (workspace / "tem-cnt-workbench/static/css").glob("*.css"))
for source, destination in pairs:
    content = source.read_text(encoding="utf-8")
    if destination.exists() and destination.read_text(encoding="utf-8") == content:
        continue
    if args.check:
        raise SystemExit(f"Outdated shared asset: {destination}")
    destination.write_bytes(content.encode("utf-8"))
