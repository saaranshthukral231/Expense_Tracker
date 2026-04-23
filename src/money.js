const MONEY_PATTERN = /^(?:0|[1-9]\d*)(?:\.(\d{1,2}))?$/;

function parseAmountToPaise(value) {
  const normalized = String(value ?? '').trim();

  if (!MONEY_PATTERN.test(normalized)) {
    throw new Error('Amount must be a positive number with up to two decimal places.');
  }

  const [rupeesPart, paisePart = ''] = normalized.split('.');
  const totalPaise = Number(rupeesPart) * 100 + Number(paisePart.padEnd(2, '0'));

  if (!Number.isSafeInteger(totalPaise) || totalPaise <= 0) {
    throw new Error('Amount must be greater than zero.');
  }

  return totalPaise;
}

function formatPaise(amountPaise) {
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 0) {
    throw new Error('Amount must be a non-negative integer number of paise.');
  }

  const rupees = Math.floor(amountPaise / 100);
  const paise = String(amountPaise % 100).padStart(2, '0');
  return `${rupees}.${paise}`;
}

module.exports = {
  formatPaise,
  parseAmountToPaise,
};
