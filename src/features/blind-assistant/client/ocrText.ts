/**
 * Turns raw OCR output into paragraphs a screen-reader user can swipe through one at a time.
 * Markdown markers are removed because VoiceOver would read them aloud as symbols.
 */
export function formatOcrText(raw: string | null | undefined): string[] {
    if (!raw) return [];

    const cleaned = raw
        .replace(/\r\n?/g, '\n')
        .replace(/```[a-z]*\n?/gi, '')
        .replace(/(\*\*|__)(.+?)\1/g, '$2')
        .split('\n')
        .filter((line) => !/^(?=.*[-=_*|:])[-=_*|:\s]{3,}$/.test(line))
        .map((line) => line
            .replace(/^\s{0,3}#{1,6}\s+/, '')
            .replace(/^\s*[*\u2022]\s+/, '')
            .replace(/\s*\|\s*/g, ' ')
            .replace(/[ \t]+$/g, ''))
        .join('\n');

    return cleaned
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.replace(/^\n+|\n+$/g, ''))
        .filter((paragraph) => paragraph.trim().length > 0);
}
