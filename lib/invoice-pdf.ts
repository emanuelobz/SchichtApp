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
    let byte = code <= 255 ? code : cp1252Extra[code] ?? 63

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
  if (comma < 0) return [address]
  return [address.slice(0, comma).trim(), address.slice(comma + 1).trim()].filter(Boolean)
}

function wrapText(value: string, maxChars: number) {
  const words = value.trim().split(/\s+/)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maxChars) {
      current = candidate
    } else {
      if (current) lines.push(current)
      current = word
    }
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
    this.raw(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td `)
    this.parts.push(pdfText(value))
    this.raw(' Tj ET\n')
  }

  line(x1: number, y1: number, x2: number, y2: number, width = 0.7) {
    this.raw(`${width} w ${x1} ${y1} m ${x2} ${y2} l S\n`)
  }

  fillRect(x: number, y: number, width: number, height: number, rgb: [number, number, number]) {
    this.raw(`${rgb[0]} ${rgb[1]} ${rgb[2]} rg ${x} ${y} ${width} ${height} re f\n0 0 0 rg\n`)
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

  const trailer = Buffer.from(
    `${xrefLines.join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPosition}\n%%EOF\n`
  )
  chunks.push(trailer)

  return Buffer.concat(chunks)
}

export function generateInvoicePdf(input: InvoicePdfInput): Buffer {
  const content = new ContentBuilder()
  const blue: [number, number, number] = [0.72, 0.84, 0.95]
  const darkBlue: [number, number, number] = [0.11, 0.25, 0.4]
  const left = 46
  const right = 549

  content.fillRect(left, 757, right - left, 54, blue)
  content.text('RECHNUNG', 382, 786, 18, true)
  content.text(`Nr. ${input.invoiceNumber}`, 383, 769, 10, true)

  let y = 790
  content.text(input.customerName, left + 12, y, 11, true)
  for (const line of splitAddress(input.customerAddress)) {
    y -= 14
    content.text(line, left + 12, y, 10)
  }

  const metaX = 360
  content.text('Rechnungsdatum:', metaX, 744, 9)
  content.text(deDate(input.invoiceDate), 464, 744, 9, true)
  content.text('Leistungszeitraum:', metaX, 730, 9)
  content.text(input.servicePeriod, 464, 730, 9, true)

  content.fillRect(left, 688, right - left, 27, blue)
  content.text('Rechnungs-Nr.:', left + 12, 697, 10, true)
  content.text(String(input.invoiceNumber), left + 113, 697, 10, true)
  content.text(deDate(input.invoiceDate), 465, 697, 10, true)

  content.text('Sehr geehrte/r Kunde,', left, 657, 10)
  content.text('vielen Dank für Ihren Auftrag und das damit verbundene Vertrauen!', left, 638, 10)
  content.text('Hiermit stelle ich Ihnen folgende Leistungen in Rechnung:', left, 624, 10)

  content.text('Berechnung für den Zeitraum vom:', left, 595, 10, true)
  content.text(input.servicePeriod, 383, 595, 10, true)

  const tableTop = 572
  const rowHeight = 27
  const col = [left, 78, 326, 387, 467, right]
  content.fillRect(left, tableTop - rowHeight, right - left, rowHeight, blue)
  ;['Pos.', 'Beschreibung', 'Menge', 'Einzelpreis', 'Gesamtpreis'].forEach((label, index) => {
    content.text(label, col[index] + 5, tableTop - 18, 9, true)
  })

  let rowY = tableTop - rowHeight
  const items = input.lineItems.slice(0, 5)
  for (let index = 0; index < 5; index += 1) {
    rowY -= rowHeight
    const item = items[index]
    content.line(left, rowY, right, rowY, 0.45)
    for (const x of col) content.line(x, rowY, x, rowY + rowHeight, 0.45)

    if (item) {
      content.text(`${item.position}.`, col[0] + 8, rowY + 9, 9)
      const descriptionLines = wrapText(item.description, 44).slice(0, 2)
      descriptionLines.forEach((line, lineIndex) => {
        content.text(line, col[1] + 6, rowY + 14 - lineIndex * 10, 8.5)
      })
      content.text(quantity(item.quantity), col[2] + 20, rowY + 9, 9)
      content.text(euro(item.unitPrice), col[3] + 9, rowY + 9, 9)
      content.text(euro(item.total), col[4] + 8, rowY + 9, 9)
    } else {
      content.text('…', col[0] + 9, rowY + 9, 9)
      content.text('…', col[1] + 7, rowY + 9, 9)
      content.text('–', col[2] + 23, rowY + 9, 9)
      content.text('–', col[4] + 18, rowY + 9, 9)
    }
  }

  content.line(left, tableTop, right, tableTop, 0.6)
  for (const x of col) content.line(x, tableTop - rowHeight * 6, x, tableTop, 0.45)

  let totalY = tableTop - rowHeight * 6 - 25
  content.text('Gesamtbetrag netto:', 367, totalY, 10, true)
  content.text(euro(input.total), 486, totalY, 10, true)
  totalY -= 17
  content.fillRect(355, totalY - 7, 194, 25, blue)
  content.text('Gesamtbetrag brutto:', 367, totalY, 10, true)
  content.text(euro(input.total), 486, totalY, 10, true)

  const companyName = input.company.company_name || input.company.owner_name || 'Rechnungsaussteller'
  const paymentDays = input.company.payment_days || 7
  let textY = totalY - 40

  const paymentLine = `Ich bitte um Überweisung des Rechnungsbetrages innerhalb von ${paymentDays} Tagen nach Rechnungsdatum an IBAN:`
  for (const line of wrapText(paymentLine, 92)) {
    content.text(line, left, textY, 9)
    textY -= 13
  }
  content.text(`${input.company.iban || ''}${input.company.bank_name ? ` (${input.company.bank_name})` : ''}`, left, textY, 9, true)
  textY -= 24

  if (input.company.small_business) {
    for (const line of wrapText('Der Rechnungsaussteller ist Kleinunternehmer im Sinne des § 19 UStG und weist daher keine Umsatzsteuer aus.', 100)) {
      content.text(line, left, textY, 8.7)
      textY -= 12
    }
    textY -= 9
  }

  for (const line of wrapText('Gesetzlich vorgeschriebener Hinweis: Sie kommen automatisch ohne weitere Mahnung in Verzug, wenn Sie nicht innerhalb von 30 Tagen nach Fälligkeit und Zugang dieser Rechnung bezahlen (§ 286 Abs. 3 BGB).', 104)) {
    content.text(line, left, textY, 8.4)
    textY -= 11.5
  }

  textY -= 15
  content.text('Vielen Dank für Ihren Auftrag,', left, textY, 9)
  content.text(input.company.owner_name || companyName, left, textY - 14, 9, true)

  const footerY = 38
  content.fillRect(left, footerY, right - left, 64, blue)
  content.raw(`${darkBlue[0]} ${darkBlue[1]} ${darkBlue[2]} rg\n`)

  content.text(companyName, left + 10, footerY + 45, 8.5, true)
  content.text(input.company.address || '', left + 10, footerY + 31, 8)
  content.text(`${input.company.postal_code || ''} ${input.company.city || ''}`.trim(), left + 10, footerY + 19, 8)
  content.text(input.company.email || '', left + 10, footerY + 7, 8)

  content.text(input.company.bank_name || '', 240, footerY + 45, 8.5, true)
  content.text(`IBAN ${input.company.iban || ''}`, 240, footerY + 31, 8)
  content.text(`BIC ${input.company.bic || ''}`, 240, footerY + 19, 8)

  content.text(`Steuernummer: ${input.company.tax_number || ''}`, 408, footerY + 45, 8.5, true)
  content.text(input.company.owner_name || '', 408, footerY + 31, 8)
  content.raw('0 0 0 rg\n')

  const stream = content.buffer()
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`),
    Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`), stream, Buffer.from('\nendstream')]),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'),
  ]

  return createPdf(objects)
}
