import { readFile } from 'node:fs/promises'
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib'

export async function pdfLinks(file: string): Promise<string[][]> {
  const doc = await PDFDocument.load(await readFile(file), { updateMetadata: false })
  return doc.getPages().map((page) => {
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray)
    const uris: string[] = []
    for (let i = 0; i < (annots?.size() ?? 0); i++) {
      const annot = annots!.lookupMaybe(i, PDFDict)
      if (annot?.get(PDFName.of('Subtype')) !== PDFName.of('Link')) continue
      const action = annot.lookupMaybe(PDFName.of('A'), PDFDict)
      const uri = action?.lookupMaybe(PDFName.of('URI'), PDFString, PDFHexString)
      if (uri) uris.push(uri.decodeText())
    }
    return uris
  })
}
