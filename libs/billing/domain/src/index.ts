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
export {
  type DescuentoEnEfectivo,
  type DescuentoError,
  aplicaA,
  consumoConDescuento,
  descuentoDe,
  montoDelDescuento,
} from './lib/descuento';
export {
  type MedioDeCobro,
  MEDIOS_DE_COBRO,
  LO_QUE_PASA_SI_ELIGE,
  MEDIOS_QUE_ELIGE_EL_MOZO,
  MEDIOS_QUE_ELIGE_LA_MESA,
  NOMBRE_DEL_MEDIO,
  cobradoDeLaCuenta,
  esMedioDeCobro,
  nombreDelMedio,
} from './lib/medio-de-cobro';
