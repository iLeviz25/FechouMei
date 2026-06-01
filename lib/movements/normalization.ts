const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";
const SAO_PAULO_OFFSET = "-03:00";

export function normalizeMovementDescription(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
}

export function normalizeMovementCategory(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
}

export function buildOccurredAtFromDateInput(dateInput: string, now = new Date()) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateInput) ? dateInput : toDateInputValue(now);
  const parts = getSaoPauloTimeParts(now);

  return `${date}T${parts.hour}:${parts.minute}:${parts.second}${SAO_PAULO_OFFSET}`;
}

export function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getSaoPauloTimeParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    second: "2-digit",
    timeZone: SAO_PAULO_TIME_ZONE,
  }).formatToParts(date);

  const valueByType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = valueByType.hour === "24" ? "00" : valueByType.hour;

  return {
    hour: hour?.padStart(2, "0") ?? "00",
    minute: valueByType.minute?.padStart(2, "0") ?? "00",
    second: valueByType.second?.padStart(2, "0") ?? "00",
  };
}
