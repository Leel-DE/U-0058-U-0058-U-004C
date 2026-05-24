import type { ProductSpecs } from './types';

const YEAR_RE = /\b(20[0-3]\d)\b/;
const BATTERY_RE = /\b(\d{3,4})\s?wh\b/i;
const WHEEL_RE = /\b(20|24|26|27\.5|28|29)\s?(?:zoll|inch|")\b/i;
const TRAVEL_RE = /\b(\d{2,3})\s?mm\b/i;
const WEIGHT_RE = /\b(\d{1,2}(?:[.,]\d)?)\s?kg\b/i;

const MOTOR_HINTS = [
  'bosch performance cx',
  'bosch performance line',
  'bosch active line',
  'shimano ep8',
  'shimano ep6',
  'yamaha pw',
  'fazua ride',
  'brose drive',
];

const BRAKE_HINTS = ['shimano deore', 'shimano xt', 'sram code', 'magura mt', 'tektro'];
const FRAME_HINTS = ['carbon', 'aluminium', 'aluminum', 'alu', 'steel', 'stahl'];

export function extractProductSpecs(title: string, brand?: string | null, extraText = ''): ProductSpecs {
  const text = `${title} ${extraText}`.replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();
  const specs: ProductSpecs = {};
  if (brand) specs.brand = brand;

  const year = text.match(YEAR_RE)?.[1];
  if (year) specs.year = Number(year);

  const battery = text.match(BATTERY_RE)?.[1];
  if (battery) {
    specs.batteryWh = Number(battery);
    specs.battery = `${battery} Wh`;
  }

  const wheel = text.match(WHEEL_RE)?.[1];
  if (wheel) specs.wheelSize = `${wheel}"`;

  const travel = text.match(TRAVEL_RE)?.[1];
  if (travel) specs.travelMm = Number(travel);

  const weight = text.match(WEIGHT_RE)?.[1];
  if (weight) specs.weightKg = Number(weight.replace(',', '.'));

  specs.motor = MOTOR_HINTS.find((hint) => lower.includes(hint));
  specs.brakes = BRAKE_HINTS.find((hint) => lower.includes(hint));
  const frame = FRAME_HINTS.find((hint) => lower.includes(hint));
  if (frame) specs.frameMaterial = frame === 'alu' ? 'aluminium' : frame;

  if (/\be-?mtb\b|mountain/i.test(text)) specs.bikeType = 'e-mtb';
  else if (/trekking|city|urban/i.test(text)) specs.bikeType = 'trekking';
  else if (/gravel/i.test(text)) specs.bikeType = 'gravel';
  else if (/road|rennrad/i.test(text)) specs.bikeType = 'road';

  const color = text.match(/\b(red|blue|green|black|white|grey|gray|silver|gold|rot|schwarz|weiss|blau|grun)\b/i)?.[1];
  if (color) specs.color = color.toLowerCase();

  const size = text.match(/\b(xs|s|m|l|xl|xxl|\d{2}\s?cm)\b/i)?.[1];
  if (size) specs.size = size.toUpperCase().replace(/\s+/g, '');

  return specs;
}
