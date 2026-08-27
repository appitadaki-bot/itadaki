export {
  type Bill,
  type BillLine,
  type BillParticipant,
  type BillStatus,
  isSettled,
  lineTotal,
  billSubtotal,
  subtotalFor,
  displayIn,
} from './lib/bill';
export {
  type SplitKind,
  type SplitShare,
  type SplitError,
  type SplitStrategy,
  type ItemAssignment,
  type CustomAmount,
  singlePayerSplit,
  equalSplit,
  byDinerSplit,
  byItemSplit,
  customSplit,
  sharesTotal,
} from './lib/bill-split';
export { type Tip, type TipError, NO_TIP, TIP_PRESETS, tipAmount, totalWithTip } from './lib/tip';
export { distributeTip } from './lib/tip-distribution';
export {
  type DescuentoEnEfectivo,
  type DescuentoError,
  aplicaA,
  consumoConDescuento,
  descuentoDe,
  montoDelDescuento,
} from './lib/descuento';
