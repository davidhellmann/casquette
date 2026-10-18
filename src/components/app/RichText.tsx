/**
 * An i18n string with simple markup (<b>, <br>, <a>) – the strings come from src/i18n and interpolate
 * only numbers or escaped text, so they are rendered as HTML.
 */
export function RichText({ html, as: Tag = 'span', className }: { html: string; as?: 'span' | 'p' | 'div'; className?: string }) {
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
