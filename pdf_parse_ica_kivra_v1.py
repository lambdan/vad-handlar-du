# Parses a single ICA Kivra receipt PDF, and outputs it as JSON to stdout

# requirements:
# pip3 install pypdf==5.3.0 pytz==2025.1

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
kvittoLines = []
for page in reader.pages:
    kvittoLines += page.extract_text().splitlines()
#print(kvittoLines)

def datetimeFromPDF() -> datetime:
    date = None
    time = None
    for line in kvittoLines:
        if "Datum:" in line:
            date = line.split("Datum:")[1].strip()
        elif "Tid:" in line:
            time = line.split("Tid:")[1].strip()
        if date and time:
            break
    
    if date == None or time == None:
        raise Exception("No datetime found in PDF")

    dt_str = f"{date} {time}"
    dt = datetime.datetime.strptime(dt_str, "%Y-%m-%d %H:%M")

    # Make datetime aware that its swedish
    sweden_tz = pytz.timezone("Europe/Stockholm")
    dt = sweden_tz.localize(dt)

    return dt

def butikFromPDF() -> str:
    butik = kvittoLines[1].strip()
    assert(butik != "")
    assert(butik != None)
    return butik

def kvittoNrFromPDF() -> str:
    dt = datetimeFromPDF()
    date = dt.strftime("%Y%m%d")
    #print(kvittoLines)
    orgnr = None
    for line in kvittoLines:
        if "Org. nr:" in line:
            orgnr = line.split("Org. nr:")[1].split()[0].strip()
        if "Kvittonr:" in line:
            assert(orgnr != None)
            # hopefully you dont make two purchases within 1 minute at the same store...
            return orgnr + "-" + date + "-" + line.split("Kvittonr:")[1].split("Tid")[0].strip()
    raise Exception("No kvittoNr found in PDF")

def totalFromPDF() -> str:
    for line in kvittoLines:
        if "Total: " in line:
            total = line.split("Total: ")[1].strip()            
            return float(total)
    raise Exception("Could not get total from PDF")


unhandled = []


dt = datetimeFromPDF()
butik = butikFromPDF()
nr = kvittoNrFromPDF()
total = totalFromPDF()

# varor is between the 'Beskrivning Art. nr. Pris Mängd Summa(SEK)', line and Total line
beskline = None
totalline = None

for line in kvittoLines:
    if "Beskrivning Art. nr. Pris Mängd Summa(SEK)" in line:
        beskline = kvittoLines.index(line)
    
    if "Total:" in line and str(int(total)) in line:
        totalline = kvittoLines.index(line)
    
assert(beskline != None)
assert(totalline != None)       

varor_lines = []
skip = False
for i in range(beskline+1, totalline):
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
    try:
        total = float(vl.split()[-1]) # last bit is total always
        unit = vl.split()[-2]
        amount = float(vl.split()[-3])
        unitPrice = float(total / amount)

        artNr = vl.split()[-5]
        if not artNr.isdigit():
            artNr = vl.split()[-4]

        name = vl.split(artNr)[0].strip()
        if name.startswith("*"):
            name = name[1:]
    except:
        # its a discount item... too many edge cases... ignore for now :(
        #print(vl)
        #totalDiscount = float(vl.split()[-1])
        # apply it to the previous product
        #visit["products"][-1]["totalPrice"] -= totalDiscount
        # update unit price
        #visit["products"][-1]["unitPrice"] = visit["products"][-1]["totalPrice"] / float(visit["products"][-1]["amount"])
        continue

    # match Coop format
    if unit == "st":
        unit = "STK"
    if unit == "kg":
        unit = "KG"

    visit["products"].append({"name": name, "amount": amount, "unit": unit, "totalPrice": total, "unitPrice": unitPrice, "sku": artNr})
print(json.dumps(visit, default=str, ensure_ascii=False))
sys.exit(0)



# '*Co-Co dubbel 7310511251406 9.00 3 st 27.00', 'Chokladbitar 3F20 - 7.00', 'Salladsbar/Matbar 9000 160.00 0.81 kg 129.60', '*Vaniljmunk 8801 12.00 4 st 48.00', '29. Munkar 4f40 - 8.00', 'Total: 189.60'