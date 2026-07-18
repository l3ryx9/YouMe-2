// À utiliser côté BACKEND uniquement (jamais dans du code exécuté navigateur)
// La clé service_role contourne les policies RLS : à garder strictement secrète.
import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
