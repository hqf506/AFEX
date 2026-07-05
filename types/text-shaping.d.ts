declare module 'arabic-persian-reshaper' {
  export const ArabicShaper: {
    convertArabic(value: string): string
  }
}

declare module 'bidi-js' {
  type EmbeddingLevels = {
    levels: Uint8Array
    paragraphs: Array<{
      start: number
      end: number
      level: number
    }>
  }

  type BidiProcessor = {
    getEmbeddingLevels(
      value: string,
      explicitDirection?: 'ltr' | 'rtl'
    ): EmbeddingLevels
    getReorderedString(
      value: string,
      embeddingLevels: EmbeddingLevels,
      start?: number,
      end?: number
    ): string
  }

  export default function bidiFactory(): BidiProcessor
}
