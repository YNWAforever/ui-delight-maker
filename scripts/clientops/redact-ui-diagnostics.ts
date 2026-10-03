/** Keep native browser failures useful without publishing request credentials. */
export function redactUiDiagnostic(message: unknown): string {
  return String(message)
    .replace(/\bpostgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[database URL]")
    .split(/\r?\n/)
    .map((line) =>
      /\b(?:cookie|authorization|bearer|password|secret|(?:access|refresh|session)[_-]?token|connection[_-]?string|(?:x[_-]?)?api[_-]?key)\b/i.test(
        line,
      )
        ? "[credential diagnostic omitted]"
        : line,
    )
    .join("\n")
    .replace(/https?:\/\/[^\s]+/g, "[URL]")
    .replace(/[\w.+-]+@[\w.-]+/g, "[email]")
    .slice(0, 600);
}
