/**
 * KeyStorage — Stockage sécurisé des clés privées E2E
 * Utilise expo-secure-store : données chiffrées par le keychain OS,
 * jamais synchronisées ni envoyées au serveur.
 */
import * as SecureStore from 'expo-secure-store';

const PRIVATE_KEY_PREFIX = 'e2e_privkey_';

export const KeyStorage = {
  async savePrivateKey(uid: string, privateKeyB64: string): Promise<void> {
    await SecureStore.setItemAsync(PRIVATE_KEY_PREFIX + uid, privateKeyB64, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },

  async getPrivateKey(uid: string): Promise<string | null> {
    return SecureStore.getItemAsync(PRIVATE_KEY_PREFIX + uid);
  },

  async deletePrivateKey(uid: string): Promise<void> {
    await SecureStore.deleteItemAsync(PRIVATE_KEY_PREFIX + uid);
  },
};
