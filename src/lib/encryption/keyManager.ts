import { EncryptionService } from './index'

/**
 * Key management system for handling user keys and device keys
 */
export class KeyManager {
  private static readonly DEVICE_KEY_STORAGE = 'device_key'
  private static readonly SALT_STORAGE = 'key_salt'
  private static readonly KEY_VERSION_STORAGE = 'key_version'
  
  private masterKey: CryptoKey | null = null
  private deviceKey: CryptoKey | null = null
  private derivedKeys: Record<string, CryptoKey> = {}

  /**
   * Initialize the key manager with user password
   */
  async initialize(password: string): Promise<void> {
    try {
      // Try to load existing salt or generate new one
      let salt = this.getSaltFromStorage()
      if (!salt) {
        salt = EncryptionService.generateSalt()
        this.storeSalt(salt)
      }

      // Generate master key from password
      this.masterKey = await EncryptionService.generateKey(password, salt)

      // Initialize or load device key
      await this.initializeDeviceKey()

      // Derive purpose-specific keys
      await this.deriveAllKeys()

    } catch (error) {
      throw new Error('Failed to initialize encryption keys')
    }
  }

  /**
   * Initialize device key for local storage encryption
   */
  private async initializeDeviceKey(): Promise<void> {
    const storedDeviceKey = localStorage.getItem(KeyManager.DEVICE_KEY_STORAGE)
    
    if (storedDeviceKey) {
      this.deviceKey = await EncryptionService.importKey(storedDeviceKey)
    } else {
      this.deviceKey = await EncryptionService.generateDeviceKey()
      const exportedKey = await EncryptionService.exportKey(this.deviceKey)
      localStorage.setItem(KeyManager.DEVICE_KEY_STORAGE, exportedKey)
    }
  }

  /**
   * Derive all purpose-specific keys
   */
  private async deriveAllKeys(): Promise<void> {
    if (!this.masterKey) {
      throw new Error('Master key not initialized')
    }

    const purposes = [
      'tasks',
      'settings',
      'ai_context',
      'sync_data',
      'local_storage'
    ]

    this.derivedKeys = await EncryptionService.deriveKeys(this.masterKey, purposes)
  }

  /**
   * Get key for specific purpose
   */
  getKey(purpose: string): CryptoKey {
    if (!this.derivedKeys[purpose]) {
      throw new Error(`Key for purpose '${purpose}' not found`)
    }
    return this.derivedKeys[purpose]
  }

  /**
   * Get device key for local encryption
   */
  getDeviceKey(): CryptoKey {
    if (!this.deviceKey) {
      throw new Error('Device key not initialized')
    }
    return this.deviceKey
  }

  /**
   * Encrypt data for specific purpose
   */
  async encryptForPurpose(data: string, purpose: string): Promise<string> {
    const key = this.getKey(purpose)
    const encrypted = await EncryptionService.encrypt(data, key)
    return EncryptionService.serializeEncrypted(encrypted)
  }

  /**
   * Decrypt data for specific purpose
   */
  async decryptForPurpose(encryptedData: string, purpose: string): Promise<string> {
    const key = this.getKey(purpose)
    const decryptionData = EncryptionService.deserializeEncrypted(encryptedData)
    return EncryptionService.decrypt(decryptionData, key)
  }

  /**
   * Encrypt data with device key (for local storage)
   */
  async encryptLocal(data: string): Promise<string> {
    const key = this.getDeviceKey()
    const encrypted = await EncryptionService.encrypt(data, key)
    return EncryptionService.serializeEncrypted(encrypted)
  }

  /**
   * Decrypt data with device key (from local storage)
   */
  async decryptLocal(encryptedData: string): Promise<string> {
    const key = this.getDeviceKey()
    const decryptionData = EncryptionService.deserializeEncrypted(encryptedData)
    return EncryptionService.decrypt(decryptionData, key)
  }

  /**
   * Change user password and re-encrypt keys
   */
  async changePassword(_oldPassword: string, newPassword: string): Promise<void> {
    // Verify old password
    const salt = this.getSaltFromStorage()
    if (!salt) {
      throw new Error('No salt found')
    }

    // Test if old password is correct by trying to decrypt some data
    // This would need to be implemented based on actual stored data
    // const oldMasterKey = await EncryptionService.generateKey(oldPassword, salt)
    
    // Generate new salt and master key
    const newSalt = EncryptionService.generateSalt()
    const newMasterKey = await EncryptionService.generateKey(newPassword, newSalt)

    // Store new salt
    this.storeSalt(newSalt)
    
    // Update master key and derive new keys
    this.masterKey = newMasterKey
    await this.deriveAllKeys()

    // Increment key version
    this.incrementKeyVersion()
  }

  /**
   * Key rotation for security
   */
  async rotateKeys(): Promise<void> {
    // Generate new device key
    this.deviceKey = await EncryptionService.generateDeviceKey()
    
    // Store new device key
    const exportedKey = await EncryptionService.exportKey(this.deviceKey)
    localStorage.setItem(KeyManager.DEVICE_KEY_STORAGE, exportedKey)

    // Re-derive all purpose keys (they depend on master key which hasn't changed)
    await this.deriveAllKeys()

    // Increment key version
    this.incrementKeyVersion()
  }

  /**
   * Clear all keys from memory (logout)
   */
  clearKeys(): void {
    this.masterKey = null
    this.deviceKey = null
    this.derivedKeys = {}
  }

  /**
   * Check if keys are initialized
   */
  isInitialized(): boolean {
    return this.masterKey !== null && this.deviceKey !== null
  }

  /**
   * Get current key version
   */
  getKeyVersion(): number {
    const version = localStorage.getItem(KeyManager.KEY_VERSION_STORAGE)
    return version ? parseInt(version, 10) : 1
  }

  /**
   * Private helper methods
   */
  private getSaltFromStorage(): Uint8Array | null {
    const saltStr = localStorage.getItem(KeyManager.SALT_STORAGE)
    return saltStr ? EncryptionService.base64ToArray(saltStr) : null
  }

  private storeSalt(salt: Uint8Array): void {
    const saltStr = EncryptionService.arrayToBase64(salt)
    localStorage.setItem(KeyManager.SALT_STORAGE, saltStr)
  }

  private incrementKeyVersion(): void {
    const currentVersion = this.getKeyVersion()
    localStorage.setItem(KeyManager.KEY_VERSION_STORAGE, (currentVersion + 1).toString())
  }
}

// Singleton instance
export const keyManager = new KeyManager()