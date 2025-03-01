# Parses PDFs downloaded from Coop app (Scan & Pay section) into a big JSON

import os, json, pypdf
import sys, datetime

def datetimeFromPDF(pdfPath) -> datetime:
    if not os.path.isfile(pdfPath):
        print("File not found", pdfPath)
        return None
    reader = pypdf.PdfReader(pdfPath)
    kvittoLines = reader.pages[0].extract_text().splitlines()
    for line in kvittoLines:
        if "Datum:" in line:

            date = line.split(" Tid:")[0].replace("Datum:","").strip()
            time = line.split(" Tid:")[1].strip()
            assert(date != None)
            assert(time != None)

            # date = 2023-12-07
            # time = 13:30:10
            # parse to DT object
            dt = datetime.datetime.strptime(f"{date} {time}", "%Y-%m-%d %H:%M:%S")
            return dt
    raise Exception("No datetime found in PDF")

def butikFromPDF(pdfPath) -> str:
    if not os.path.isfile(pdfPath):
        print("File not found", pdfPath)
        return None
    reader = pypdf.PdfReader(pdfPath)
    kvittoLines = reader.pages[0].extract_text().splitlines()
    butik = kvittoLines[1].strip()
    assert(butik != "")
    assert(butik != None)
    return butik

def kvittoNrFromPDF(pdfPath) -> str:
    if not os.path.isfile(pdfPath):
        print("File not found", pdfPath)
        return None
    reader = pypdf.PdfReader(pdfPath)
    kvittoLines = reader.pages[0].extract_text().splitlines()
    for line in kvittoLines:
        if "Nr:" in line:
            nr = line.split(" Ka:")[0].replace("Nr:","").strip()
            return nr
    raise Exception("No kvittoNr found in PDF")

def totalFromPDF(pdfPath) -> str:
    if not os.path.isfile(pdfPath):
        print("File not found", pdfPath)
        return None
    reader = pypdf.PdfReader(pdfPath)
    kvittoLines = reader.pages[0].extract_text().splitlines()

    for line in kvittoLines:
        if "Total" in line:
            total = line.split("Total")[1].strip().replace("SEK", "").replace(",",".")
            total = float(total)
            
            return total
    raise Exception("Could not get total from PDF")

# fix filenames first
for folder, subs, files in os.walk("."):
    for filename in files:
        if filename.endswith(".pdf"):
            fullpath = os.path.join(folder, filename)
            dt = datetimeFromPDF(fullpath)
            butik = butikFromPDF(fullpath)
            nr = kvittoNrFromPDF(fullpath)

            newname = f"{dt.strftime('%Y-%m-%d_%H-%M-%S')}_{butik}_{nr}.pdf"
            if newname != filename:
                print("Renaming:", fullpath, "-->", newname)
                os.rename(fullpath, os.path.join(folder, newname))


visits = []
unhandled = []
for folder, subs, files in os.walk("."):
    subs.sort()
    for filename in sorted(files):
        if filename.endswith(".pdf"):
            fullpath = os.path.join(folder, filename)
            
            reader = pypdf.PdfReader(fullpath)
            kvittoLines = reader.pages[0].extract_text().splitlines()


            dt = datetimeFromPDF(fullpath)
            butik = butikFromPDF(fullpath)
            nr = kvittoNrFromPDF(fullpath)
            total = totalFromPDF(fullpath)
            print(butik, dt, total)

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
                "datetime": dt,
                "store": butik,
                "nr": nr,
                "total": total,
                "varor": [],
                "sourcePdf": fullpath
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
                visit["varor"].append({"name": name, "amount": amount, "unit": unit, "totalPrice": totalPrice, "unitPrice": unitPrice})
            visits.append(visit)


print("Unhandled:", unhandled)

outfn = str(datetime.datetime.now()).replace(" ", "_").replace(":","-") + ".json"
with open(outfn, 'w') as f:
    json.dump(visits, f, indent=4, default=str, sort_keys=True, ensure_ascii=False)
print("Wrote", outfn)

