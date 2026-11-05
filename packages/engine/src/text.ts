/** "a Campus", "an Encampment": the indefinite article a name takes in a sentence. */
export function withArticle(name: string): string {
  return `${/^(?!uni|use|eu|one)[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;
}
