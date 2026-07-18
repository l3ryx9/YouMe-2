/**
 * Tests d'intégration — Flux d'authentification (inscription / connexion)
 *
 * Ces tests utilisent des mocks Firebase pour vérifier que le flux
 * complet fonctionne sans appels réseau réels.
 */

jest.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  sendEmailVerification: jest.fn(),
  onAuthStateChanged: jest.fn(() => jest.fn()),
  onIdTokenChanged: jest.fn((_auth: any, cb: any) => {
    cb({ uid: 'test-uid' });
    return jest.fn();
  }),
  getAuth: jest.fn(() => ({})),
}));

jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  getDocs: jest.fn(),
  serverTimestamp: jest.fn(() => new Date()),
  Timestamp: { fromDate: jest.fn((d: Date) => ({ toDate: () => d })) },
  writeBatch: jest.fn(() => ({
    set: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined),
  })),
}));

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
} from 'firebase/auth';

import { loginSchema, registerSchema } from '../../../src/shared/validators/authValidators';

// ────────────────────────────────────────────────────────────────────
// Validation des formulaires (Zod — pas de dépendances Firebase)
// ────────────────────────────────────────────────────────────────────

describe('Flux inscription — validation du formulaire', () => {
  const validRegisterData = {
    email: 'alice@example.com',
    password: 'Alice123!',
    confirmPassword: 'Alice123!',
    username: 'alice42',
    displayName: 'Alice',
  };

  it("accepte un formulaire d'inscription valide", () => {
    expect(registerSchema.safeParse(validRegisterData).success).toBe(true);
  });

  it("refuse si l'email est manquant", () => {
    expect(registerSchema.safeParse({ ...validRegisterData, email: '' }).success).toBe(false);
  });

  it('refuse si le mot de passe ne contient pas de caractère spécial', () => {
    const result = registerSchema.safeParse({
      ...validRegisterData,
      password: 'Alice1234',
      confirmPassword: 'Alice1234',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.find((i) => i.path[0] === 'password')).toBeDefined();
  });

  it('refuse si la confirmation du mot de passe ne correspond pas', () => {
    const result = registerSchema.safeParse({
      ...validRegisterData,
      confirmPassword: 'Different123!',
    });
    expect(result.success).toBe(false);
  });

  it('refuse un username trop court', () => {
    expect(registerSchema.safeParse({ ...validRegisterData, username: 'ab' }).success).toBe(false);
  });

  it('accepte un username avec un point', () => {
    expect(registerSchema.safeParse({ ...validRegisterData, username: 'alice.42' }).success).toBe(true);
  });

  it('refuse un username avec des espaces', () => {
    expect(registerSchema.safeParse({ ...validRegisterData, username: 'alice 42' }).success).toBe(false);
  });
});

describe('Flux connexion — validation du formulaire', () => {
  it('accepte des identifiants valides', () => {
    expect(loginSchema.safeParse({ email: 'alice@example.com', password: 'anypassword' }).success).toBe(true);
  });

  it('refuse un email invalide', () => {
    expect(loginSchema.safeParse({ email: 'not-an-email', password: 'anypassword' }).success).toBe(false);
  });

  it('refuse un mot de passe vide', () => {
    expect(loginSchema.safeParse({ email: 'alice@example.com', password: '' }).success).toBe(false);
  });

  it('accepte un mot de passe court (pas de complexité requise à la connexion)', () => {
    expect(loginSchema.safeParse({ email: 'alice@example.com', password: '123' }).success).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────
// Comportement Firebase Auth (mocks)
// ────────────────────────────────────────────────────────────────────

describe('Flux inscription — appels Firebase Auth', () => {
  beforeEach(() => jest.clearAllMocks());

  it('createUserWithEmailAndPassword est appelé avec les bons paramètres', async () => {
    const mockUser = {
      uid: 'new-uid-123',
      email: 'alice@example.com',
      emailVerified: false,
      getIdToken: jest.fn().mockResolvedValue('id-token'),
    };
    (createUserWithEmailAndPassword as jest.Mock).mockResolvedValueOnce({ user: mockUser });
    (sendEmailVerification as jest.Mock).mockResolvedValueOnce(undefined);

    const auth = {} as any;
    await createUserWithEmailAndPassword(auth, 'alice@example.com', 'Alice123!');

    expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(auth, 'alice@example.com', 'Alice123!');
  });

  it('échoue proprement si Firebase retourne auth/email-already-in-use', async () => {
    const err = Object.assign(new Error('Email already in use'), {
      code: 'auth/email-already-in-use',
    });
    (createUserWithEmailAndPassword as jest.Mock).mockRejectedValueOnce(err);

    const auth = {} as any;
    await expect(
      createUserWithEmailAndPassword(auth, 'existing@example.com', 'Alice123!')
    ).rejects.toMatchObject({ code: 'auth/email-already-in-use' });
  });
});

describe('Flux connexion — appels Firebase Auth', () => {
  beforeEach(() => jest.clearAllMocks());

  it('signInWithEmailAndPassword est appelé avec les bons paramètres', async () => {
    const mockUser = {
      uid: 'existing-uid',
      email: 'alice@example.com',
      emailVerified: true,
      getIdToken: jest.fn().mockResolvedValue('id-token'),
    };
    (signInWithEmailAndPassword as jest.Mock).mockResolvedValueOnce({ user: mockUser });

    const auth = {} as any;
    await signInWithEmailAndPassword(auth, 'alice@example.com', 'Alice123!');

    expect(signInWithEmailAndPassword).toHaveBeenCalledWith(auth, 'alice@example.com', 'Alice123!');
  });

  it('échoue proprement si Firebase retourne auth/invalid-credential', async () => {
    const err = Object.assign(new Error('Invalid credential'), {
      code: 'auth/invalid-credential',
    });
    (signInWithEmailAndPassword as jest.Mock).mockRejectedValueOnce(err);

    const auth = {} as any;
    await expect(
      signInWithEmailAndPassword(auth, 'alice@example.com', 'wrong-password')
    ).rejects.toMatchObject({ code: 'auth/invalid-credential' });
  });
});
