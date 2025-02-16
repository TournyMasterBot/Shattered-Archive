import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class SummonElemental implements IAbility {
  private static instance: SummonElemental;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Summon Elemental";
    this.helpFile = `help 'Summon Elemental'
'SUMMON ELEMENTAL'
'SUMMON ELEMENTAL'
Syntax:  cast 'summon elemental' fire
         cast 'summon elemental' water
         cast 'summon elemental' earth
         cast 'summon elemental' air
This spell allows clerics to summon the elemental forces of nature into
the form of a creature which will aid the caster until dismissed, dispelled,
or otherwise destroyed.
See also:  DISMISS CLERICS`;
    this.manualDescription = `Earth Elemental
Creature: an earth elemental Race: unique
an earth elemental appears to be a more neutral soul.
Their wealth appears to be 0 gold and 0 silver
They appear to be none.
The base health of this creature is 1820.
The base magically ability of this creature is 112.
This creature is upon the cycle of training '54'
This creature does 5d11 damage in a wrath manner.
The creature has the following characteristics:
Offensive Tactics:bash berserk parry rescue
Immunities: charm
Resistances: blunt fire mental
Vulnerbilities: cold drowning
This creature is affected by detect_invis detect_hidden charm flying pass_door

Air Elemental
Creature: an air elemental Race: unique
an air elemental appears to be a more neutral soul.
Their wealth appears to be 0 gold and 0 silver
They appear to be none.
The base health of this creature is 1820.
The base magically ability of this creature is 109.
This creature is upon the cycle of training '54'
This creature does 5d11 damage in a shock manner.
The creature has the following characteristics:
Offensive Tactics:disarm dodge fast rescue
Immunities: charm
Resistances: weapon mental
Vulnerbilities: negative holy
This creature is affected by detect_invis detect_hidden charm flying pass_door

Fire Elemental
Creature: a fire elemental Race: unique
a fire elemental appears to be a more neutral soul.
Their wealth appears to be 0 gold and 0 silver
They appear to be none.
The base health of this creature is 1820.
The base magically ability of this creature is 113.
This creature is upon the cycle of training '51'
This creature does 5d10 damage in a flame manner.
The creature has the following characteristics:
Offensive Tactics:berserk dodge fast rescue
Immunities: charm
Resistances: mental light
Vulnerbilities: cold drowning
This creature is affected by detect_invis detect_hidden charm flying pass_door

Water Elemental
Creature: a water elemental Race: unique
a water elemental appears to be a more neutral soul.
Their wealth appears to be 0 gold and 0 silver
They appear to be none.
The base health of this creature is 1540.
The base magically ability of this creature is 111.
This creature is upon the cycle of training '54'
This creature does 5d11 damage in a chill manner.
The creature has the following characteristics:
Offensive Tactics:disarm dodge rescue
Immunities: charm drowning
Resistances: blunt cold mental
Vulnerbilities: fire
This creature is affected by detect_invis detect_hidden charm flying pass_door`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (SummonElemental.instance === undefined) {
      SummonElemental.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): SummonElemental {
    if (!SummonElemental.instance) {
      SummonElemental.instance = new SummonElemental();
    }
    return SummonElemental.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return SummonElemental.GetInstance() as T;
  }
}

export default SummonElemental;
