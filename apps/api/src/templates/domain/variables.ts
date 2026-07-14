/** Resolves a template's declared variable names against a context of known
 * values, in order — variables[0] fills {{1}}, variables[1] fills {{2}}, etc.
 * A variable name the context doesn't recognize resolves to "" rather than
 * throwing, since CUSTOM templates may reference variables no automatic
 * sender knows how to fill. */
export function resolveTemplateParams(variables: string[], context: Record<string, string>): string[] {
  return variables.map((name) => context[name] ?? "");
}
