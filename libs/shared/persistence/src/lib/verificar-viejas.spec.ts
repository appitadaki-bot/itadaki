import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La 023 marca verificadas las cuentas que existían antes de que la
 * verificación existiera.
 *
 * El riesgo no es el UPDATE sino cuándo corre: las migraciones se aplican
 * enteras en cada despliegue. Sin acotarla, marcaría las cuentas que están
 * esperando el click en ese momento —alguien que se anotó ayer y no abrió el
 * mail— y la verificación dejaría de servir sin que nada lo delate.
 *
 * Se lee el archivo en vez de correrlo porque no hay Postgres en los tests;
 * lo que se fija acá es la condición, que es donde estuvo el error.
 */
describe('marcar verificadas las cuentas viejas', () => {
  const sql = readFileSync(
    join(process.cwd(), 'libs/shared/persistence/src/lib/migrations/023_verificar_las_viejas.sql'),
    'utf8',
  );

  it('sólo toca las que no tienen una verificación esperando', () => {
    expect(sql).toContain('verify_digest IS NULL');
  });

  it('sólo toca las que no están verificadas', () => {
    expect(sql).toContain('email_verified_at IS NULL');
  });

  /**
   * Una cuenta recién anotada tiene su token guardado. Si la migración no
   * mirara eso, el próximo despliegue la verificaría por ella.
   */
  it('no marca todo lo que esté sin verificar', () => {
    const condicion = sql.slice(sql.indexOf('UPDATE staff_users'));
    expect(condicion).toMatch(/WHERE[\s\S]*AND/);
  });

  it('fija el alcance del restaurante en cada vuelta', () => {
    // Con RLS en FORCE, sin esto el UPDATE no ve ninguna fila y no falla.
    expect(sql).toContain("set_config('app.tenant_id'");
  });
});
