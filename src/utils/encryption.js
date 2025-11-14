import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getSecretKey() {
  const SECRET_KEY = process.env.ENCRYPTION_SECRET_KEY;
  
  if (!SECRET_KEY) {
    throw new Error('ENCRYPTION_SECRET_KEY is not set in environment variables. Generate with: openssl rand -hex 32');
  }

  if (SECRET_KEY.length !== 64) {
    throw new Error('ENCRYPTION_SECRET_KEY must be 64 hex characters (32 bytes). Generate with: openssl rand -hex 32');
  }
  
  return SECRET_KEY;
}

/**
 * Шифрует текст
 * @param {string} text - Текст для шифрования
 * @returns {object} - Объект с зашифрованными данными
 */
export function encrypt(text) {
  if (!text) return null;
  
  const SECRET_KEY = getSecretKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(SECRET_KEY, 'hex'), iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

/**
 * Расшифровывает текст
 * @param {object} encryptedData - Объект с зашифрованными данными
 * @returns {string} - Расшифрованный текст
 */
export function decrypt(encryptedData) {
  if (!encryptedData || !encryptedData.encrypted) return null;
  
  const SECRET_KEY = getSecretKey();
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(SECRET_KEY, 'hex'),
    Buffer.from(encryptedData.iv, 'hex')
  );
  
  decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
  
  let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

