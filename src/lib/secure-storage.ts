/**
 * Secure storage utility that uses sessionStorage for sensitive data
 * and localStorage for non-sensitive preferences
 */

export class SecureStorage {
  // Keys that should be stored in sessionStorage (sensitive data)
  private static readonly SENSITIVE_KEYS = [
    'currentProjectId',
    'currentCompanyId',
    'userPreferences',
    'pendingInvitation',
  ]
  
  /**
   * Set an item in storage
   */
  static setItem(key: string, value: any): void {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value)
    
    if (this.isSensitiveKey(key)) {
      sessionStorage.setItem(key, stringValue)
    } else {
      localStorage.setItem(key, stringValue)
    }
  }
  
  /**
   * Get an item from storage
   */
  static getItem(key: string): string | null {
    if (this.isSensitiveKey(key)) {
      return sessionStorage.getItem(key)
    }
    return localStorage.getItem(key)
  }
  
  /**
   * Get and parse JSON item from storage
   */
  static getJsonItem<T>(key: string): T | null {
    const item = this.getItem(key)
    if (!item) return null
    
    try {
      return JSON.parse(item) as T
    } catch {
      return null
    }
  }
  
  /**
   * Remove an item from storage
   */
  static removeItem(key: string): void {
    if (this.isSensitiveKey(key)) {
      sessionStorage.removeItem(key)
    } else {
      localStorage.removeItem(key)
    }
  }
  
  /**
   * Clear all sensitive data from sessionStorage
   */
  static clearSensitiveData(): void {
    this.SENSITIVE_KEYS.forEach(key => {
      sessionStorage.removeItem(key)
    })
  }
  
  /**
   * Clear all data from both storages
   */
  static clearAll(): void {
    // Clear sensitive data
    this.clearSensitiveData()
    
    // Clear non-sensitive data that we manage
    const keysToKeep = ['tcp-agent-theme'] // Keep theme preference
    const allKeys = Object.keys(localStorage)
    
    allKeys.forEach(key => {
      if (!keysToKeep.includes(key)) {
        localStorage.removeItem(key)
      }
    })
  }
  
  /**
   * Check if a key is sensitive
   */
  private static isSensitiveKey(key: string): boolean {
    return this.SENSITIVE_KEYS.includes(key)
  }
  
  /**
   * Migrate existing localStorage data to appropriate storage
   */
  static migrateStorage(): void {
    this.SENSITIVE_KEYS.forEach(key => {
      const value = localStorage.getItem(key)
      if (value !== null) {
        sessionStorage.setItem(key, value)
        localStorage.removeItem(key)
      }
    })
  }
}

// Run migration on module load
SecureStorage.migrateStorage()