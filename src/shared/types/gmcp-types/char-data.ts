interface CharData {
  hp: number;
  max_hp: number;
  mana: number;
  max_mana: number;
  move: number;
  max_move: number;
  gold: number;
  silver: number;
  wimpy: number;
  str: number;
  max_str: number;
  int: number;
  max_int: number;
  wis: number;
  max_wis: number;
  dex: number;
  max_dex: number;
  con: number;
  max_con: number;
  stance: string;
  language: string;
  tnl: number;
  carry_weight: number;
  can_carry_weight: number;
  is_afk: boolean;
  is_quiet: boolean;
  is_flying: boolean;
  is_riding: boolean;
  is_fighting: boolean;
}

export default CharData;
