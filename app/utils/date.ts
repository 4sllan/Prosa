export function formatReleaseDate(date: string | Date, language = 'pt-BR'): string {
  return new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(date))
}
