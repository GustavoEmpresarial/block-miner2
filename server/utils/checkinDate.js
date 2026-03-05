export function getBrazilCheckinDateKey(date = new Date()) {
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const brDate = new Date(utc + 3600000 * -3);
  const yyyy = brDate.getFullYear();
  const mm = String(brDate.getMonth() + 1).padStart(2, "0");
  const dd = String(brDate.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
