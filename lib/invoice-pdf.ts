type InvoiceLineItem = {
  position: number
  description: string
  quantity: number
  unitPrice: number
  total: number
}

type InvoicePdfInput = {
  invoiceNumber: number | string
  invoiceDate: string
  servicePeriod: string
  customerName: string
  customerAddress?: string | null
  customerEmail?: string | null
  total: number
  lineItems: InvoiceLineItem[]
  company: {
    company_name?: string | null
    owner_name?: string | null
    address?: string | null
    postal_code?: string | null
    city?: string | null
    email?: string | null
    bank_name?: string | null
    iban?: string | null
    bic?: string | null
    tax_number?: string | null
    payment_days?: number | null
    small_business?: boolean | null
  }
}

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89

const cp1252Extra: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x2030: 0x89,
  0x2039: 0x8b,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x2122: 0x99,
  0x203a: 0x9b,
}

function encodeWinAnsi(value: string): Buffer {
  const bytes: number[] = []

  for (const char of value) {
    const code = char.codePointAt(0) ?? 63
    const byte = code <= 255 ? code : cp1252Extra[code] ?? 63

    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) {
      bytes.push(0x5c)
    }

    bytes.push(byte)
  }

  return Buffer.from(bytes)
}

function pdfText(value: string): Buffer {
  return Buffer.concat([Buffer.from('('), encodeWinAnsi(value), Buffer.from(')')])
}

function deDate(value: string) {
  const date = new Date(`${value}T12:00:00`)

  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Berlin',
  }).format(date)
}

function euro(value: number) {
  return `${Number(value).toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`
}

function quantity(value: number) {
  return Number(value).toLocaleString('de-DE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })
}

function splitAddress(address?: string | null) {
  if (!address) return []

  const comma = address.indexOf(',')

  if (comma < 0) {
    return [address.trim()].filter(Boolean)
  }

  return [
    address.slice(0, comma).trim(),
    address.slice(comma + 1).trim(),
  ].filter(Boolean)
}

function wrapText(value: string, maxChars: number) {
  const words = value.trim().split(/\s+/)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word

    if (candidate.length <= maxChars) {
      current = candidate
      continue
    }

    if (current) lines.push(current)
    current = word
  }

  if (current) lines.push(current)

  return lines
}

class ContentBuilder {
  parts: Buffer[] = []

  raw(value: string) {
    this.parts.push(Buffer.from(value, 'ascii'))
  }

  text(value: string, x: number, y: number, size = 10, bold = false) {
    this.raw(
      `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td `
    )
    this.parts.push(pdfText(value))
    this.raw(' Tj ET\n')
  }

  line(x1: number, y1: number, x2: number, y2: number, width = 0.7) {
    this.raw(
      `${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(
        2
      )} ${y2.toFixed(2)} l S\n`
    )
  }

  fillRect(
    x: number,
    y: number,
    width: number,
    height: number,
    rgb: [number, number, number]
  ) {
    this.raw(
      `${rgb[0]} ${rgb[1]} ${rgb[2]} rg ${x.toFixed(2)} ${y.toFixed(
        2
      )} ${width.toFixed(2)} ${height.toFixed(2)} re f\n0 0 0 rg\n`
    )
  }

  buffer() {
    return Buffer.concat(this.parts)
  }
}

function createPdf(objects: Buffer[]) {
  const header = Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'binary')
  const chunks: Buffer[] = [header]
  const offsets = [0]
  let position = header.length

  objects.forEach((body, index) => {
    offsets[index + 1] = position

    const prefix = Buffer.from(`${index + 1} 0 obj\n`)
    const suffix = Buffer.from('\nendobj\n')

    chunks.push(prefix, body, suffix)
    position += prefix.length + body.length + suffix.length
  })

  const xrefPosition = position
  const xrefLines = [`xref\n0 ${objects.length + 1}\n`, '0000000000 65535 f \n']

  for (let index = 1; index <= objects.length; index += 1) {
    xrefLines.push(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`)
  }

  chunks.push(
    Buffer.from(
      `${xrefLines.join(
        ''
      )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPosition}\n%%EOF\n`
    )
  )

  return Buffer.concat(chunks)
}

export function generateInvoicePdf(input: InvoicePdfInput): Buffer {
  const content = new ContentBuilder()

  const blue: [number, number, number] = [0.68, 0.81, 0.92]
  const lightLine: [number, number, number] = [0.73, 0.82, 0.9]

  const left = 54
  const right = 541
  const width = right - left

  /*
   * Kopfbereich – bewusst wie die Web-/Numbers-Vorlage:
   * Kunde links, Rechnungsdaten rechts.
   */
  const headerBottom = 676
  const headerHeight = 108

  content.fillRect(left, headerBottom, width, headerHeight, blue)

  const customerX = left + 12
  let customerY = headerBottom + 83

  content.text(input.customerName, customerX, customerY, 9.2, true)

  for (const line of splitAddress(input.customerAddress)) {
    customerY -= 14
    content.text(line, customerX, customerY, 8.8)
  }

  const metaLabelX = 279
  const metaValueX = 401
  const metaStartY = headerBottom + 85
  const metaGap = 15

  content.text('Rechnungs-Nr.:', metaLabelX, metaStartY, 8.5, true)
  content.text(String(input.invoiceNumber), metaValueX, metaStartY, 8.5, true)

  content.text('Rechnungsdatum:', metaLabelX, metaStartY - metaGap, 8.5)
  content.text(deDate(input.invoiceDate), metaValueX, metaStartY - metaGap, 8.5)

  content.text('Leistungszeitraum:', metaLabelX, metaStartY - metaGap * 2, 8.5)
  content.text(input.servicePeriod, metaValueX, metaStartY - metaGap * 2, 8.5)

  content.text('Kunde:', metaLabelX, metaStartY - metaGap * 3, 8.5)
  content.text(input.customerName, metaValueX, metaStartY - metaGap * 3, 8.5)

  content.text('Kunde E-Mail:', metaLabelX, metaStartY - metaGap * 4, 8.5)
  content.text(input.customerEmail || '—', metaValueX, metaStartY - metaGap * 4, 8.5)

  /*
   * Rechnungsnummer-Leiste.
   */
  const invoiceBarY = 654
  content.fillRect(left, invoiceBarY, 151, 22, blue)
  content.text('Rechnungs-Nr.:', left + 2, invoiceBarY + 7, 8.6, true)
  content.text(String(input.invoiceNumber), left + 89, invoiceBarY + 7, 8.6, true)
  content.text(deDate(input.invoiceDate), right - 61, invoiceBarY + 7, 8.6)

  content.line(left, invoiceBarY - 1, right, invoiceBarY - 1, 0.35)

  /*
   * Anschreiben.
   */
  let y = 614
  content.text('Sehr geehrte/r Kunde,', left + 2, y, 8.7)
  y -= 16
  content.text(
    'vielen Dank für Ihren Auftrag und das damit verbundene Vertrauen!',
    left + 2,
    y,
    8.7
  )
  y -= 13
  content.text(
    'Hiermit stelle ich Ihnen folgende Leistungen in Rechnung:',
    left + 2,
    y,
    8.7
  )

  y -= 38
  content.text('Berechnung für den Zeitraum vom:', left + 2, y, 8.8, true)
  content.text(input.servicePeriod, 304, y, 8.8, true)

  /*
   * Leistungstabelle.
   */
  const tableTop = y - 23
  const headerRowHeight = 20
  const rowHeight = 18
  const columns = [left, left + 28, left + 270, left + 340, left + 414, right]

  content.fillRect(left, tableTop - headerRowHeight, width, headerRowHeight, blue)

  const headings = ['Pos.', 'Beschreibung', 'Menge', 'Einzelpreis', 'Gesamtpreis']

  headings.forEach((heading, index) => {
    content.text(
      heading,
      columns[index] + (index === 0 ? 4 : 5),
      tableTop - 14,
      8,
      true
    )
  })

  const items = input.lineItems.slice(0, 5)
  let rowTop = tableTop - headerRowHeight

  for (let index = 0; index < 5; index += 1) {
    const rowBottom = rowTop - rowHeight
    const item = items[index]

    content.line(left, rowBottom, right, rowBottom, 0.32)

    for (const x of columns) {
      content.line(x, rowBottom, x, rowTop, 0.32)
    }

    if (item) {
      content.text(`${item.position}.`, columns[0] + 8, rowBottom + 6, 7.9)

      const descriptionLines = wrapText(item.description, 56).slice(0, 2)

      descriptionLines.forEach((line, lineIndex) => {
        content.text(
          line,
          columns[1] + 5,
          rowBottom + 10 - lineIndex * 8,
          7.8
        )
      })

      content.text(
        quantity(item.quantity),
        columns[2] + 37,
        rowBottom + 6,
        7.9
      )
      content.text(
        euro(item.unitPrice),
        columns[3] + 26,
        rowBottom + 6,
        7.9
      )
      content.text(
        euro(item.total),
        columns[4] + 26,
        rowBottom + 6,
        7.9
      )
    } else {
      content.text('…', columns[0] + 9, rowBottom + 6, 7.9)
      content.text('…', columns[1] + 5, rowBottom + 6, 7.9)
      content.text('–', columns[2] + 40, rowBottom + 6, 7.9)
      content.text('–', columns[4] + 35, rowBottom + 6, 7.9)
    }

    rowTop = rowBottom
  }

  content.line(left, tableTop, right, tableTop, 0.4)

  /*
   * Summenbereich – volle Breite wie in der alten Rechnung.
   */
  const totalsHeight = 35
  const totalsBottom = rowTop - totalsHeight

  content.fillRect(left, totalsBottom, width, totalsHeight, blue)

  content.text('Gesamtbetrag netto:', left + 24, totalsBottom + 23, 8.4, true)
  content.text(euro(input.total), right - 48, totalsBottom + 23, 8.4, true)

  content.text('Gesamtbetrag brutto:', left + 24, totalsBottom + 8, 8.4, true)
  content.text(euro(input.total), right - 48, totalsBottom + 8, 8.4, true)

  /*
   * Zahlung und Rechtstexte.
   */
  const companyName =
    input.company.company_name ||
    input.company.owner_name ||
    'Rechnungsaussteller'

  const paymentDays = input.company.payment_days || 7
  let textY = totalsBottom - 28

  const paymentIntro =
    `Ich bitte um Überweisung des Rechnungsbetrages innerhalb von ${paymentDays} Tagen ` +
    'nach Rechnungsdatum an IBAN:'

  for (const line of wrapText(paymentIntro, 105)) {
    content.text(line, left + 2, textY, 8)
    textY -= 11
  }

  const bankLine =
    `${input.company.iban || ''}` +
    `${input.company.bank_name ? ` (${input.company.bank_name})` : ''}`

  content.text(bankLine, left + 2, textY, 8, true)
  textY -= 28

  if (input.company.small_business) {
    const smallBusinessText =
      'Der Rechnungsaussteller ist Kleinunternehmer im Sinne des § 19 UStG ' +
      'und weist daher keine Umsatzsteuer aus.'

    for (const line of wrapText(smallBusinessText, 108)) {
      content.text(line, left + 2, textY, 7.8)
      textY -= 10.5
    }

    textY -= 14
  }

  const legalText =
    'Gesetzlich vorgeschriebener Hinweis: Sie kommen automatisch ohne weitere Mahnung ' +
    'in Verzug, wenn Sie nicht innerhalb von 30 Tagen nach Fälligkeit und Zugang dieser ' +
    'Rechnung bezahlen (§ 286 Abs. 3 BGB).'

  for (const line of wrapText(legalText, 110)) {
    content.text(line, left + 2, textY, 7.6, true)
    textY -= 10
  }

  textY -= 18
  content.text('Vielen Dank für Ihren Auftrag,', left + 2, textY, 8)
  content.text(
    input.company.owner_name || companyName,
    left + 2,
    textY - 13,
    8.2,
    true
  )

  /*
   * Footer unten – Daten der Mutter, nicht des Kunden.
   */
  const footerBottom = 34
  const footerHeight = 58

  content.fillRect(left, footerBottom, width, footerHeight, blue)

  const footerLeftX = left + 8
  const footerCenterX = 234
  const footerRightX = 405

  content.text(companyName, footerLeftX, footerBottom + 41, 7.4, true)
  content.text(input.company.address || '', footerLeftX, footerBottom + 29, 7)
  content.text(
    `${input.company.postal_code || ''} ${input.company.city || ''}`.trim(),
    footerLeftX,
    footerBottom + 18,
    7
  )
  content.text(input.company.email || '', footerLeftX, footerBottom + 7, 7)

  content.text(input.company.bank_name || '', footerCenterX, footerBottom + 41, 7.4, true)
  content.text(`IBAN ${input.company.iban || ''}`, footerCenterX, footerBottom + 29, 7)
  content.text(`BIC ${input.company.bic || ''}`, footerCenterX, footerBottom + 18, 7)

  content.text(
    `Steuernummer: ${input.company.tax_number || ''}`,
    footerRightX,
    footerBottom + 41,
    7.4,
    true
  )
  content.text(
    input.company.owner_name || companyName,
    footerRightX,
    footerBottom + 29,
    7
  )

  const stream = content.buffer()

  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        '/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>'
    ),
    Buffer.concat([
      Buffer.from(`<< /Length ${stream.length} >>\nstream\n`),
      stream,
      Buffer.from('\nendstream'),
    ]),
    Buffer.from(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
    ),
    Buffer.from(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
    ),
  ]

  return createPdf(objects)
}