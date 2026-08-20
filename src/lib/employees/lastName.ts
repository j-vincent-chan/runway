/** Sort key: last token of the display name (handles "First Last"). */
export function employeeLastNameKey(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  return (parts[parts.length - 1] ?? name).toLowerCase();
}

export function compareEmployeesByLastName(
  a: { name: string },
  b: { name: string }
): number {
  const byLast = employeeLastNameKey(a.name).localeCompare(employeeLastNameKey(b.name));
  if (byLast !== 0) return byLast;
  return a.name.localeCompare(b.name);
}
