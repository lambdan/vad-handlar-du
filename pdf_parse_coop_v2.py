# Parses a single Coop receipt PDF, and outputs it as JSON to stdout

# requirements:
# pip3 install pypdf==5.3.0 pytz==2025.1
import re

import os, json, pypdf
import sys, datetime
import pytz

if not len(sys.argv) == 2:
    print(f"Usage: pdf_parse.py <path to pdf>")
    sys.exit(1)

fullpath = os.path.abspath(sys.argv[1])

if not os.path.isfile(fullpath):
    print("File not found:", fullpath)
    sys.exit(1)

reader = pypdf.PdfReader(fullpath)
kvittoLines = reader.pages[0].extract_text().splitlines()

##print(kvittoLines)


def datetimeFromPDF() -> datetime:
    for line in kvittoLines:
        if "Datum" in line:
            # Example line: " Datum2025-06-0412:48"
            line = line.replace("Datum", "").strip()
            date = line[0:10]  # YYYY-MM-DD
            time = line[10:15]  # HH:MM
            assert date != None
            assert time != None

            dt_str = f"{date} {time}"
            dt = datetime.datetime.strptime(dt_str, "%Y-%m-%d %H:%M")

            # Make datetime aware that its swedish
            sweden_tz = pytz.timezone("Europe/Stockholm")
            dt = sweden_tz.localize(dt)

            return dt
    raise Exception("No datetime found in PDF")


def butikFromPDF() -> str:
    butik = kvittoLines[0].strip()
    assert butik != ""
    assert butik != None
    return butik


def kvittoNrFromPDF() -> str:
    # Kvitto242000-012-24284
    for line in kvittoLines:
        if "Kvitto" in line:
            return line.replace("Kvitto", "").strip()
    raise Exception("No kvittoNr found in PDF")


def totalFromPDF() -> str:
    for line in kvittoLines:
        if "Total" in line:
            total = line.split("Total")[1].strip().replace("SEK", "").replace(",", ".")
            total = float(total)

            return total
    raise Exception("Could not get total from PDF")


PRICE_RE = re.compile(r"(-?\d+[.,]\d{2})")

OFFER_KEYWORDS = (
    "FÖR",
    "RABATT",
    "ERBJUD",
    "PRIS",
    "BONUS",
    "KVITTOT",
    "MÅNADSBONUS",
    "rabatt",
    "ord. priser",
)


def parse_coop_items(lines):
    def normalize(line):
        line = line.strip()
        line = re.sub(r"\s+", " ", line)
        return line.replace(",", ".")

    def prices(line):
        return [float(p) for p in PRICE_RE.findall(line)]

    def is_quantity(line):
        return line.startswith("x ") and ("KG" in line or "STK" in line)

    def is_offer(line):
        ps = prices(line)
        return ps and all(p <= 0 for p in ps) and any(k in line for k in OFFER_KEYWORDS)

    def is_item(line):
        ps = prices(line)
        return (
            len(ps) == 1 and ps[0] > 0 and not is_quantity(line) and not is_offer(line)
        )

    items = []
    current = None

    for raw in lines:
        line = normalize(raw)
        if not line:
            continue

        if is_item(line):
            current = {
                "name": PRICE_RE.sub("", line).strip(),
                "base_price": prices(line)[0],
                "quantity": 1,
                "unit": None,
                "unit_price": None,
                "discount": 0.0,
            }
            items.append(current)
            continue

        if not current:
            continue

        if is_quantity(line):
            m = re.search(r"x ([\d.]+)(KG|STK)", line)
            if m:
                current["quantity"] = float(m.group(1))
                current["unit"] = m.group(2)
            ups = prices(line)
            if ups:
                current["unit_price"] = ups[-1]
            continue

        if is_offer(line):
            current["discount"] += sum(p for p in prices(line) if p < 0)
            continue

        # fallback: descriptive continuation
        current["name"] += " " + PRICE_RE.sub("", line).strip()

    # compute final price
    for it in items:
        it["final_price"] = round(it["base_price"] + it["discount"], 2)

    return items


unhandled = []


dt = datetimeFromPDF()
butik = butikFromPDF()
nr = kvittoNrFromPDF()
total = totalFromPDF()

# varor is between the dateline and total
dateline = None
totalline = None
orgnrline = None

for line in kvittoLines:
    if "Datum" in line and dateline == None:
        dateline = kvittoLines.index(line)

    if "Total" in line and totalline == None:
        totalline = kvittoLines.index(line)
    if "Org.Nr" in line and orgnrline == None:
        orgnrline = kvittoLines.index(line)

assert dateline != None
assert totalline != None


def isFloat(s: str) -> bool:
    try:
        s = s.replace(",", ".")
        float(s)
        return True
    except:
        return False


varor_lines = []
skip = False
c = parse_coop_items(kvittoLines[orgnrline + 1 : totalline])


visit = {
    "id": nr,
    "datetime": dt,
    "store": butik,
    "products": [],
    "total": total,
}

for prod in c:
    product = {
        "name": prod["name"],
        "amount": prod["quantity"],
        "unit": prod["unit"] or "STK",
        "totalPrice": prod["final_price"],
        "unitPrice": prod["unit_price"] or prod["final_price"] / prod["quantity"],
        "sku": prod["name"],
    }
    visit["products"].append(product)


print(json.dumps(visit, default=str, ensure_ascii=False))
sys.exit(0)
