import { google } from 'googleapis'
import { getAuthenticatedClient } from '@/lib/google-auth'

export interface SheetData {
  sheetName: string
  headers: string[]
  rows: (string | number | boolean)[][]
}

export async function exportToGoogleSheets(
  title: string,
  sheets: SheetData[]
): Promise<string> {
  const auth = await getAuthenticatedClient()
  const sheetsApi = google.sheets({ version: 'v4', auth })

  // Create spreadsheet with multiple sheets
  const spreadsheet = await sheetsApi.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: sheets.map((s) => ({
        properties: { title: s.sheetName },
      })),
    },
  })

  const spreadsheetId = spreadsheet.data.spreadsheetId!

  // Write data to each sheet
  for (const sheet of sheets) {
    const allRows = [sheet.headers, ...sheet.rows]
    await sheetsApi.spreadsheets.values.update({
      spreadsheetId,
      range: `'${sheet.sheetName}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: allRows },
    })
  }

  // Format headers (bold, frozen)
  const requests = sheets.map((sheet, index) => ([
    {
      repeatCell: {
        range: {
          sheetId: spreadsheet.data.sheets![index].properties!.sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
        },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true },
            backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
          },
        },
        fields: 'userEnteredFormat(textFormat,backgroundColor)',
      },
    },
    {
      updateSheetProperties: {
        properties: {
          sheetId: spreadsheet.data.sheets![index].properties!.sheetId,
          gridProperties: { frozenRowCount: 1 },
        },
        fields: 'gridProperties.frozenRowCount',
      },
    },
  ])).flat()

  await sheetsApi.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  })

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`
}
