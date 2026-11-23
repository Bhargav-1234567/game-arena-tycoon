export const ORIGINAL_CHARACTERS = [
  { id: 'aarav', name: 'Aarav', gender: 'male', role: 'customer', path: '/assets/models/characters/original/customer_aarav.glb', gamePath: '/assets/models/characters/original/customer_aarav_game.glb' },
  { id: 'kabir', name: 'Kabir', gender: 'male', role: 'customer', path: '/assets/models/characters/original/customer_kabir.glb', gamePath: '/assets/models/characters/original/customer_kabir_game.glb' },
  { id: 'rohan', name: 'Rohan', gender: 'male', role: 'customer', path: '/assets/models/characters/original/customer_rohan.glb', gamePath: '/assets/models/characters/original/customer_rohan_game.glb' },
  { id: 'meera', name: 'Meera', gender: 'female', role: 'customer', path: '/assets/models/characters/original/customer_meera.glb', gamePath: '/assets/models/characters/original/customer_meera_game.glb' },
  { id: 'anaya', name: 'Anaya', gender: 'female', role: 'customer', path: '/assets/models/characters/original/customer_anaya.glb', gamePath: '/assets/models/characters/original/customer_anaya_game.glb' },
  { id: 'isha', name: 'Isha', gender: 'female', role: 'receptionist', path: '/assets/models/characters/original/receptionist_isha.glb', gamePath: '/assets/models/characters/original/receptionist_isha_game.glb' }
] as const;

export const CUSTOMER_CHARACTERS = ORIGINAL_CHARACTERS.filter((character) => character.role === 'customer');
export const RECEPTIONIST_CHARACTER = ORIGINAL_CHARACTERS.find((character) => character.role === 'receptionist')!;
