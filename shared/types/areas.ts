export interface Floor {
  id: string;
  name: string;
  level: number | null;
}

export interface Area {
  id: string;
  name: string;
  floor_id: string | null;
  icon: string | null;
  aliases: string[];
}

export const FLOORS: Floor[] = [
  { id: 'attic', name: 'Attic', level: 3 },
  { id: 'upstairs', name: 'Upstairs', level: 2 },
  { id: 'main_floor', name: 'Main Floor', level: 1 },
  { id: 'main', name: 'Outdoors', level: null },
  { id: 'technology', name: 'Technology', level: null },
];

export const AREAS: Area[] = [
  { id: '7ab45e6c3daa4f6fb5be6c41a8477a5a', name: "Asher's Bedroom", floor_id: 'upstairs', icon: null, aliases: [] },
  { id: 'system', name: 'Attic', floor_id: 'attic', icon: null, aliases: [] },
  { id: 'backyard', name: 'Backyard', floor_id: 'main', icon: null, aliases: [] },
  { id: '497e0e4b9c024b418f9ad1012ac0a607', name: 'Bathroom Suite', floor_id: 'main_floor', icon: null, aliases: [] },
  { id: 'boys_bathroom', name: 'Boys Bathroom', floor_id: 'upstairs', icon: null, aliases: [] },
  { id: 'f51beaf21563495897829e971d748ad2', name: 'Dining and Entry', floor_id: 'main_floor', icon: null, aliases: [] },
  { id: '5e381d6a86ea4e9187b609f0ee6d776d', name: 'Exterior', floor_id: 'main', icon: null, aliases: [] },
  { id: 'front_porch', name: 'Front Porch', floor_id: 'main', icon: null, aliases: [] },
  { id: '19ff4d3f107a40b6b9fb5d5d3286ba21', name: 'Game Room', floor_id: 'upstairs', icon: null, aliases: [] },
  { id: 'garage', name: 'Garage', floor_id: 'main_floor', icon: null, aliases: [] },
  { id: 'meghan_s_office', name: 'Guest Room', floor_id: 'main_floor', icon: null, aliases: [] },
  { id: 'e5459ce674a2413db021c981cba209da', name: 'Kitchen', floor_id: 'main_floor', icon: null, aliases: [] },
  { id: 'laundry_room', name: 'Laundry Room', floor_id: 'main_floor', icon: null, aliases: [] },
  { id: 'levis_bedroom', name: "Levi's Bedroom", floor_id: 'upstairs', icon: null, aliases: [] },
  { id: 'f9a4c709625e4bbeb1ed2738f553ced5', name: 'Living Room', floor_id: 'main_floor', icon: null, aliases: [] },
  { id: '0d29420636684b359c5ae362eebcb218', name: 'Main Bedroom', floor_id: 'main_floor', icon: null, aliases: [] },
  { id: 'efb3aec330e6471fa134e90fb3801cb8', name: 'Movie Room', floor_id: 'upstairs', icon: null, aliases: [] },
  { id: 'network', name: 'Network', floor_id: 'technology', icon: null, aliases: [] },
  { id: 'office', name: 'Office', floor_id: 'main_floor', icon: null, aliases: [] },
  { id: 'patio', name: 'Patio', floor_id: 'main', icon: null, aliases: [] },
  { id: 'plumbing_and_water', name: 'Plumbing', floor_id: 'technology', icon: null, aliases: [] },
  { id: 'pool', name: 'Pool', floor_id: 'main', icon: null, aliases: [] },
  { id: 'downstairs_guest_bathroom', name: 'Powder Room', floor_id: 'main_floor', icon: null, aliases: [] },
  { id: 'power', name: 'Power', floor_id: 'technology', icon: null, aliases: [] },
  { id: 'sloanes_bathroom', name: "Sloane's Bathroom", floor_id: 'upstairs', icon: null, aliases: [] },
  { id: 'f69f9f21721d42ccac43dc883ac9ec93', name: "Sloane's Bedroom", floor_id: 'upstairs', icon: null, aliases: [] },
  { id: 'stairs', name: 'Stairs', floor_id: 'main_floor', icon: null, aliases: [] },
  { id: 'piano', name: 'Top of Stairs', floor_id: 'upstairs', icon: null, aliases: [] },
  { id: 'master_bedroom', name: 'Master Bedroom', floor_id: null, icon: null, aliases: [] },
];
