# Parses a single Coop receipt PDF, and outputs it as JSON to stdout

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


def datetimeFromPDF(pdfPath) -> datetime:

    reader = pypdf.PdfReader(pdfPath)
    kvittoLines = reader.pages[0].extract_text().splitlines()
    for line in kvittoLines:
        if "Datum:" in line:

            date = line.split(" Tid:")[0].replace("Datum:", "").strip()
            time = line.split(" Tid:")[1].strip()
            assert(date != None)
            assert(time != None)


            dt_str = f"{date} {time}"
            dt = datetime.datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S")

            # Make datetime aware that its swedish
            sweden_tz = pytz.timezone("Europe/Stockholm")
            dt = sweden_tz.localize(dt)

            return dt
    raise Exception("No datetime found in PDF")

def butikFromPDF(pdfPath) -> str:

    reader = pypdf.PdfReader(pdfPath)
    kvittoLines = reader.pages[0].extract_text().splitlines()
    butik = kvittoLines[1].strip()
    assert(butik != "")
    assert(butik != None)
    return butik

def kvittoNrFromPDF(pdfPath) -> str:

    reader = pypdf.PdfReader(pdfPath)
    kvittoLines = reader.pages[0].extract_text().splitlines()
    for line in kvittoLines:
        if "Nr:" in line:
            nr = line.split(" Ka:")[0].replace("Nr:","").strip()
            return nr
    raise Exception("No kvittoNr found in PDF")

def totalFromPDF(pdfPath) -> str:

    reader = pypdf.PdfReader(pdfPath)
    kvittoLines = reader.pages[0].extract_text().splitlines()

    for line in kvittoLines:
        if "Total" in line:
            total = line.split("Total")[1].strip().replace("SEK", "").replace(",",".")
            total = float(total)
            
            return total
    raise Exception("Could not get total from PDF")


unhandled = []

reader = pypdf.PdfReader(fullpath)
kvittoLines = reader.pages[0].extract_text().splitlines()


dt = datetimeFromPDF(fullpath)
butik = butikFromPDF(fullpath)
nr = kvittoNrFromPDF(fullpath)
total = totalFromPDF(fullpath)

# varor is between the dateline and total
dateline = None
totalline = None

for line in kvittoLines:
    if "Datum:" in line and dateline == None:
        dateline = kvittoLines.index(line)
    
    if "Total" in line and totalline == None:
        totalline = kvittoLines.index(line)
    
assert(dateline != None)
assert(totalline != None)       

varor_lines = []
skip = False
for i in range(dateline+1, totalline):
    if skip:
        skip = False
        continue
    line = kvittoLines[i].strip()
    if line.endswith("*"):
        # also add next line to it
        line += kvittoLines[i+1]
        skip = True
    varor_lines.append(line)



visit = {
    "id": nr,
    "datetime": dt,
    "store": butik,
    "products": [],
    "total": total,
}

for vl in varor_lines:
    #print(vl)
    if not "*" in vl:
        unhandled.append(vl)
        #raise Exception("No * in varor line", vl, fullpath)
        continue
    name = []
    for part in vl.split():
        if "*" in part:
            unit = name.pop()
            break
        name.append(part)
    name = " ".join(name)
    unitPrice = float(vl.split()[-3].replace(",",".").replace("*",""))
    totalPrice = float(vl.split()[-2].replace(",","."))
    amount = 1
    if "STK" in unit:
        amount = int(unit.split("STK")[0].strip())
        unit = "STK"
    elif "KG" in unit:
        amount = float(unit.split("KG")[0].strip())
        unit = "KG"
    else:
        raise Exception("Unknown unit", unit, fullpath)
    visit["products"].append({"name": name, "amount": amount, "unit": unit, "totalPrice": totalPrice, "unitPrice": unitPrice})
print(json.dumps(visit, default=str, ensure_ascii=False))
sys.exit(0)



