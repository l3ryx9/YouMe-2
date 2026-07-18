/**
 * Utilitaires de calcul vectoriel
 * Pour la recherche sémantique par similarité cosinus.
 */

/**
 * Calcule la similarité cosinus entre deux vecteurs.
 * Retourne une valeur entre -1 et 1 (1 = identiques).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}

/**
 * Normalise un vecteur (norme L2 = 1).
 */
export function normalizeVector(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
  if (norm === 0) return v;
  return v.map((x) => x / norm);
}

/**
 * Embedding TF-IDF léger pour la recherche textuelle.
 * Retourne un vecteur de dimension variable basé sur les termes.
 */
export function tfidfEmbed(text: string, vocabulary: string[]): number[] {
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);
  const wordCount = words.length;

  return vocabulary.map((term) => {
    const count = words.filter((w) => w.includes(term.toLowerCase())).length;
    return wordCount > 0 ? count / wordCount : 0;
  });
}

/**
 * Trouve les k éléments les plus similaires à un vecteur requête.
 */
export function findKNearest(
  query: number[],
  embeddings: Array<{ id: string; vector: number[] }>,
  k: number
): Array<{ id: string; similarity: number }> {
  return embeddings
    .map(({ id, vector }) => ({ id, similarity: cosineSimilarity(query, vector) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
}
