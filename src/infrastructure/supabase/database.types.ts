/**
 * Types générés manuellement pour la base Supabase.
 * Remplace la génération automatique `supabase gen types typescript`.
 * Mettez à jour ce fichier si vous modifiez le schéma SQL.
 */
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  // Requis par @supabase/supabase-js >= 2.45 : sans ce marqueur, createClient<Database>
  // ne peut plus résoudre les types de colonnes et tous les .from(table) retournent `never`.
  __InternalSupabase: {
    PostgrestVersion: '12';
  };
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          username: string;
          display_name: string;
          photo_url: string | null;
          bio: string | null;
          is_online: boolean;
          last_seen: string | null;
          created_at: string;
          updated_at: string;
          is_email_verified: boolean;
          ai_enabled: boolean;
          fcm_token: string | null;
          native_fcm_token: string | null;
          e2e_public_key: string | null;
        };
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'created_at' | 'updated_at'> &
          Partial<Pick<Database['public']['Tables']['users']['Row'], 'created_at' | 'updated_at'>>;
        Update: Partial<Omit<Database['public']['Tables']['users']['Row'], 'created_at'>>;
        Relationships: [];
      };
      app_logs: {
        Row: {
          id: string;
          level: string;
          context: string;
          code: string | null;
          message: string;
          stack: string | null;
          user_id: string | null;
          platform: string | null;
          app_version: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['app_logs']['Row'], 'id' | 'created_at'> &
          Partial<Pick<Database['public']['Tables']['app_logs']['Row'], 'id' | 'created_at'>>;
        Update: Partial<Database['public']['Tables']['app_logs']['Row']>;
        Relationships: [];
      };
      usernames: {
        Row: { username: string; uid: string };
        Insert: { username: string; uid: string };
        Update: Partial<{ username: string; uid: string }>;
        Relationships: [];
      };
      public_profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string;
          photo_url: string | null;
          bio: string | null;
          is_online: boolean;
          last_seen: string | null;
          e2e_public_key: string | null;
        };
        Insert: Database['public']['Tables']['public_profiles']['Row'];
        Update: Partial<Database['public']['Tables']['public_profiles']['Row']>;
        Relationships: [];
      };
      conversations: {
        Row: {
          id: string;
          participant_ids: string[];
          last_message: Json | null;
          unread_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['conversations']['Row'], 'created_at' | 'updated_at' | 'last_message'> &
          Partial<Pick<Database['public']['Tables']['conversations']['Row'], 'created_at' | 'updated_at' | 'last_message'>>;
        Update: Partial<Omit<Database['public']['Tables']['conversations']['Row'], 'created_at'>>;
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string;
          receiver_id: string;
          type: string;
          content: string | null;
          voice_local_path: string | null;
          voice_duration: number | null;
          image_local_path: string | null;
          video_local_path: string | null;
          storage_url: string | null;
          status: string;
          is_deleted: boolean;
          ai_analysis: Json | null;
          reactions: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['messages']['Row'], 'created_at' | 'updated_at'> &
          Partial<Pick<Database['public']['Tables']['messages']['Row'], 'created_at' | 'updated_at'>>;
        Update: Partial<Omit<Database['public']['Tables']['messages']['Row'], 'created_at'>>;
        Relationships: [];
      };
      partner_requests: {
        Row: {
          id: string;
          sender_id: string;
          sender_username: string;
          sender_display_name: string;
          sender_photo_url: string | null;
          receiver_id: string;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['partner_requests']['Row'], 'created_at' | 'updated_at'> &
          Partial<Pick<Database['public']['Tables']['partner_requests']['Row'], 'created_at' | 'updated_at'>>;
        Update: Partial<Omit<Database['public']['Tables']['partner_requests']['Row'], 'created_at'>>;
        Relationships: [];
      };
      partners: {
        Row: {
          user_id: string;
          partner_id: string;
          partner_username: string;
          partner_display_name: string;
          partner_photo_url: string | null;
          conversation_id: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['partners']['Row'], 'created_at'> &
          Partial<Pick<Database['public']['Tables']['partners']['Row'], 'created_at'>>;
        Update: Partial<Database['public']['Tables']['partners']['Insert']>;
        Relationships: [];
      };
      location_shares: {
        Row: {
          id: string;
          user_id: string;
          conversation_id: string;
          latitude: number;
          longitude: number;
          accuracy: number | null;
          speed: number | null;
          is_mocked: boolean;
          is_stealth_update: boolean;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['location_shares']['Row'], 'id' | 'updated_at'> &
          Partial<Pick<Database['public']['Tables']['location_shares']['Row'], 'updated_at'>>;
        Update: Partial<Omit<Database['public']['Tables']['location_shares']['Row'], 'id'>>;
        Relationships: [];
      };
      location_requests: {
        Row: {
          id: string;
          target_user_id: string;
          conversation_id: string;
          requester_id: string;
          requested_at: string;
        };
        Insert: Omit<Database['public']['Tables']['location_requests']['Row'], 'id' | 'requested_at'> &
          Partial<Pick<Database['public']['Tables']['location_requests']['Row'], 'id' | 'requested_at'>>;
        Update: Partial<Database['public']['Tables']['location_requests']['Insert']>;
        Relationships: [];
      };
      stealth_tracking: {
        Row: {
          user_id: string;
          enabled: boolean;
          requester_id: string;
          conversation_id: string;
          activated_at: string;
        };
        Insert: Database['public']['Tables']['stealth_tracking']['Row'];
        Update: Partial<Database['public']['Tables']['stealth_tracking']['Row']>;
        Relationships: [];
      };
      profils_personnalite: {
        Row: {
          id: string;
          conversation_id: string;
          personne_id: string;
          traits: Json;
          ton: string | null;
          sujets_recurrents: string[] | null;
          historique_emotions: Json;
          conseils_comportementaux: string[] | null;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['profils_personnalite']['Row'], 'id' | 'updated_at'> &
          Partial<Pick<Database['public']['Tables']['profils_personnalite']['Row'], 'id' | 'updated_at'>>;
        Update: Partial<Database['public']['Tables']['profils_personnalite']['Row']>;
        Relationships: [];
      };
      comportements: {
        Row: {
          id: string;
          conversation_id: string;
          personne_id: string;
          type: 'negatif' | 'positif';
          categorie: string | null;
          description: string;
          extrait_message: string | null;
          confiance: 'faible' | 'moyenne' | 'forte' | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['comportements']['Row'], 'id' | 'created_at'> &
          Partial<Pick<Database['public']['Tables']['comportements']['Row'], 'id' | 'created_at'>>;
        Update: Partial<Database['public']['Tables']['comportements']['Row']>;
        Relationships: [];
      };
      scores_relationnels: {
        Row: {
          conversation_id: string;
          personne_id: string;
          score_redflag: number;
          score_greenflag: number;
          resume: string | null;
          nb_messages_analyses: number;
          updated_at: string;
        };
        Insert: Database['public']['Tables']['scores_relationnels']['Row'];
        Update: Partial<Database['public']['Tables']['scores_relationnels']['Row']>;
        Relationships: [];
      };
      resumes_quotidiens: {
        Row: {
          id: string;
          conversation_id: string;
          date: string;
          resume: string;
          variations_humeur: Json;
          signes_possibles_deni: string[] | null;
          indicateurs_tromperie: string[] | null;
          risque_tromperie_estime: number | null;
          risque_tromperie_label: 'faible' | 'modéré' | 'élevé' | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['resumes_quotidiens']['Row'], 'id' | 'created_at'> &
          Partial<Pick<Database['public']['Tables']['resumes_quotidiens']['Row'], 'id' | 'created_at'>>;
        Update: Partial<Database['public']['Tables']['resumes_quotidiens']['Row']>;
        Relationships: [];
      };
      faits_cles: {
        Row: {
          id: string;
          conversation_id: string;
          personne_id: string;
          fait: string;
          citation: string | null;
          message_id: string | null;
          prononce_le: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['faits_cles']['Row'], 'id' | 'created_at'> &
          Partial<Pick<Database['public']['Tables']['faits_cles']['Row'], 'id' | 'created_at'>>;
        Update: Partial<Database['public']['Tables']['faits_cles']['Row']>;
        Relationships: [];
      };
      incoherences: {
        Row: {
          id: string;
          conversation_id: string;
          personne_id: string;
          type: 'contradiction' | 'changement_version' | 'chronologique' | 'factuel';
          citation1: string;
          date1: string;
          citation2: string;
          date2: string;
          explication: string;
          gravite: 'faible' | 'modérée' | 'élevée';
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['incoherences']['Row'], 'id' | 'created_at'> &
          Partial<Pick<Database['public']['Tables']['incoherences']['Row'], 'id' | 'created_at'>>;
        Update: Partial<Database['public']['Tables']['incoherences']['Row']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      enregistrer_analyse_flags_temps_reel: {
        Args: {
          p_conversation_id: string;
          p_flags: Json;
          p_score_greenflag: number;
          p_score_redflag: number;
          p_resume: string;
          p_nb_messages: number;
        };
        Returns: void;
      };
      analyse_quotidienne_manquante: {
        Args: { p_conversation_id: string };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
  };
}
