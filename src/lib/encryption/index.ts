/**
 * Client-side encryption service using AES-256-GCM
 * Implements zero-knowledge architecture where all data is encrypted client-side
 */

interface EncryptionResult {
  iv: Uint8Array
  data: Uint8Array
}

interface DecryptionData {
  iv: Uint8Array
  data: Uint8Array
}

export class EncryptionService {
  private static readonly ALGORITHM = 'AES-GCM'
  private static readonly KEY_LENGTH = 256
  private static readonly IV_LENGTH = 16
  private static readonly TAG_LENGTH = 16

  /**
   * Generate a master key from password using PBKDF2
   */
  static async generateKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder()
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    )

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt as BufferSource,
        iterations: 175000, // High iteration count for security
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: this.ALGORITHM, length: this.KEY_LENGTH },
      false,
      ['encrypt', 'decrypt']
    )
  }

  /**
   * Generate a random salt for key derivation
   */
  static generateSalt(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(32))
  }

  /**
   * Generate a random IV for encryption
   */
  private static generateIV(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(this.IV_LENGTH))
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  static async encrypt(data: string, key: CryptoKey): Promise<EncryptionResult> {
    const encoder = new TextEncoder()
    const iv = this.generateIV()
    
    const encrypted = await crypto.subtle.encrypt(
      {
        name: this.ALGORITHM,
        iv: iv as BufferSource,
        tagLength: this.TAG_LENGTH * 8
      },
      key,
      encoder.encode(data)
    )

    return {
      iv,
      data: new Uint8Array(encrypted)
    }
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  static async decrypt(encryptedData: DecryptionData, key: CryptoKey): Promise<string> {
    try {
      const decrypted = await crypto.subtle.decrypt(
        {
          name: this.ALGORITHM,
          iv: encryptedData.iv as BufferSource,
          tagLength: this.TAG_LENGTH * 8
        },
        key,
        encryptedData.data as BufferSource
      )

      const decoder = new TextDecoder()
      return decoder.decode(decrypted)
    } catch (error) {
      throw new Error('Failed to decrypt data. Invalid key or corrupted data.')
    }
  }

  /**
   * Convert Uint8Array to base64 for storage
   */
  static arrayToBase64(array: Uint8Array): string {
    return btoa(String.fromCharCode(...array))
  }

  /**
   * Convert base64 string back to Uint8Array
   */
  static base64ToArray(base64: string): Uint8Array {
    return new Uint8Array(
      atob(base64)
        .split('')
        .map(char => char.charCodeAt(0))
    )
  }

  /**
   * Serialize encryption result for storage
   */
  static serializeEncrypted(result: EncryptionResult): string {
    return JSON.stringify({
      iv: this.arrayToBase64(result.iv),
      data: this.arrayToBase64(result.data)
    })
  }

  /**
   * Deserialize stored encrypted data
   */
  static deserializeEncrypted(serialized: string): DecryptionData {
    const parsed = JSON.parse(serialized)
    return {
      iv: this.base64ToArray(parsed.iv),
      data: this.base64ToArray(parsed.data)
    }
  }

  /**
   * Generate a device-specific key for local storage encryption
   */
  static async generateDeviceKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(
      {
        name: this.ALGORITHM,
        length: this.KEY_LENGTH
      },
      true,
      ['encrypt', 'decrypt']
    )
  }

  /**
   * Export key for storage
   */
  static async exportKey(key: CryptoKey): Promise<string> {
    const exported = await crypto.subtle.exportKey('raw', key)
    return this.arrayToBase64(new Uint8Array(exported))
  }

  /**
   * Import key from storage
   */
  static async importKey(keyData: string): Promise<CryptoKey> {
    const keyArray = this.base64ToArray(keyData)
    return crypto.subtle.importKey(
      'raw',
      keyArray as BufferSource,
      { name: this.ALGORITHM },
      true,
      ['encrypt', 'decrypt']
    )
  }

  /**
   * Key rotation - re-encrypt data with new key
   */
  static async rotateKey(
    encryptedData: string,
    oldKey: CryptoKey,
    newKey: CryptoKey
  ): Promise<string> {
    const decrypted = await this.decrypt(this.deserializeEncrypted(encryptedData), oldKey)
    const reEncrypted = await this.encrypt(decrypted, newKey)
    return this.serializeEncrypted(reEncrypted)
  }

  /**
   * Derive multiple keys from master key for different purposes using PBKDF2
   */
  static async deriveKeys(masterKey: CryptoKey, purposes: string[]): Promise<Record<string, CryptoKey>> {
    const keys: Record<string, CryptoKey> = {}
    
    // First export the master key to get the raw bytes
    const rawMasterKey = await crypto.subtle.exportKey('raw', masterKey)
    
    for (const purpose of purposes) {
      // Use purpose as salt for PBKDF2
      const purposeBytes = new TextEncoder().encode(purpose)
      const salt = new Uint8Array(32)
      salt.set(purposeBytes.slice(0, Math.min(purposeBytes.length, 32)))
      
      // Create a new key from raw bytes for PBKDF2
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        rawMasterKey,
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
      )
      
      // Derive key using PBKDF2
      const derivedKeyMaterial = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: 10000, // Lower iterations for derived keys
          hash: 'SHA-256'
        },
        keyMaterial,
        256 // 256 bits for AES-256
      )
      
      keys[purpose] = await crypto.subtle.importKey(
        'raw',
        derivedKeyMaterial,
        { name: this.ALGORITHM },
        false,
        ['encrypt', 'decrypt']
      )
    }
    
    return keys
  }
}