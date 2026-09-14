/** Weeks belong to the month their Monday falls in. */
export function goalWeekSlots(month: string) {
  const cursor = new Date(`${month}-01T12:00:00Z`);
  cursor.setUTCDate(1 + ((8 - cursor.getUTCDay()) % 7));
  const slots: { periodStart: string; periodEnd: string }[] = [];
  while (cursor.toISOString().slice(0, 7) === month) {
    const end = new Date(cursor);
    end.setUTCDate(end.getUTCDate() + 6);
    slots.push({
      periodStart: cursor.toISOString().slice(0, 10),
      periodEnd: end.toISOString().slice(0, 10),
    });
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return slots;
}
