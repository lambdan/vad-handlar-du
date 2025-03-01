# How to use

1. Download all receipts as PDFs using the Coop app in the Scan & Pay section (this is the most annoying part)

2. Run `coop_pdf-to-json.py` to generate a big JSON with all the PDFs parsed (hopefully)

3. Fire up the web service using Docker: `docker compose -f docker-compose.yml up`

4. Visit http://localhost:8000 in your favorite web browser, and import the big JSON you generated

5. Feel shame.

![Screenshot](https://djsimg.org/346c0f6c0b93c08e8bdbc360bf93ee55.png)
