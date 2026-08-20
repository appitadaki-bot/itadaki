import { S3BlobStorage } from './blob-storage';

/**
 * La región entra en la firma de cada pedido a S3.
 *
 * Si no coincide con la que espera el proveedor, toda subida falla con
 * `SignatureDoesNotMatch` — un mensaje que no menciona la región y que cuesta
 * horas encontrar. Por eso se deduce del endpoint en vez de depender de que
 * alguien la copie a mano en otra variable.
 */
describe('qué región firma cada endpoint', () => {
  const sinVariable = <T>(fn: () => T): T => {
    const previa = process.env['S3_REGION'];
    delete process.env['S3_REGION'];
    try {
      return fn();
    } finally {
      if (previa !== undefined) process.env['S3_REGION'] = previa;
    }
  };

  it('la saca del endpoint de Backblaze', () => {
    // Backblaze la lleva en el propio nombre del host.
    expect(sinVariable(() => S3BlobStorage.regionFor('https://s3.us-west-004.backblazeb2.com'))).toBe(
      'us-west-004',
    );
  });

  it('sirve para cualquier región de Backblaze', () => {
    expect(sinVariable(() => S3BlobStorage.regionFor('https://s3.eu-central-003.backblazeb2.com'))).toBe(
      'eu-central-003',
    );
  });

  it('la saca del endpoint de AWS', () => {
    expect(sinVariable(() => S3BlobStorage.regionFor('https://s3.us-east-1.amazonaws.com'))).toBe(
      'us-east-1',
    );
  });

  it('usa "auto" con Cloudflare R2, que es lo que R2 espera', () => {
    expect(
      sinVariable(() => S3BlobStorage.regionFor('https://abc123.r2.cloudflarestorage.com')),
    ).toBe('auto');
  });

  it('la variable declarada gana sobre lo que diga el endpoint', () => {
    // Escape hatch: un proveedor nuevo, o un endpoint propio detrás de un
    // dominio que no delata la región.
    const previa = process.env['S3_REGION'];
    process.env['S3_REGION'] = 'us-west-004';
    try {
      expect(S3BlobStorage.regionFor('https://fotos.mi-restaurante.com')).toBe('us-west-004');
    } finally {
      if (previa === undefined) delete process.env['S3_REGION'];
      else process.env['S3_REGION'] = previa;
    }
  });

  it('cae en "auto" con un endpoint que no dice nada', () => {
    expect(sinVariable(() => S3BlobStorage.regionFor('https://fotos.mi-restaurante.com'))).toBe(
      'auto',
    );
  });
});
