"""The line check's acceptance on a build (docs/phase3-fur-plan.md, E): the
defects the plan names, from the audit (qa/phase3/audit/defects.json and the
overviews), each with the regions it lies in. The build the audit saw must fail
at least one of each defect's regions; once the view lanes fix a defect, its
regions pass.

    python3 characters/sheetmatch/lineaccept.py <qa folder> [--out <json>]

Reads <qa folder>/<view>/lines.json (look.ts writes them) and prints, for each
defect, the regions that fail and their worst measure. Exits 0 when every
defect's view was checked, 2 on any error; never 1: what it reports is evidence,
the check's verdicts are linematch.py's."""
import argparse
import json
import sys
import traceback
from pathlib import Path

import linematch as lm
import match

sheets = match.sheets
# (view, the audit's number, what the founder saw, the regions it lies in). A turned defect is held in both
# facings, its regions named by each facing's own sides.
DEFECTS = (
    ("front", "#2", "the cheek over each ear: a hard, chipped, unlined wedge", ("ear.L|head.base", "ear.R|head.base")),
    ("front", "#3", "the chin over the collar: a square block, no line, no scallops", ("collar|head.base",)),
    ("front", "#10", "between the front legs: no chest V, the legs' inner edges unlined, a tan wedge", ("body.front|front.L", "body.front|front.R", "body.front")),
    ("front", "#11", "the front legs and paws: flat mittens, a heavy even line, toe ticks", ("front.L|ground", "front.R|ground")),
    ("front", "#12", "the front legs' outer edges on the haunches: a cream seam, a line from mid-air", ("body.back|front.L", "body.back|front.R")),
    ("threeQuarter.L", "D3", "the near cheek over the near ear: the ear's inner line stops at eye level", ("ear.L|head.base",)),
    ("threeQuarter.L", "D10", "the far leg and the chest between the legs: peach-tan, a hard unlined diagonal", ("body.front|front.R", "front.R", "body.front")),
    ("threeQuarter.L", "D12", "the front paws: flat, a constant dark line, toe ticks, a cuff", ("front.L|ground", "front.R|ground")),
    ("threeQuarter.R", "D3", "the near cheek over the near ear: the ear's inner line stops at eye level", ("ear.R|head.base",)),
    ("threeQuarter.R", "D10", "the far leg and the chest between the legs: peach-tan, a hard unlined diagonal", ("body.front|front.L", "front.L", "body.front")),
    ("threeQuarter.R", "D12", "the front paws: flat, a constant dark line, toe ticks, a cuff", ("front.R|ground", "front.L|ground")),
    ("side.L", "#9", "the front paws: a heavy sole stroke open at the heel, claw ticks", ("front.L|ground", "front.R|ground", "front.L|front.R")),
    ("side.L", "#11", "the near leg's back edge, the heel and the belly between the paws: an open unlined column", ("body.front|front.L", "body.front|ground", "front.L")),
    ("side.L", "#12", "the hind paw and the haunch on the ground: 10.7 pt unlined", ("body.back|ground", "hind.L|ground")),
    ("side.R", "#9", "the front paws: a heavy sole stroke open at the heel, claw ticks", ("front.R|ground", "front.L|ground", "front.L|front.R")),
    ("side.R", "#11", "the near leg's back edge, the heel and the belly between the paws: an open unlined column", ("body.front|front.R", "body.front|ground", "front.R")),
    ("side.R", "#12", "the hind paw and the haunch on the ground: 10.7 pt unlined", ("body.back|ground", "hind.R|ground")),
    ("back", "#6", "the shoulders: no outline on the left, a tan smear, the right line broken", ("body.back|outside",)),
    ("back", "#7", "the haunches on the ground: a flat, straight, dark line", ("body.back|ground", "hind.L|ground", "hind.R|ground")),
)


def failing(result, regions):
    """Each of the regions (or its lines across) that fails, with its worst measure."""
    out = []
    for name in regions:
        for n in (name, f"{name} {lm.ACROSS}"):
            row = result["regions"].get(n)
            if row and not row["pass"]:
                m = max(row["failed"], key=lambda m: lm.badness(m, row["measures"][m], row))
                out.append({"region": n, "measure": m, "value": row["measures"][m]["value"], "threshold": row["measures"][m]["threshold"]})
    return out


def accept(qa):
    rows = []
    for view, number, saw, regions in DEFECTS:
        path = Path(qa) / view / "lines.json"
        result = json.loads(path.read_text())
        found = failing(result, regions)
        rows.append({"view": view, "defect": number, "saw": saw, "regions": list(regions), "failing": found, "caught": bool(found)})
    return rows


def main(argv):
    parser = argparse.ArgumentParser(usage=__doc__)
    parser.add_argument("qa")
    parser.add_argument("--out")
    args = parser.parse_args(argv)
    try:
        rows = accept(args.qa)
        if args.out:
            sheets.write_json(Path(args.out), {"defects": rows, "caught": sum(r["caught"] for r in rows), "of": len(rows)})
    except Exception as error:
        traceback.print_exc()
        print(f"lineaccept: {type(error).__name__}: {error}", file=sys.stderr)
        return 2
    for r in rows:
        mark = "caught" if r["caught"] else "MISSED"
        detail = "; ".join(f"{f['region']} {f['measure']} {f['value']} (threshold {f['threshold']})" for f in r["failing"][:3])
        print(f"{r['view']:15s} {r['defect']:4s} {mark}: {detail}")
    print(f"lineaccept: {sum(r['caught'] for r in rows)} of {len(rows)} named defects fail")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
