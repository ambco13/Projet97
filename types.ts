
export interface Contact {
  id: string;
  name: string;
  phone: string;
  role: string;
}

export interface EmergencyLog {
  id: string;
  timestamp: string;
  type: 'TRIGGER' | 'AUDIO' | 'LOCATION' | 'DETERRENCE' | 'SYSTEM';
  detail: string;
  coordinates?: { lat: number; lng: number };
}

export type AppState = 'SETUP' | 'PROTECTED' | 'EMERGENCY' | 'DEACTIVATING';

export interface AppConfig {
  pin: string;
  contacts: Contact[];
  guardianNetwork: boolean;
  language: string;
  protectionEnabled: boolean;
}
