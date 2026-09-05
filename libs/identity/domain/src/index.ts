export {
  ROLES,
  type Role,
  PERMISSIONS,
  type Permission,
  can,
  permissionsOf,
  isRole,
  entraConPin,
  entraConMail,
} from './lib/role';
export {
  type StaffUser,
  type StaffSession,
  type CredentialError,
  MIN_PASSWORD_LENGTH,
  normaliseEmail,
  validateCredentials,
  isTooCommon,
  validatePassword,
  isSessionValid,
} from './lib/staff';
export {
  type Tenant,
  type SignUpError,
  slugify,
  prepareTenant,
  uniqueSlug,
} from './lib/tenant';
export {
  TRIAL_DAYS,
  WARN_WITHIN_DAYS,
  type SubscriptionStatus,
  type Subscription,
  type TrialInput,
  daysUntil,
  trialEndFor,
  describeSubscription,
  arrancaElTrial,
  canEditConfiguration,
  canTakeOrders,
  graceDaysLeft,
  GRACE_DAYS,
} from './lib/subscription';
export {
  type AvisoDePago,
  type EfectoDelAviso,
  type EstadoDePago,
  efectoDe,
  nuevoVencimiento,
} from './lib/pago-recibido';
export { type ResenaError, linkDeResena, pideResenas } from './lib/resena-google';
export {
  COMO_TIENE_LA_CARTA,
  type ComoTieneLaCarta,
  type Interesado,
  type InteresadoError,
  validarInteresado,
} from './lib/interesado';
export {
  type UsuarioError,
  INTENTOS_ANTES_DE_TRABAR,
  LARGO_DEL_PIN,
  MINUTOS_TRABADA,
  estaTrabada,
  trasElIntento,
  nombreDeUsuario,
  nuevoPin,
  pareceUnPin,
  usuarioLibre,
} from './lib/usuario-y-pin';
export {
  correoDeVencimiento,
  diasDeGraciaQueQuedan,
  finDeLaGracia,
  hayQueAvisar,
  type CorreoDeVencimiento,
  type RestauranteVencido,
} from './lib/aviso-de-vencimiento';
export {
  correoDeInteresado,
  destinatariosDelAviso,
  type CorreoDeInteresado,
} from './lib/aviso-de-interesado';
