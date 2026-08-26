import { modificadas, pendientes } from './migraciones-pendientes';

/**
 * El registro existe para que un archivo viejo no se reaplique sobre datos
 * nuevos. Pasó tres veces: una restricción de pagos que rechazaba un valor que
 * ella misma autorizó dos archivos después, una función cuyo tipo de retorno
 * ya había cambiado, y un UPDATE que marcaba verificadas las cuentas que
 * estaban esperando su mail. Ninguno de los tres síntomas se parecía a su
 * causa.
 */
describe('qué migraciones corren', () => {
  const archivos = ['001_a.sql', '002_b.sql', '003_c.sql'];

  it('corre todo en una base nueva', () => {
    expect(pendientes(archivos, [])).toEqual(archivos);
  });

  it('no vuelve a correr lo aplicado', () => {
    const aplicadas = [
      { name: '001_a.sql', checksum: 'aaa' },
      { name: '002_b.sql', checksum: 'bbb' },
    ];
    expect(pendientes(archivos, aplicadas)).toEqual(['003_c.sql']);
  });

  it('no corre nada cuando la base está al día', () => {
    const aplicadas = archivos.map((name) => ({ name, checksum: 'x' }));
    expect(pendientes(archivos, aplicadas)).toEqual([]);
  });

  it('respeta el orden de nombre', () => {
    const aplicadas = [{ name: '002_b.sql', checksum: 'bbb' }];
    expect(pendientes(archivos, aplicadas)).toEqual(['001_a.sql', '003_c.sql']);
  });

  /**
   * Una fila registrada de un archivo que ya no está —lo borraron, lo
   * renombraron— no puede hacer fallar nada: lo aplicado, aplicado está.
   */
  it('ignora lo registrado que ya no existe como archivo', () => {
    const aplicadas = [{ name: '000_borrada.sql', checksum: 'zzz' }];
    expect(pendientes(archivos, aplicadas)).toEqual(archivos);
  });
});

describe('qué migraciones cambiaron después de aplicarse', () => {
  it('encuentra la que fue editada', () => {
    const enDisco = new Map([
      ['001_a.sql', 'huella-nueva'],
      ['002_b.sql', 'bbb'],
    ]);
    const aplicadas = [
      { name: '001_a.sql', checksum: 'huella-vieja' },
      { name: '002_b.sql', checksum: 'bbb' },
    ];
    expect(modificadas(enDisco, aplicadas)).toEqual(['001_a.sql']);
  });

  it('no dice nada cuando ninguna cambió', () => {
    const enDisco = new Map([['001_a.sql', 'aaa']]);
    expect(modificadas(enDisco, [{ name: '001_a.sql', checksum: 'aaa' }])).toEqual([]);
  });

  /** Una migración nueva todavía no está aplicada: no cambió, va a correr. */
  it('no confunde una nueva con una editada', () => {
    const enDisco = new Map([['009_nueva.sql', 'nnn']]);
    expect(modificadas(enDisco, [])).toEqual([]);
  });

  it('ignora lo registrado que ya no está en disco', () => {
    expect(modificadas(new Map(), [{ name: '000_borrada.sql', checksum: 'zzz' }])).toEqual([]);
  });
});
