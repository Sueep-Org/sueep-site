function normalizeScaleMeasurementText(value = '') {
  if (value == null) return '';
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/,/g, '.')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+and\s+/g, ' ')
    .replace(/([0-9]+(?:\.[0-9]+)?(?:\/[0-9]+)?)\s*'\s*[-–—]\s*([0-9]+(?:\.[0-9]+)?(?:\/[0-9]+)?)\s*"/g, '$1 ft $2 in')
    .replace(/([0-9]+(?:\.[0-9]+)?(?:\/[0-9]+)?)'\s*([0-9]+(?:\.[0-9]+)?(?:\/[0-9]+)?)"/g, '$1 ft $2 in')
    .replace(/([0-9]+(?:\.[0-9]+)?(?:\/[0-9]+)?)\s*''/g, '$1 in')
    .replace(/([0-9]+(?:\.[0-9]+)?(?:\/[0-9]+)?)\s*"/g, '$1 in')
    .replace(/([0-9]+(?:\.[0-9]+)?(?:\/[0-9]+)?)\s*'/g, '$1 ft')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNumericValue(value) {
  if (value == null || value === '') return null;
  if (value.indexOf('/') >= 0) {
    const parts = value.split('/').map(Number);
    if (!parts[1] || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
    return parts[0] / parts[1];
  }
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : null;
}

function parseMeasurementToInches(str) {
  if (!str) return null;
  str = normalizeScaleMeasurementText(str);
  const quotedUnitMatch = str.match(/^([0-9]+(?:\.[0-9]+)?|[0-9]+\/[0-9]+)\s*(["'])$/i);
  if (quotedUnitMatch) {
    const numericValue = parseNumericValue(quotedUnitMatch[1]);
    if (numericValue == null) return null;
    return quotedUnitMatch[2] === "'" ? numericValue * 12 : numericValue;
  }
  const feetAndInchesMatch = str.match(/^([0-9]+(?:\.[0-9]+)?|[0-9]+\/[0-9]+)\s*(ft|feet|foot|')\s*([0-9]+(?:\.[0-9]+)?|[0-9]+\/[0-9]+)?\s*(in|inch|inches|")?$/i);
  if (feetAndInchesMatch) {
    const feet = parseNumericValue(feetAndInchesMatch[1]);
    const inches = feetAndInchesMatch[3] ? parseNumericValue(feetAndInchesMatch[3]) : 0;
    if (feet == null || inches == null) return null;
    return feet * 12 + inches;
  }
  const m = str.match(/^([0-9]+\/[0-9]+|[0-9]*\.?[0-9]+)\s*(in|inch|inches|ft|feet|cm|mm|m)?$/i);
  if (!m) return null;
  const val = m[1];
  const num = parseNumericValue(val);
  if (num == null) return null;
  const unit = (m[2] || 'in').toLowerCase();
  switch (unit) {
    case 'ft': case 'feet': return num * 12;
    case 'cm': return num / 2.54;
    case 'mm': return num / 25.4;
    case 'm': return num * 39.3700787;
    default: return num;
  }
}

function formatStandardScaleDenominator(denominator) {
  const numeric = Number(denominator);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  if (numeric >= 1 && Number.isInteger(numeric)) return `1/${numeric}`;
  const cleaned = Number(numeric.toFixed(4));
  if (!Number.isFinite(cleaned) || cleaned <= 0) return null;
  return `1/${cleaned}`;
}

function standardizeScaleExpression(expression = '') {
  const normalized = normalizeScaleMeasurementText(expression).replace(/\s+/g, ' ').trim();
  const ratioMatch = normalized.match(/^([^=]+?)\s*(?:=|:|to)\s*([^=]+)$/i);
  if (!ratioMatch) return null;
  let leftText = ratioMatch[1].trim();
  let rightText = ratioMatch[2].trim();
  let leftInches = parseMeasurementToInches(leftText);
  let rightInches = parseMeasurementToInches(rightText);
  if (!Number.isFinite(leftInches) || leftInches <= 0 || !Number.isFinite(rightInches) || rightInches <= 0) return null;
  const leftAppearsReal = /(?:ft|feet|foot|')/.test(leftText) && !/(?:in|inch|inches|")/.test(leftText);
  const rightAppearsReal = /(?:ft|feet|foot|')/.test(rightText) && !/(?:in|inch|inches|")/.test(rightText);
  if (leftAppearsReal && !rightAppearsReal) {
    [leftText, rightText] = [rightText, leftText];
    [leftInches, rightInches] = [rightInches, leftInches];
  }
  const denominator = formatStandardScaleDenominator(rightInches / leftInches);
  return denominator ? `${denominator} in = 1 ft` : null;
}

const examples = [
  '1/8" = 1\'',
  '3/16" = 1\'',
  '1/8 in = 1 ft',
  '1/8" = 1\'-0"',
  '1/8" = 1\' 0"',
  '3/16" = 1\' 0"'
];

examples.forEach(expr => {
  console.log(`${expr} => ${standardizeScaleExpression(expr)}`);
});
