import { supabase } from './supabase';
import type { ThoughtNode } from '../core/types';
import type { Region } from '../core/types';

export interface GalaxyState {
  nodes: ThoughtNode[];
  clusterNames: Partial<Record<Region, string>> | null;
  tilt?: number;
}

export async function loadUserGalaxy(userId: string): Promise<GalaxyState | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('user_galaxies')
    .select('state')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('Supabase select user_galaxies failed:', error);
    throw error;
  }
  if (!data?.state) return null;
  return data.state as GalaxyState;
}

export async function saveUserGalaxy(userId: string, state: GalaxyState): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('user_galaxies')
    .upsert(
      { user_id: userId, state, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) {
    console.error('Supabase upsert user_galaxies failed:', error);
    throw error;
  }
}
