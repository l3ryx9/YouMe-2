import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "L'email est requis")
    .email('Adresse email invalide'),
  password: z
    .string()
    .min(1, 'Le mot de passe est requis'),
});

export const registerSchema = z.object({
  email: z
    .string()
    .min(1, "L'email est requis")
    .email('Adresse email invalide'),
  password: z
    .string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
    .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule')
    .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre')
    .regex(/[^A-Za-z0-9]/, 'Le mot de passe doit contenir au moins un caractère spécial'),
  confirmPassword: z
    .string()
    .min(1, 'Veuillez confirmer votre mot de passe'),
  username: z
    .string()
    .min(3, "Le nom d'utilisateur doit contenir au moins 3 caractères")
    .max(20, "Le nom d'utilisateur ne peut pas dépasser 20 caractères")
    .regex(
      /^[a-zA-Z0-9_.]+$/,
      "Le nom d'utilisateur ne peut contenir que des lettres, chiffres, . et _"
    ),
  displayName: z
    .string()
    .min(2, 'Le nom affiché doit contenir au moins 2 caractères')
    .max(50, 'Le nom affiché ne peut pas dépasser 50 caractères'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Les mots de passe ne correspondent pas',
  path: ['confirmPassword'],
});

export const resetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
    .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule')
    .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre')
    .regex(/[^A-Za-z0-9]/, 'Le mot de passe doit contenir au moins un caractère spécial'),
  confirmPassword: z
    .string()
    .min(1, 'Veuillez confirmer votre mot de passe'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Les mots de passe ne correspondent pas',
  path: ['confirmPassword'],
});

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, "L'email est requis")
    .email('Adresse email invalide'),
});

export type LoginFormData     = z.infer<typeof loginSchema>;
export type RegisterFormData  = z.infer<typeof registerSchema>;
export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordFormData  = z.infer<typeof resetPasswordSchema>;

export interface PasswordStrengthResult {
  score: number;
  label: string;
  color: string;
}

/**
 * Calcule la force d'un mot de passe.
 * Retourne un score de 0 à 100, un libellé et une couleur associée.
 */
export function getPasswordStrength(password: string): PasswordStrengthResult {
  if (!password) {
    return { score: 0, label: 'Très faible', color: '#DC2626' };
  }

  let score = 0;
  if (password.length >= 8) score += 20;
  if (password.length >= 12) score += 10;
  if (/[a-z]/.test(password)) score += 15;
  if (/[A-Z]/.test(password)) score += 15;
  if (/[0-9]/.test(password)) score += 15;
  if (/[^A-Za-z0-9]/.test(password)) score += 25;

  score = Math.min(score, 100);

  if (score >= 90) return { score, label: 'Très fort', color: '#16A34A' };
  if (score >= 70) return { score, label: 'Fort', color: '#65A30D' };
  if (score >= 50) return { score, label: 'Moyen', color: '#F59E0B' };
  if (score >= 30) return { score, label: 'Faible', color: '#F97316' };
  return { score, label: 'Très faible', color: '#DC2626' };
}
