import { type Result, err, ok } from '@itadaki/shared/domain';
import { type Role } from './role';

export interface StaffUser {
  readonly id: string;
  readonly tenantId: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: Role;
  readonly active: boolean;
}

/** What a verified session carries. Never includes the password hash. */
export interface StaffSession {
  readonly userId: string;
  readonly tenantId: string;
  readonly role: Role;
  readonly displayName: string;
  readonly expiresAt: Date;
}

export type CredentialError =
  | { readonly kind: 'INVALID_EMAIL'; readonly email: string }
  | { readonly kind: 'PASSWORD_TOO_SHORT'; readonly length: number }
  | { readonly kind: 'PASSWORD_TOO_COMMON' }
  | { readonly kind: 'PASSWORD_TOO_OBVIOUS'; readonly palabra: string }
  | { readonly kind: 'PASSWORD_FILTRADA' };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * El largo mínimo al elegir una contraseña.
 *
 * Doce y no ocho: lo que protege de que alguien pruebe de a una es el tope por
 * intento, y lo que protege si alguna vez se filtra la base es el largo. Ocho
 * caracteres con scrypt se rompen en una tarde con una placa de video.
 *
 * Sólo se exige al elegirla. Quien ya tiene una de ocho sigue entrando: la
 * regla nueva no puede dejar a un dueño afuera de su propio restaurante.
 */
export const MIN_PASSWORD_LENGTH = 12;

/**
 * Passwords an attacker tries first.
 *
 * Deliberately a short list and no complexity rules: demanding a symbol and a
 * digit mostly produces "Password1!", which is on every cracking list anyway.
 * Blocking what actually gets guessed first is worth more than a rule that
 * pushes people toward a predictable shape.
 */
const TOO_COMMON = new Set([
  'password', 'password1', 'contraseña', 'contrasena', '12345678', '123456789',
  '1234567890', 'qwertyui', 'qwerty123', 'iloveyou', 'admin123', 'administrador',
  'restaurante', 'itadaki', 'itadaki123', 'bienvenido', 'argentina', 'bocajuniors',
  'riverplate', 'password123', 'abc12345', '11111111', '00000000',
]);

/** Whether this is one of the handful an attacker guesses first. */
export function isTooCommon(password: string): boolean {
  return TOO_COMMON.has(password.trim().toLowerCase());
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * De qué no puede estar hecha una contraseña: lo que rodea a quien la elige.
 *
 * El nombre del restaurante y la parte del mail antes del arroba son las dos
 * primeras cosas que prueba cualquiera que sepa a quién le está apuntando, y
 * son justo las que uno elige cuando tiene que inventar algo rápido.
 */
export interface ContextoDeLaClave {
  readonly email?: string | undefined;
  readonly nombreDelLocal?: string | undefined;
}

/** Las palabras del contexto que valen la pena mirar, normalizadas. */
function palabrasDe(contexto: ContextoDeLaClave): string[] {
  const crudas = [
    contexto.email?.split('@')[0] ?? '',
    contexto.nombreDelLocal ?? '',
    'itadaki',
  ];

  return crudas
    .flatMap((texto) => texto.toLowerCase().split(/[^a-z0-9]+/i))
    .map((palabra) =>
      palabra
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase(),
    )
    // Menos de cuatro letras aparece por casualidad adentro de cualquier cosa:
    // bloquear "don" dejaría afuera media contraseña legítima.
    .filter((palabra) => palabra.length >= 4);
}

/**
 * Si la contraseña está hecha de lo que tiene a mano quien la elige.
 *
 * Sin acentos a los dos lados: "enchulame" tiene que pegar con "Enchulame" y
 * con "Máquina2026" igual que con "Maquina2026".
 */
function esObvia(password: string, contexto: ContextoDeLaClave): string | null {
  const limpia = password
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

  return palabrasDe(contexto).find((palabra) => limpia.includes(palabra)) ?? null;
}

/**
 * Las reglas de elegir una contraseña nueva.
 *
 * Largo, lista de las más probadas, y nada del contexto. Lo que NO hay es
 * exigir mayúscula, número y símbolo: eso produce "Password1!", que está en
 * todas las listas de cracking igual, y empuja a anotarla en un papel al lado
 * de la caja.
 *
 * Lo que de verdad tumba una cuenta —una contraseña repetida de otro sitio
 * que se filtró— no se ve desde acá: eso lo mira el adaptador que consulta
 * la lista de filtradas, porque necesita salir a la red.
 */
export function validarContrasenaNueva(
  password: string,
  contexto: ContextoDeLaClave = {},
): Result<string, CredentialError> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return err({ kind: 'PASSWORD_TOO_SHORT', length: password.length });
  }
  if (isTooCommon(password)) {
    return err({ kind: 'PASSWORD_TOO_COMMON' });
  }

  const palabra = esObvia(password, contexto);
  if (palabra !== null) {
    return err({ kind: 'PASSWORD_TOO_OBVIOUS', palabra });
  }
  return ok(password);
}

/** @deprecated Usá `validarContrasenaNueva`, que además mira el contexto. */
export function validatePassword(password: string): Result<string, CredentialError> {
  return validarContrasenaNueva(password);
}

/**
 * Sólo la forma, para entrar.
 *
 * Las reglas de elegir no se le aplican a quien ya tiene su contraseña: si el
 * login exigiera el largo nuevo, subirlo dejaría a todos los dueños de antes
 * afuera de su propio restaurante, y con un "credenciales inválidas" que no
 * explica nada.
 */
export function credencialesDeLogin(
  email: string,
  password: string,
): Result<{ email: string; password: string }, CredentialError> {
  const normalised = normaliseEmail(email);
  if (!EMAIL_PATTERN.test(normalised)) {
    return err({ kind: 'INVALID_EMAIL', email });
  }
  if (password === '') {
    return err({ kind: 'PASSWORD_TOO_SHORT', length: 0 });
  }
  return ok({ email: normalised, password });
}

/**
 * Mail y contraseña nueva, para cuando se crea una cuenta.
 *
 * Validated before hashing, so a rejected password never reaches storage.
 * Para entrar no sirve: ahí va `credencialesDeLogin`, que no exige nada de lo
 * que se exige al elegir.
 */
export function validateCredentials(
  email: string,
  password: string,
  contexto: ContextoDeLaClave = {},
): Result<{ email: string; password: string }, CredentialError> {
  const normalised = normaliseEmail(email);
  if (!EMAIL_PATTERN.test(normalised)) {
    return err({ kind: 'INVALID_EMAIL', email });
  }

  const revisada = validarContrasenaNueva(password, { email: normalised, ...contexto });
  if (revisada.isErr()) {
    return err(revisada.error);
  }
  return ok({ email: normalised, password });
}

export function isSessionValid(session: StaffSession, now: Date): boolean {
  return session.expiresAt.getTime() > now.getTime();
}
